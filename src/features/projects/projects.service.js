const { Op } = require("sequelize");
const { Project, Client, ProjectDetail, Tag, WorkspaceFolder, MediaFile } = require("../../models");
const AppError = require("../../utils/app-error");
const { slugify } = require("../../utils/crypto");
const {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  IMPORTANCE_LEVELS,
  NOTIFICATION_EVENTS,
} = require("../../config/constants");
const projectDetailsService = require("../project-details/project-details.service");
const tagsService = require("../tags/tags.service");
const notificationsService = require("../notifications/notifications.service");
const {
  applyTenantFilter,
  resolveTenantIdForWrite,
  assertResourceTenant,
} = require("../../utils/request-context");

const STATUS_ALIASES = {
  active: "in_progress",
  archived: "completed",
};

function resolveStatus(status) {
  if (!status) return null;
  return STATUS_ALIASES[status] || status;
}

function resolveDeadline(payload, existing = {}) {
  const hasDeadline =
    payload.has_deadline !== undefined ? payload.has_deadline : existing.has_deadline ?? false;

  if (!hasDeadline) {
    return { has_deadline: false, due_date: null };
  }

  const dueDate =
    payload.due_date !== undefined ? payload.due_date : existing.due_date ?? null;

  if (!dueDate) {
    throw new AppError(
      "due_date é obrigatório quando has_deadline é true",
      400,
      "VALIDATION_ERROR"
    );
  }

  return { has_deadline: true, due_date: dueDate };
}

function buildWhere(filters = {}, ctx) {
  const where = applyTenantFilter({}, ctx);

  if (filters.client_id) where.client_id = filters.client_id;
  if (filters.folder_id === "null") where.folder_id = null;
  else if (filters.folder_id) where.folder_id = filters.folder_id;

  if (filters.status && PROJECT_STATUSES.includes(filters.status)) where.status = filters.status;
  if (filters.has_deadline === "true") where.has_deadline = true;
  if (filters.has_deadline === "false") where.has_deadline = false;
  if (filters.priority && PROJECT_PRIORITIES.includes(filters.priority)) where.priority = filters.priority;
  if (filters.importance_level && IMPORTANCE_LEVELS.includes(filters.importance_level)) {
    where.importance_level = filters.importance_level;
  }

  if (filters.include_hidden !== "true") where.is_hidden = false;
  if (filters.include_inactive !== "true") where.is_active = true;

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { slug: { [Op.iLike]: term } },
      { description: { [Op.iLike]: term } },
    ];
  }

  return where;
}

async function ensureUniqueSlug(baseSlug, excludeId = null) {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const where = { slug };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await Project.findOne({ where });
    if (!existing) return slug;
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

const projectIncludes = [
  { model: Client, as: "client", attributes: ["id", "name", "company"] },
  { model: WorkspaceFolder, as: "folder", attributes: ["id", "name", "slug", "color", "icon"] },
  { model: Tag, as: "tags", through: { attributes: [] } },
  { model: MediaFile, as: "cover", required: false },
];

async function listProjects(query = {}, ctx) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;

  const { rows, count } = await Project.findAndCountAll({
    where: buildWhere(query, ctx),
    include: projectIncludes,
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

async function getProjectById(id, options = {}, ctx) {
  const includeDetails = options.includeDetails !== false;

  const project = await Project.findByPk(id, {
    include: [
      ...projectIncludes,
      {
        model: Client,
        as: "client",
        attributes: ["id", "name", "email", "company", "phone", "importance_level"],
      },
      ...(includeDetails
        ? [{ model: ProjectDetail, as: "details" }]
        : []),
    ],
    order: includeDetails
      ? [[{ model: ProjectDetail, as: "details" }, "sort_order", "ASC"]]
      : undefined,
  });

  if (!project) {
    throw new AppError("Projeto não encontrado", 404, "PROJECT_NOT_FOUND");
  }

  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");

  if (includeDetails && project.details) {
    project.details = projectDetailsService.sanitizeDetailsForResponse(project.details);
  }

  return project;
}

async function createProject(payload, ctx) {
  if (!payload.name?.trim()) {
    throw new AppError("Nome do projeto é obrigatório", 400, "VALIDATION_ERROR");
  }
  if (!payload.client_id) {
    throw new AppError("client_id é obrigatório", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);

  const client = await Client.findByPk(payload.client_id);
  if (!client || client.tenant_id !== tenantId) {
    throw new AppError("Cliente não encontrado", 404, "CLIENT_NOT_FOUND");
  }

  if (payload.folder_id) {
    const folder = await WorkspaceFolder.findByPk(payload.folder_id);
    if (!folder) throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
  }

  const baseSlug = slugify(payload.slug || payload.name);
  const slug = await ensureUniqueSlug(baseSlug);

  const status = resolveStatus(payload.status) || "in_progress";
  if (!PROJECT_STATUSES.includes(status)) {
    throw new AppError("Status inválido", 400, "VALIDATION_ERROR");
  }

  const deadline = resolveDeadline(payload);

  const project = await Project.create({
    tenant_id: tenantId,
    client_id: payload.client_id,
    folder_id: payload.folder_id || null,
    name: payload.name.trim(),
    slug,
    description: payload.description?.trim() || null,
    status,
    priority: payload.priority || "medium",
    importance_level: payload.importance_level || "normal",
    is_hidden: payload.is_hidden ?? false,
    is_active: payload.is_active ?? true,
    icon: payload.icon || "file-code",
    color: payload.color || "#3b82f6",
    start_date: payload.start_date || null,
    ...deadline,
    budget: payload.budget ?? null,
  });

  if (Array.isArray(payload.details) && payload.details.length > 0) {
    await projectDetailsService.bulkCreateDetails(project.id, payload.details, ctx);
  }

  if (payload.tag_ids) {
    await tagsService.syncProjectTags(project.id, payload.tag_ids, ctx);
  }

  if (ctx.userId) {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId,
      eventType: NOTIFICATION_EVENTS.PROJECT_CREATED,
      title: "Novo projeto",
      message: `Projeto "${project.name}" criado`,
      entityType: "project",
      entityId: project.id,
    });
  }

  return getProjectById(project.id, {}, ctx);
}

async function updateProject(id, payload, ctx) {
  const project = await Project.findByPk(id);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");

  if (payload.client_id) {
    const client = await Client.findByPk(payload.client_id);
    if (!client) throw new AppError("Cliente não encontrado", 404, "CLIENT_NOT_FOUND");
  }

  if (payload.folder_id) {
    const folder = await WorkspaceFolder.findByPk(payload.folder_id);
    if (!folder) throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
  }

  const updates = {};
  const fields = [
    "name", "client_id", "folder_id", "description", "priority",
    "importance_level", "is_hidden", "is_active", "icon", "color", "cover_media_id",
    "start_date", "budget",
  ];

  fields.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = typeof payload[field] === "string" ? payload[field].trim?.() ?? payload[field] : payload[field];
    }
  });

  if (payload.status !== undefined) {
    const status = resolveStatus(payload.status);
    if (!PROJECT_STATUSES.includes(status)) {
      throw new AppError("Status inválido", 400, "VALIDATION_ERROR");
    }
    updates.status = status;
  }

  if (payload.has_deadline !== undefined || payload.due_date !== undefined) {
    Object.assign(updates, resolveDeadline(payload, project));
  }
  if (updates.priority && !PROJECT_PRIORITIES.includes(updates.priority)) {
    throw new AppError("Prioridade inválida", 400, "VALIDATION_ERROR");
  }
  if (updates.importance_level && !IMPORTANCE_LEVELS.includes(updates.importance_level)) {
    throw new AppError("importance_level inválido", 400, "VALIDATION_ERROR");
  }

  if (payload.slug !== undefined || payload.name !== undefined) {
    const baseSlug = slugify(payload.slug || updates.name || project.name);
    updates.slug = await ensureUniqueSlug(baseSlug, project.id);
  }

  const previousFolderId = project.folder_id;
  await project.update(updates);

  if (payload.tag_ids !== undefined) {
    await tagsService.syncProjectTags(project.id, payload.tag_ids, ctx);
  }

  if (ctx.userId && payload.folder_id !== undefined && payload.folder_id !== previousFolderId) {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId: project.tenant_id,
      eventType: NOTIFICATION_EVENTS.PROJECT_MOVED,
      title: "Projeto movido",
      message: `"${project.name}" foi movido`,
      entityType: "project",
      entityId: project.id,
      payload: { folderId: payload.folder_id },
    });
  }

  return getProjectById(project.id, {}, ctx);
}

async function deleteProject(id, ctx) {
  const project = await Project.findByPk(id);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  await project.destroy();
}

module.exports = {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
};
