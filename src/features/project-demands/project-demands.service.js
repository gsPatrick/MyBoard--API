const { Project, ProjectDemand } = require("../../models");
const AppError = require("../../utils/app-error");
const { DEMAND_STATUSES } = require("../../config/constants");
const { assertResourceTenant } = require("../../utils/request-context");

async function ensureProjectExists(projectId, ctx) {
  const project = await Project.findByPk(projectId);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  return project;
}

async function listDemands(projectId, query = {}, ctx) {
  await ensureProjectExists(projectId, ctx);

  const where = { project_id: projectId };
  if (query.status && DEMAND_STATUSES.includes(query.status)) {
    where.status = query.status;
  }

  return ProjectDemand.findAll({
    where,
    order: [
      ["sort_order", "ASC"],
      ["created_at", "ASC"],
    ],
  });
}

async function getDemandById(projectId, demandId, ctx) {
  await ensureProjectExists(projectId, ctx);

  const demand = await ProjectDemand.findOne({
    where: { id: demandId, project_id: projectId },
  });

  if (!demand) {
    throw new AppError("Demanda não encontrada", 404, "DEMAND_NOT_FOUND");
  }

  return demand;
}

async function createDemand(projectId, payload, ctx) {
  await ensureProjectExists(projectId, ctx);

  if (!payload.title?.trim()) {
    throw new AppError("Título da demanda é obrigatório", 400, "VALIDATION_ERROR");
  }

  const status = payload.status && DEMAND_STATUSES.includes(payload.status) ? payload.status : "pending";

  return ProjectDemand.create({
    project_id: projectId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    status,
    sort_order: payload.sort_order ?? 0,
    completed_at: status === "done" ? new Date() : null,
  });
}

async function updateDemand(projectId, demandId, payload, ctx) {
  const demand = await getDemandById(projectId, demandId, ctx);

  const updates = {};

  if (payload.title !== undefined) {
    if (!payload.title?.trim()) {
      throw new AppError("Título da demanda é obrigatório", 400, "VALIDATION_ERROR");
    }
    updates.title = payload.title.trim();
  }

  if (payload.description !== undefined) {
    updates.description = payload.description?.trim() || null;
  }

  if (payload.sort_order !== undefined) {
    updates.sort_order = payload.sort_order;
  }

  if (payload.status !== undefined) {
    if (!DEMAND_STATUSES.includes(payload.status)) {
      throw new AppError("Status inválido", 400, "VALIDATION_ERROR");
    }
    updates.status = payload.status;
    updates.completed_at = payload.status === "done" ? new Date() : null;
  }

  await demand.update(updates);
  return demand;
}

async function deleteDemand(projectId, demandId, ctx) {
  const demand = await getDemandById(projectId, demandId, ctx);
  await demand.destroy();
}

module.exports = {
  listDemands,
  getDemandById,
  createDemand,
  updateDemand,
  deleteDemand,
};
