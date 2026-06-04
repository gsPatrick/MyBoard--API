const { Project, ProjectDetail } = require("../../models");
const AppError = require("../../utils/app-error");
const { encryptSecret, decryptSecret } = require("../../utils/crypto");
const { DETAIL_CATEGORIES, DETAIL_VALUE_TYPES } = require("../../config/constants");
const { assertResourceTenant } = require("../../utils/request-context");

function normalizeKey(key) {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function validateDetailPayload(payload, { partial = false } = {}) {
  if (!partial || payload.category !== undefined) {
    if (payload.category && !DETAIL_CATEGORIES.includes(payload.category)) {
      throw new AppError("Categoria inválida", 400, "VALIDATION_ERROR");
    }
  }

  if (!partial || payload.value_type !== undefined) {
    if (payload.value_type && !DETAIL_VALUE_TYPES.includes(payload.value_type)) {
      throw new AppError("value_type inválido", 400, "VALIDATION_ERROR");
    }
  }

  if (!partial) {
    if (!payload.key?.trim()) {
      throw new AppError("key é obrigatório", 400, "VALIDATION_ERROR");
    }
    if (!payload.label?.trim()) {
      throw new AppError("label é obrigatório", 400, "VALIDATION_ERROR");
    }
  }
}

function prepareValueFields(payload) {
  const valueType = payload.value_type || "text";
  const isSecret = payload.is_secret === true || valueType === "secret";

  let valueText = payload.value_text ?? null;
  let valueJson = payload.value_json ?? null;

  if (valueType === "json") {
    if (payload.value !== undefined) {
      valueJson = typeof payload.value === "string" ? JSON.parse(payload.value) : payload.value;
    }
    valueText = null;
  } else if (payload.value !== undefined) {
    valueText = String(payload.value);
  }

  if (isSecret && valueText) {
    valueText = encryptSecret(valueText);
  }

  return {
    value_type: isSecret ? "secret" : valueType,
    value_text: valueText,
    value_json: valueJson,
    is_secret: isSecret,
  };
}

function sanitizeDetailForResponse(detail, { revealSecrets = false } = {}) {
  const plain = detail.toJSON ? detail.toJSON() : { ...detail };

  if (plain.is_secret && !revealSecrets) {
    plain.value_text = plain.value_text ? "********" : null;
    plain.value = "********";
  } else if (plain.is_secret && revealSecrets && plain.value_text) {
    try {
      plain.value_text = decryptSecret(plain.value_text);
      plain.value = plain.value_text;
    } catch {
      plain.value_text = null;
      plain.value = null;
    }
  } else if (plain.value_type === "json") {
    plain.value = plain.value_json;
  } else {
    plain.value = plain.value_text;
  }

  return plain;
}

function sanitizeDetailsForResponse(details, options = {}) {
  return details.map((detail) => sanitizeDetailForResponse(detail, options));
}

async function ensureProjectExists(projectId, ctx) {
  const project = await Project.findByPk(projectId);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  return project;
}

async function listDetails(projectId, query = {}, ctx) {
  await ensureProjectExists(projectId, ctx);

  const where = { project_id: projectId };
  if (query.category && DETAIL_CATEGORIES.includes(query.category)) {
    where.category = query.category;
  }

  const details = await ProjectDetail.findAll({
    where,
    order: [
      ["category", "ASC"],
      ["sort_order", "ASC"],
      ["created_at", "ASC"],
    ],
  });

  const revealSecrets = query.revealSecrets === "true";
  return sanitizeDetailsForResponse(details, { revealSecrets });
}

async function getDetailById(projectId, detailId, options = {}, ctx) {
  await ensureProjectExists(projectId, ctx);

  const detail = await ProjectDetail.findOne({
    where: { id: detailId, project_id: projectId },
  });

  if (!detail) {
    throw new AppError("Detalhe não encontrado", 404, "DETAIL_NOT_FOUND");
  }

  return sanitizeDetailForResponse(detail, {
    revealSecrets: options.revealSecrets === true,
  });
}

async function createDetail(projectId, payload, ctx) {
  await ensureProjectExists(projectId, ctx);
  validateDetailPayload(payload);

  const key = normalizeKey(payload.key);
  const existing = await ProjectDetail.findOne({ where: { project_id: projectId, key } });
  if (existing) {
    throw new AppError("Já existe um detalhe com esta key neste projeto", 409, "DUPLICATE_KEY");
  }

  const valueFields = prepareValueFields(payload);

  const detail = await ProjectDetail.create({
    project_id: projectId,
    category: payload.category || "custom",
    key,
    label: payload.label.trim(),
    ...valueFields,
    sort_order: payload.sort_order ?? 0,
    metadata: payload.metadata || {},
  });

  return sanitizeDetailForResponse(detail);
}

async function bulkCreateDetails(projectId, items = [], ctx) {
  const results = [];
  for (const item of items) {
    results.push(await createDetail(projectId, item, ctx));
  }
  return results;
}

// Cria ou atualiza um detalhe pela `key` (idempotente) — usado na ingestão por IA
// para não duplicar credenciais/itens quando o mesmo arquivo é reenviado.
async function upsertDetailByKey(projectId, payload, ctx) {
  await ensureProjectExists(projectId, ctx);
  validateDetailPayload(payload);

  const key = normalizeKey(payload.key);
  const existing = await ProjectDetail.findOne({ where: { project_id: projectId, key } });

  if (!existing) {
    return createDetail(projectId, payload, ctx);
  }

  return updateDetail(projectId, existing.id, { ...payload, key }, ctx);
}

async function updateDetail(projectId, detailId, payload, ctx) {
  await ensureProjectExists(projectId, ctx);
  const detail = await ProjectDetail.findOne({
    where: { id: detailId, project_id: projectId },
  });

  if (!detail) {
    throw new AppError("Detalhe não encontrado", 404, "DETAIL_NOT_FOUND");
  }

  validateDetailPayload(payload, { partial: true });

  const updates = {};

  if (payload.category !== undefined) updates.category = payload.category;
  if (payload.label !== undefined) updates.label = payload.label.trim();
  if (payload.sort_order !== undefined) updates.sort_order = payload.sort_order;
  if (payload.metadata !== undefined) updates.metadata = payload.metadata;

  if (payload.key !== undefined) {
    const key = normalizeKey(payload.key);
    const duplicate = await ProjectDetail.findOne({
      where: { project_id: projectId, key, id: { [require("sequelize").Op.ne]: detailId } },
    });
    if (duplicate) {
      throw new AppError("Já existe um detalhe com esta key neste projeto", 409, "DUPLICATE_KEY");
    }
    updates.key = key;
  }

  if (
    payload.value !== undefined ||
    payload.value_text !== undefined ||
    payload.value_json !== undefined ||
    payload.value_type !== undefined ||
    payload.is_secret !== undefined
  ) {
    Object.assign(
      updates,
      prepareValueFields({
        value_type: payload.value_type ?? detail.value_type,
        value_text: payload.value_text,
        value_json: payload.value_json,
        value: payload.value,
        is_secret: payload.is_secret ?? detail.is_secret,
      })
    );
  }

  await detail.update(updates);
  return sanitizeDetailForResponse(detail);
}

async function deleteDetail(projectId, detailId, ctx) {
  await ensureProjectExists(projectId, ctx);
  const detail = await ProjectDetail.findOne({
    where: { id: detailId, project_id: projectId },
  });

  if (!detail) {
    throw new AppError("Detalhe não encontrado", 404, "DETAIL_NOT_FOUND");
  }

  await detail.destroy();
}

async function getDetailsGroupedByCategory(projectId, options = {}, ctx) {
  const details = await listDetails(projectId, options, ctx);
  return details.reduce((acc, detail) => {
    if (!acc[detail.category]) acc[detail.category] = [];
    acc[detail.category].push(detail);
    return acc;
  }, {});
}

module.exports = {
  listDetails,
  getDetailById,
  createDetail,
  bulkCreateDetails,
  upsertDetailByKey,
  updateDetail,
  deleteDetail,
  getDetailsGroupedByCategory,
  sanitizeDetailForResponse,
  sanitizeDetailsForResponse,
};
