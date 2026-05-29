const { Tag, ClientTag, ProjectTag } = require("../../models");
const AppError = require("../../utils/app-error");
const { TAG_SCOPES } = require("../../config/constants");
const { slugify } = require("../../utils/crypto");
const {
  applyTenantFilter,
  resolveTenantIdForWrite,
} = require("../../utils/request-context");

const DEFAULT_TAGS = [
  { name: "VIP", slug: "vip", color: "#ef4444", scope: "both", importance_weight: 100 },
  { name: "Urgente", slug: "urgente", color: "#f97316", scope: "both", importance_weight: 80 },
  { name: "Recorrente", slug: "recorrente", color: "#3b82f6", scope: "client", importance_weight: 40 },
  { name: "Manutenção", slug: "manutencao", color: "#8b5cf6", scope: "project", importance_weight: 30 },
  { name: "Legado", slug: "legado", color: "#6b7280", scope: "project", importance_weight: 10 },
];

async function seedDefaultTagsForTenant(tenantId, transaction = null) {
  const options = transaction ? { transaction } : {};

  for (const tag of DEFAULT_TAGS) {
    await Tag.create(
      {
        tenant_id: tenantId,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        scope: tag.scope,
        importance_weight: tag.importance_weight,
      },
      options
    );
  }
}

async function listTags(query = {}, ctx) {
  const where = applyTenantFilter({}, ctx);

  if (query.scope && TAG_SCOPES.includes(query.scope)) {
    where.scope = query.scope;
  }

  return Tag.findAll({
    where,
    order: [
      ["importance_weight", "DESC"],
      ["name", "ASC"],
    ],
  });
}

async function createTag(payload, ctx) {
  if (!payload.name?.trim()) {
    throw new AppError("Nome da tag é obrigatório", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);
  const slug = slugify(payload.slug || payload.name);

  const existing = await Tag.findOne({ where: { tenant_id: tenantId, slug } });
  if (existing) {
    throw new AppError("Já existe uma tag com este slug", 409, "DUPLICATE_SLUG");
  }

  return Tag.create({
    tenant_id: tenantId,
    name: payload.name.trim(),
    slug,
    color: payload.color || "#6366f1",
    scope: payload.scope || "both",
    importance_weight: payload.importance_weight ?? 0,
  });
}

async function syncClientTags(clientId, tagIds = [], ctx) {
  if (!Array.isArray(tagIds)) return;

  await ClientTag.destroy({ where: { client_id: clientId } });

  if (tagIds.length === 0) return;

  const where = applyTenantFilter({ id: tagIds }, ctx);
  const tags = await Tag.findAll({ where });

  if (tags.length !== tagIds.length) {
    throw new AppError("Uma ou mais tags são inválidas para esta organização", 400, "VALIDATION_ERROR");
  }

  await ClientTag.bulkCreate(tags.map((tag) => ({ client_id: clientId, tag_id: tag.id })));
}

async function syncProjectTags(projectId, tagIds = [], ctx) {
  if (!Array.isArray(tagIds)) return;

  await ProjectTag.destroy({ where: { project_id: projectId } });

  if (tagIds.length === 0) return;

  const where = applyTenantFilter({ id: tagIds }, ctx);
  const tags = await Tag.findAll({ where });

  if (tags.length !== tagIds.length) {
    throw new AppError("Uma ou mais tags são inválidas para esta organização", 400, "VALIDATION_ERROR");
  }

  await ProjectTag.bulkCreate(tags.map((tag) => ({ project_id: projectId, tag_id: tag.id })));
}

module.exports = {
  listTags,
  createTag,
  syncClientTags,
  syncProjectTags,
  seedDefaultTagsForTenant,
};
