const { Op } = require("sequelize");
const { AgendaEvent, Client, Project, User } = require("../../models");
const AppError = require("../../utils/app-error");
const { AGENDA_STATUSES, NOTIFICATION_EVENTS, APP_TIMEZONE } = require("../../config/constants");
const { parseLocalDateTime, formatAgendaEvent, getDateRangeForAgendaQuery } = require("../../utils/datetime");
const notificationsService = require("../notifications/notifications.service");
const activitiesService = require("../activities/activities.service");
const {
  applyTenantFilter,
  resolveTenantIdForWrite,
  assertResourceTenant,
} = require("../../utils/request-context");

function applyAgendaVisibility(where, query = {}, ctx) {
  applyTenantFilter(where, ctx);

  if (query.include_hidden !== "true") {
    where.is_hidden = false;
  }
  return where;
}

async function listEvents(query = {}, ctx) {
  const where = applyAgendaVisibility({}, query, ctx);
  const range = getDateRangeForAgendaQuery(query.from, query.to, query.timezone || APP_TIMEZONE);

  if (range.start && range.end) {
    where.starts_at = { [Op.between]: [range.start, range.end] };
  }

  if (query.client_id) where.client_id = query.client_id;
  if (query.project_id) where.project_id = query.project_id;
  if (query.status && AGENDA_STATUSES.includes(query.status)) where.status = query.status;

  const events = await AgendaEvent.findAll({
    where,
    include: [
      { model: Client, as: "client", attributes: ["id", "name"] },
      { model: Project, as: "project", attributes: ["id", "name", "slug"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
    ],
    order: [["starts_at", "ASC"]],
  });

  return events.map(formatAgendaEvent);
}

async function getEventById(id, ctx) {
  const event = await AgendaEvent.findByPk(id, {
    include: [
      { model: Client, as: "client", attributes: ["id", "name"] },
      { model: Project, as: "project", attributes: ["id", "name", "slug"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
    ],
  });

  assertResourceTenant(event, ctx, "AGENDA_NOT_FOUND");
  return formatAgendaEvent(event);
}

async function createEvent(payload, ctx) {
  if (!payload.title?.trim()) {
    throw new AppError("Título é obrigatório", 400, "VALIDATION_ERROR");
  }

  if (!payload.starts_at) {
    throw new AppError("starts_at é obrigatório", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);
  const timezone = payload.timezone || APP_TIMEZONE;
  const startsAt = parseLocalDateTime(payload.starts_at, timezone);
  if (!startsAt) {
    throw new AppError("starts_at inválido", 400, "VALIDATION_ERROR");
  }

  let endsAt = null;
  if (payload.ends_at) {
    endsAt = parseLocalDateTime(payload.ends_at, timezone);
    if (!endsAt) {
      throw new AppError("ends_at inválido", 400, "VALIDATION_ERROR");
    }
  }

  if (payload.client_id) {
    const client = await Client.findByPk(payload.client_id);
    assertResourceTenant(client, ctx, "CLIENT_NOT_FOUND");
  }

  if (payload.project_id) {
    const project = await Project.findByPk(payload.project_id);
    assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  }

  const event = await AgendaEvent.create({
    tenant_id: tenantId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    starts_at: startsAt.toJSDate(),
    ends_at: endsAt ? endsAt.toJSDate() : null,
    timezone,
    all_day: payload.all_day ?? false,
    client_id: payload.client_id || null,
    project_id: payload.project_id || null,
    created_by_user_id: payload.created_by_user_id || ctx.userId || null,
    reminder_minutes_before: payload.reminder_minutes_before ?? null,
    status: payload.status || "scheduled",
    is_hidden: payload.is_hidden ?? false,
    metadata: payload.metadata || {},
  });

  if (ctx.userId) {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId,
      eventType: NOTIFICATION_EVENTS.AGENDA_CREATED,
      title: "Novo evento na agenda",
      message: event.title,
      entityType: "agenda_event",
      entityId: event.id,
      payload: { agendaEventId: event.id },
    });
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId,
      actionType: NOTIFICATION_EVENTS.AGENDA_CREATED,
      title: `Agendou ${event.title}.`,
      entityType: "agenda_event",
      entityId: event.id,
    });
  }

  return getEventById(event.id, ctx);
}

async function updateEvent(id, payload, ctx) {
  const event = await AgendaEvent.findByPk(id);
  assertResourceTenant(event, ctx, "AGENDA_NOT_FOUND");

  const updates = {};
  const timezone = payload.timezone || event.timezone || APP_TIMEZONE;

  if (payload.title !== undefined) updates.title = payload.title.trim();
  if (payload.description !== undefined) updates.description = payload.description?.trim() || null;
  if (payload.all_day !== undefined) updates.all_day = payload.all_day;
  if (payload.client_id !== undefined) updates.client_id = payload.client_id;
  if (payload.project_id !== undefined) updates.project_id = payload.project_id;
  if (payload.reminder_minutes_before !== undefined) updates.reminder_minutes_before = payload.reminder_minutes_before;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.is_hidden !== undefined) updates.is_hidden = payload.is_hidden;
  if (payload.metadata !== undefined) updates.metadata = payload.metadata;
  if (payload.timezone !== undefined) updates.timezone = payload.timezone;

  if (payload.starts_at !== undefined) {
    const startsAt = parseLocalDateTime(payload.starts_at, timezone);
    if (!startsAt) throw new AppError("starts_at inválido", 400, "VALIDATION_ERROR");
    updates.starts_at = startsAt.toJSDate();
  }

  if (payload.ends_at !== undefined) {
    if (!payload.ends_at) {
      updates.ends_at = null;
    } else {
      const endsAt = parseLocalDateTime(payload.ends_at, timezone);
      if (!endsAt) throw new AppError("ends_at inválido", 400, "VALIDATION_ERROR");
      updates.ends_at = endsAt.toJSDate();
    }
  }

  await event.update(updates);
  return getEventById(event.id, ctx);
}

async function deleteEvent(id, ctx) {
  const event = await AgendaEvent.findByPk(id);
  assertResourceTenant(event, ctx, "AGENDA_NOT_FOUND");
  await event.destroy();
}

module.exports = {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
};
