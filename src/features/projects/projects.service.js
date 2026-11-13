const { Op } = require("sequelize");
const {
  Project,
  Client,
  ProjectDetail,
  ProjectFinancialEntry,
  Tag,
  WorkspaceFolder,
  MediaFile,
} = require("../../models");
const AppError = require("../../utils/app-error");
const { slugify } = require("../../utils/crypto");
const {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  IMPORTANCE_LEVELS,
  PROJECT_ORIGINS,
  NOTIFICATION_EVENTS,
  RECURRING_BILLING_STATUSES,
} = require("../../config/constants");
const { computeFirstRun, todayISO, lastDayOfPreviousMonthISO } = require("../../utils/recurrence");
const projectDetailsService = require("../project-details/project-details.service");
const projectFinancialService = require("../project-financial/project-financial.service");
const tagsService = require("../tags/tags.service");
const notificationsService = require("../notifications/notifications.service");
const activitiesService = require("../activities/activities.service");
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

/**
 * Normaliza e valida os campos de recorrência.
 * - No create (`existing` null) sempre retorna um objeto.
 * - No update retorna `null` quando o payload não mexe em recorrência.
 * - Recalcula `recurrence_next_run` ao ligar a recorrência ou mudar dia/início.
 */
function resolveRecurrence(payload, existing = null) {
  const has = (key) => payload[key] !== undefined;
  const touched =
    has("is_recurring") ||
    has("recurrence_amount") ||
    has("recurrence_day") ||
    has("recurrence_start_date") ||
    has("recurrence_end_date");

  if (!touched && existing) return null;

  const isRecurring = has("is_recurring")
    ? Boolean(payload.is_recurring)
    : Boolean(existing?.is_recurring);

  if (!isRecurring) {
    return {
      is_recurring: false,
      recurrence_amount: null,
      recurrence_day: null,
      recurrence_start_date: null,
      recurrence_end_date: null,
      recurrence_next_run: null,
    };
  }

  const amountNum = Number(
    has("recurrence_amount") ? payload.recurrence_amount : existing?.recurrence_amount
  );
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new AppError("Valor da recorrência deve ser maior que zero", 400, "VALIDATION_ERROR");
  }

  const day = Number(
    has("recurrence_day") ? payload.recurrence_day : existing?.recurrence_day
  );
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new AppError("Dia da recorrência deve ser entre 1 e 31", 400, "VALIDATION_ERROR");
  }

  const startDate =
    (has("recurrence_start_date") ? payload.recurrence_start_date : existing?.recurrence_start_date) ||
    todayISO();

  const endDate = has("recurrence_end_date")
    ? payload.recurrence_end_date || null
    : existing?.recurrence_end_date || null;

  if (endDate && String(endDate) < String(startDate)) {
    throw new AppError(
      "Data final da recorrência não pode ser anterior ao início",
      400,
      "VALIDATION_ERROR"
    );
  }

  const wasRecurring = Boolean(existing?.is_recurring);
  const dayChanged = has("recurrence_day") && Number(existing?.recurrence_day) !== day;
  const startChanged =
    has("recurrence_start_date") &&
    String(existing?.recurrence_start_date || "") !== String(startDate);

  let nextRun = existing?.recurrence_next_run || null;
  if (!wasRecurring || dayChanged || startChanged || !nextRun) {
    // Ancora em hoje (ou no início, se for futuro) para não gerar
    // recebimentos retroativos ao ligar/editar a recorrência.
    const today = todayISO();
    const anchor = String(startDate) > String(today) ? startDate : today;
    nextRun = computeFirstRun(anchor, day);
  }

  return {
    is_recurring: true,
    recurrence_amount: amountNum,
    recurrence_day: day,
    recurrence_start_date: startDate,
    recurrence_end_date: endDate,
    recurrence_next_run: nextRun,
  };
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
  {
    model: Client,
    as: "client",
    attributes: ["id", "name", "company", "email", "phone"],
    include: [
      {
        model: MediaFile,
        as: "avatar",
        required: false,
        attributes: ["id", "public_url", "storage_path"],
      },
    ],
  },
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
    items: rows.map((row) => {
      const json = row.toJSON();
      return {
        ...json,
        created_at: json.created_at || json.createdAt || null,
      };
    }),
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

  // Quantas vezes o projeto recorrente já gerou recebimento.
  if (project.is_recurring) {
    const receivedCount = await ProjectFinancialEntry.count({
      where: {
        project_id: project.id,
        title: { [Op.like]: "Recebimento recorrente%" },
      },
    });
    project.setDataValue("recurrence_received_count", receivedCount);
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

  const recurrence = resolveRecurrence(payload) || {};

  const status =
    resolveStatus(payload.status) || (recurrence.is_recurring ? "recurring" : "in_progress");
  if (!PROJECT_STATUSES.includes(status)) {
    throw new AppError("Status inválido", 400, "VALIDATION_ERROR");
  }

  const deadline = resolveDeadline(payload);

  const origin = payload.origin || "own";
  if (!PROJECT_ORIGINS.includes(origin)) {
    throw new AppError("Origem do projeto inválida", 400, "VALIDATION_ERROR");
  }

  // Valor já recebido antes de cadastrar o projeto (validado antes de criar).
  let alreadyReceived = 0;
  if (payload.already_received !== undefined && payload.already_received !== null && payload.already_received !== "") {
    alreadyReceived = Number(payload.already_received);
    if (!Number.isFinite(alreadyReceived) || alreadyReceived < 0) {
      throw new AppError("Valor já recebido inválido", 400, "VALIDATION_ERROR");
    }
    const budgetNum = payload.budget != null && payload.budget !== "" ? Number(payload.budget) : null;
    if (Number.isFinite(budgetNum) && alreadyReceived > budgetNum) {
      throw new AppError(
        "Valor já recebido não pode ser maior que o valor do projeto",
        400,
        "VALIDATION_ERROR"
      );
    }
  }

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
    completed_at: status === "completed" ? new Date() : null,
    origin,
    ...recurrence,
  });

  if (Array.isArray(payload.details) && payload.details.length > 0) {
    await projectDetailsService.bulkCreateDetails(project.id, payload.details, ctx);
  }

  if (payload.tag_ids) {
    await tagsService.syncProjectTags(project.id, payload.tag_ids, ctx);
  }

  // Lança o que já foi recebido com data do mês anterior: abate do "a receber"
  // em todas as telas, mas não entra no "recebido no mês" atual.
  if (alreadyReceived > 0) {
    await projectFinancialService.createEntry(
      project.id,
      {
        entry_type: "entrada",
        amount: alreadyReceived,
        title: "Recebido antes do cadastro",
        description: "Valor já recebido, informado ao criar o projeto.",
        entry_date: lastDayOfPreviousMonthISO(),
      },
      ctx
    );
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
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId,
      actionType: NOTIFICATION_EVENTS.PROJECT_CREATED,
      title: `Criou o projeto ${project.name}.`,
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
    "start_date", "budget", "origin",
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

  const recurrence = resolveRecurrence(payload, project);
  if (recurrence) {
    Object.assign(updates, recurrence);
    // Mantém o status coerente ao ligar/desligar a recorrência
    // (a menos que o próprio payload já esteja definindo o status —
    // caso de "recurring" vs "maintenance", que o front envia explícito).
    if (payload.status === undefined) {
      const hadRecurringStatus = RECURRING_BILLING_STATUSES.includes(project.status);
      if (recurrence.is_recurring && !hadRecurringStatus) {
        updates.status = "recurring";
      } else if (!recurrence.is_recurring && hadRecurringStatus) {
        updates.status = "in_progress";
      }
    }
  }

  // Data de conclusão: marca ao virar "concluído" e limpa se for reaberto.
  if (updates.status !== undefined && updates.status !== project.status) {
    if (updates.status === "completed") updates.completed_at = new Date();
    else if (project.status === "completed") updates.completed_at = null;
  }

  // Retomada: projeto recorrente que estava pausado/cancelado/concluído e volta
  // a um status que gera recebimento → re-ancora o próximo ciclo em hoje, para
  // não lançar de uma vez os meses em que ficou parado.
  const finalStatus = updates.status ?? project.status;
  const finalRecurring = updates.is_recurring ?? project.is_recurring;
  if (
    finalRecurring &&
    !RECURRING_BILLING_STATUSES.includes(project.status) &&
    RECURRING_BILLING_STATUSES.includes(finalStatus)
  ) {
    const day = updates.recurrence_day ?? project.recurrence_day;
    if (day) updates.recurrence_next_run = computeFirstRun(todayISO(), day);
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
  if (updates.origin && !PROJECT_ORIGINS.includes(updates.origin)) {
    throw new AppError("Origem do projeto inválida", 400, "VALIDATION_ERROR");
  }

  if (payload.slug !== undefined || payload.name !== undefined) {
    const baseSlug = slugify(payload.slug || updates.name || project.name);
    updates.slug = await ensureUniqueSlug(baseSlug, project.id);
  }

  const previousFolderId = project.folder_id;
  const folderMoved =
    payload.folder_id !== undefined && payload.folder_id !== previousFolderId;

  await project.update(updates);

  if (payload.tag_ids !== undefined) {
    await tagsService.syncProjectTags(project.id, payload.tag_ids, ctx);
  }

  if (ctx.userId && folderMoved) {
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
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId: project.tenant_id,
      actionType: NOTIFICATION_EVENTS.PROJECT_MOVED,
      title: `Moveu o projeto ${project.name}.`,
      entityType: "project",
      entityId: project.id,
      payload: { folderId: payload.folder_id },
    });
  }

  const hasOtherUpdates =
    Object.keys(updates).length > 0 &&
    !(Object.keys(updates).length === 1 && folderMoved && updates.folder_id !== undefined);

  if (ctx.userId && hasOtherUpdates) {
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId: project.tenant_id,
      actionType: NOTIFICATION_EVENTS.PROJECT_UPDATED,
      title: `Atualizou o projeto ${project.name}.`,
      entityType: "project",
      entityId: project.id,
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
