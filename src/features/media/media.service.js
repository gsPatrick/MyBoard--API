const { MediaFile, Client, Project, User } = require("../../models");
const AppError = require("../../utils/app-error");
const { MEDIA_ENTITY_TYPES, MEDIA_KINDS, ALLOWED_MIME_TYPES, NOTIFICATION_EVENTS } = require("../../config/constants");
const localStorage = require("../../providers/storage/local-storage.provider");
const notificationsService = require("../notifications/notifications.service");
const activitiesService = require("../activities/activities.service");
const { assertResourceTenant } = require("../../utils/request-context");

const ENTITY_MODEL_MAP = {
  client: Client,
  project: Project,
  user: User,
};

async function ensureEntityExists(entityType, entityId, ctx) {
  if (!MEDIA_ENTITY_TYPES.includes(entityType)) {
    throw new AppError("entity_type inválido", 400, "VALIDATION_ERROR");
  }

  if (
    entityType === "project_detail" ||
    entityType === "project_demand" ||
    entityType === "agenda_event" ||
    entityType === "folder"
  ) {
    return true;
  }

  const Model = ENTITY_MODEL_MAP[entityType];
  if (!Model) return true;

  const entity = await Model.findByPk(entityId);
  assertResourceTenant(entity, ctx, "ENTITY_NOT_FOUND");
  return entity;
}

async function uploadFile({ file, entityType, entityId, kind = "attachment", ctx }) {
  if (!file) {
    throw new AppError("Arquivo é obrigatório", 400, "VALIDATION_ERROR");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError("Tipo de arquivo não permitido", 400, "INVALID_MIME_TYPE");
  }

  if (!MEDIA_KINDS.includes(kind)) {
    throw new AppError("kind inválido", 400, "VALIDATION_ERROR");
  }

  const entity = await ensureEntityExists(entityType, entityId, ctx);

  const stored = await localStorage.saveLocalFile({
    file,
    entityType,
    entityId,
    kind,
  });

  const media = await MediaFile.create({
    entity_type: entityType,
    entity_id: entityId,
    kind,
    original_name: file.originalname,
    stored_name: stored.stored_name,
    mime_type: file.mimetype,
    size_bytes: file.size,
    storage_disk: stored.storage_disk,
    storage_path: stored.storage_path,
    public_url: stored.public_url,
    uploaded_by_user_id: ctx?.userId || null,
    metadata: {},
  });

  if (kind === "avatar" && entityType === "client") {
    await Client.update({ avatar_media_id: media.id }, { where: { id: entityId } });
  }

  if (kind === "avatar" && entityType === "user") {
    await User.update({ avatar_media_id: media.id }, { where: { id: entityId } });
  }

  if (kind === "cover" && entityType === "project") {
    await Project.update({ cover_media_id: media.id }, { where: { id: entityId } });
  }

  if (ctx?.userId) {
    const tenantId = entity?.tenant_id || ctx.tenantId || null;
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId,
      eventType: NOTIFICATION_EVENTS.MEDIA_UPLOADED,
      title: "Upload concluído",
      message: `Arquivo "${file.originalname}" enviado`,
      entityType,
      entityId,
      payload: { mediaId: media.id },
    });
    await activitiesService.recordActivity({
      userId: ctx.userId,
      tenantId,
      actionType: NOTIFICATION_EVENTS.MEDIA_UPLOADED,
      title: `Enviou o arquivo ${file.originalname}.`,
      entityType,
      entityId,
      payload: { mediaId: media.id },
    });
  }

  return media;
}

async function listMedia(entityType, entityId, query = {}, ctx) {
  await ensureEntityExists(entityType, entityId, ctx);

  const where = { entity_type: entityType, entity_id: entityId };
  if (query.kind && MEDIA_KINDS.includes(query.kind)) {
    where.kind = query.kind;
  }

  return MediaFile.findAll({
    where,
    order: [["created_at", "DESC"]],
  });
}

async function getMediaById(id, ctx) {
  const media = await MediaFile.findByPk(id);
  if (!media) {
    throw new AppError("Arquivo não encontrado", 404, "MEDIA_NOT_FOUND");
  }

  if (ctx && media.entity_type !== "user") {
    await ensureEntityExists(media.entity_type, media.entity_id, ctx);
  }

  return media;
}

async function deleteMedia(id, ctx) {
  const media = await getMediaById(id, ctx);

  if (media.storage_disk === "local") {
    await localStorage.deleteLocalFile(media.storage_path);
  }

  await media.destroy();
}

module.exports = {
  uploadFile,
  listMedia,
  getMediaById,
  deleteMedia,
};
