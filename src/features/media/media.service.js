const { MediaFile, Client, Project, User } = require("../../models");
const AppError = require("../../utils/app-error");
const { MEDIA_ENTITY_TYPES, MEDIA_KINDS, ALLOWED_MIME_TYPES, NOTIFICATION_EVENTS } = require("../../config/constants");
const localStorage = require("../../providers/storage/local-storage.provider");
const notificationsService = require("../notifications/notifications.service");

const ENTITY_MODEL_MAP = {
  client: Client,
  project: Project,
  user: User,
};

async function ensureEntityExists(entityType, entityId) {
  if (!MEDIA_ENTITY_TYPES.includes(entityType)) {
    throw new AppError("entity_type inválido", 400, "VALIDATION_ERROR");
  }

  if (entityType === "project_detail" || entityType === "agenda_event" || entityType === "folder") {
    return true;
  }

  const Model = ENTITY_MODEL_MAP[entityType];
  if (!Model) return true;

  const entity = await Model.findByPk(entityId);
  if (!entity) {
    throw new AppError(`${entityType} não encontrado`, 404, "ENTITY_NOT_FOUND");
  }

  return entity;
}

async function uploadFile({ file, entityType, entityId, kind = "attachment", uploadedByUserId = null }) {
  if (!file) {
    throw new AppError("Arquivo é obrigatório", 400, "VALIDATION_ERROR");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError("Tipo de arquivo não permitido", 400, "INVALID_MIME_TYPE");
  }

  if (!MEDIA_KINDS.includes(kind)) {
    throw new AppError("kind inválido", 400, "VALIDATION_ERROR");
  }

  await ensureEntityExists(entityType, entityId);

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
    uploaded_by_user_id: uploadedByUserId,
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

  if (uploadedByUserId) {
    await notificationsService.createAndEmit({
      userId: uploadedByUserId,
      eventType: NOTIFICATION_EVENTS.MEDIA_UPLOADED,
      title: "Upload concluído",
      message: `Arquivo "${file.originalname}" enviado`,
      entityType,
      entityId,
      payload: { mediaId: media.id },
    });
  }

  return media;
}

async function listMedia(entityType, entityId, query = {}) {
  const where = { entity_type: entityType, entity_id: entityId };
  if (query.kind && MEDIA_KINDS.includes(query.kind)) {
    where.kind = query.kind;
  }

  return MediaFile.findAll({
    where,
    order: [["created_at", "DESC"]],
  });
}

async function getMediaById(id) {
  const media = await MediaFile.findByPk(id);
  if (!media) {
    throw new AppError("Arquivo não encontrado", 404, "MEDIA_NOT_FOUND");
  }
  return media;
}

async function deleteMedia(id) {
  const media = await getMediaById(id);

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
