const { Op } = require("sequelize");
const { Project, ProjectFinancialEntry, Client } = require("../../models");
const AppError = require("../../utils/app-error");
const { FINANCIAL_ENTRY_TYPES } = require("../../config/constants");
const {
  applyTenantFilter,
  assertResourceTenant,
} = require("../../utils/request-context");

async function ensureProjectExists(projectId, ctx) {
  const project = await Project.findByPk(projectId);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  return project;
}

function validateEntryPayload(payload, { partial = false } = {}) {
  if (!partial || payload.entry_type !== undefined) {
    if (payload.entry_type && !FINANCIAL_ENTRY_TYPES.includes(payload.entry_type)) {
      throw new AppError("Tipo de lançamento inválido", 400, "VALIDATION_ERROR");
    }
  }

  if (!partial || payload.amount !== undefined) {
    const amount = parseFloat(payload.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new AppError("Valor inválido", 400, "VALIDATION_ERROR");
    }
  }

  if (!partial) {
    if (!payload.title?.trim()) {
      throw new AppError("Título é obrigatório", 400, "VALIDATION_ERROR");
    }
    if (!payload.entry_date) {
      throw new AppError("Data é obrigatória", 400, "VALIDATION_ERROR");
    }
  }
}

const entryInclude = [
  {
    model: Project,
    as: "project",
    attributes: ["id", "name", "slug", "budget", "client_id", "status"],
    include: [
      {
        model: Client,
        as: "client",
        attributes: ["id", "name", "company"],
      },
    ],
  },
];

async function listProjectEntries(projectId, ctx) {
  await ensureProjectExists(projectId, ctx);

  return ProjectFinancialEntry.findAll({
    where: { project_id: projectId },
    include: entryInclude,
    order: [
      ["entry_date", "DESC"],
      ["created_at", "DESC"],
    ],
  });
}

async function listEntriesForTenant(query = {}, ctx) {
  const entryWhere = {};
  const projectWhere = applyTenantFilter({}, ctx);

  if (query.project_id) entryWhere.project_id = query.project_id;
  if (query.client_id) projectWhere.client_id = query.client_id;

  if (query.from || query.to) {
    entryWhere.entry_date = {};
    if (query.from) entryWhere.entry_date[Op.gte] = query.from;
    if (query.to) entryWhere.entry_date[Op.lte] = query.to;
  }

  if (query.entry_type && FINANCIAL_ENTRY_TYPES.includes(query.entry_type)) {
    entryWhere.entry_type = query.entry_type;
  }

  return ProjectFinancialEntry.findAll({
    where: entryWhere,
    include: [
      {
        model: Project,
        as: "project",
        where: projectWhere,
        required: true,
        attributes: ["id", "name", "slug", "budget", "client_id", "status"],
        include: [
          {
            model: Client,
            as: "client",
            attributes: ["id", "name", "company"],
          },
        ],
      },
    ],
    order: [
      ["entry_date", "DESC"],
      ["created_at", "DESC"],
    ],
  });
}

async function getEntryById(projectId, entryId, ctx) {
  await ensureProjectExists(projectId, ctx);

  const entry = await ProjectFinancialEntry.findOne({
    where: { id: entryId, project_id: projectId },
    include: entryInclude,
  });

  if (!entry) {
    throw new AppError("Lançamento não encontrado", 404, "FINANCIAL_ENTRY_NOT_FOUND");
  }

  return entry;
}

async function createEntry(projectId, payload, ctx) {
  await ensureProjectExists(projectId, ctx);
  validateEntryPayload(payload);

  return ProjectFinancialEntry.create({
    project_id: projectId,
    entry_type: payload.entry_type || "entrada",
    amount: payload.amount,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    entry_date: payload.entry_date,
  });
}

async function updateEntry(projectId, entryId, payload, ctx) {
  const entry = await getEntryById(projectId, entryId, ctx);
  validateEntryPayload(payload, { partial: true });

  const updates = {};
  if (payload.entry_type !== undefined) updates.entry_type = payload.entry_type;
  if (payload.amount !== undefined) updates.amount = payload.amount;
  if (payload.title !== undefined) updates.title = payload.title.trim();
  if (payload.description !== undefined) {
    updates.description = payload.description?.trim() || null;
  }
  if (payload.entry_date !== undefined) updates.entry_date = payload.entry_date;

  await entry.update(updates);
  return entry;
}

async function deleteEntry(projectId, entryId, ctx) {
  const entry = await getEntryById(projectId, entryId, ctx);
  await entry.destroy();
}

module.exports = {
  listProjectEntries,
  listEntriesForTenant,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
};
