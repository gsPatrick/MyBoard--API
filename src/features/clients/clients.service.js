const { Op } = require("sequelize");
const { Client, Project, Tag, MediaFile } = require("../../models");
const AppError = require("../../utils/app-error");
const { CLIENT_STATUSES, IMPORTANCE_LEVELS, NOTIFICATION_EVENTS } = require("../../config/constants");
const tagsService = require("../tags/tags.service");
const notificationsService = require("../notifications/notifications.service");
const activitiesService = require("../activities/activities.service");
const {
  applyTenantFilter,
  resolveTenantIdForWrite,
  assertResourceTenant,
} = require("../../utils/request-context");

function buildWhere(filters = {}, ctx) {
  const where = applyTenantFilter({}, ctx);

  if (filters.status && CLIENT_STATUSES.includes(filters.status)) {
    where.status = filters.status;
  }

  if (filters.importance_level && IMPORTANCE_LEVELS.includes(filters.importance_level)) {
    where.importance_level = filters.importance_level;
  }

  if (filters.include_hidden !== "true") {
    where.is_hidden = false;
  }

  if (filters.include_inactive !== "true") {
    where.is_active = true;
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { company: { [Op.iLike]: term } },
    ];
  }

  return where;
}

const clientIncludes = [
  { model: Tag, as: "tags", through: { attributes: [] } },
  { model: MediaFile, as: "avatar", required: false },
];

async function listClients(query = {}, ctx) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;

  const { rows, count } = await Client.findAndCountAll({
    where: buildWhere(query, ctx),
    include: clientIncludes,
    order: [
      ["importance_level", "DESC"],
      ["created_at", "DESC"],
    ],
    limit,
    offset,
  });

  return {
    items: rows,
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
  };
}

async function getClientById(id, ctx) {
  const client = await Client.findByPk(id, {
    include: [
      ...clientIncludes,
      {
        model: Project,
        as: "projects",
        attributes: ["id", "name", "slug", "status", "priority", "importance_level", "folder_id", "due_date", "is_active", "is_hidden"],
      },
    ],
  });

  return assertResourceTenant(client, ctx, "CLIENT_NOT_FOUND");
}

async function createClient(payload, ctx) {
  if (!payload.name?.trim()) {
    throw new AppError("Nome do cliente é obrigatório", 400, "VALIDATION_ERROR");
  }

  if (payload.importance_level && !IMPORTANCE_LEVELS.includes(payload.importance_level)) {
    throw new AppError("importance_level inválido", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);

  const client = await Client.create({
    tenant_id: tenantId,
    name: payload.name.trim(),
    email: payload.email?.trim() || null,
    company: payload.company?.trim() || null,
    phone: payload.phone?.trim() || null,
    document: payload.document?.trim() || null,
    status: payload.status || "active",
    importance_level: payload.importance_level || "normal",
    is_hidden: payload.is_hidden ?? false,
    is_active: payload.is_active ?? true,
    notes: payload.notes?.trim() || null,
  });

  if (payload.tag_ids) {
    await tagsService.syncClientTags(client.id, payload.tag_ids, ctx);
  }

  if (ctx.userId) {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId,
      eventType: NOTIFICATION_EVENTS.CLIENT_CREATED,
      title: "Novo cliente",
      message: `Cliente "${client.name}" cadastrado`,
      entityType: "client",
      entityId: client.id,
    });
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId,
      actionType: NOTIFICATION_EVENTS.CLIENT_CREATED,
      title: `Criou o cliente ${client.name}.`,
      entityType: "client",
      entityId: client.id,
    });
  }

  return getClientById(client.id, ctx);
}

async function updateClient(id, payload, ctx) {
  const client = await Client.findByPk(id);
  assertResourceTenant(client, ctx, "CLIENT_NOT_FOUND");

  const fields = [
    "name", "email", "company", "phone", "document", "status", "notes",
    "importance_level", "is_hidden", "is_active", "avatar_media_id",
  ];
  const updates = {};

  fields.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = typeof payload[field] === "string" ? payload[field].trim() : payload[field];
    }
  });

  if (updates.status && !CLIENT_STATUSES.includes(updates.status)) {
    throw new AppError("Status inválido", 400, "VALIDATION_ERROR");
  }

  if (updates.importance_level && !IMPORTANCE_LEVELS.includes(updates.importance_level)) {
    throw new AppError("importance_level inválido", 400, "VALIDATION_ERROR");
  }

  await client.update(updates);

  if (payload.tag_ids !== undefined) {
    await tagsService.syncClientTags(client.id, payload.tag_ids, ctx);
  }

  if (ctx.userId) {
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId: client.tenant_id,
      actionType: NOTIFICATION_EVENTS.CLIENT_UPDATED,
      title: `Atualizou o cliente ${client.name}.`,
      entityType: "client",
      entityId: client.id,
    });
  }

  return getClientById(client.id, ctx);
}

async function deleteClient(id, ctx) {
  const client = await Client.findByPk(id);
  assertResourceTenant(client, ctx, "CLIENT_NOT_FOUND");

  const projectCount = await Project.count({ where: { client_id: id, tenant_id: client.tenant_id } });
  if (projectCount > 0) {
    throw new AppError(
      "Cliente possui projetos vinculados. Remova ou transfira os projetos antes.",
      409,
      "CLIENT_HAS_PROJECTS"
    );
  }

  await client.destroy();
}

module.exports = {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
};
