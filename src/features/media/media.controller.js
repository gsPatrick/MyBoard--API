const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const mediaService = require("./media.service");
const localStorage = require("../../providers/storage/local-storage.provider");

const upload = catchAsync(async (req, res) => {
  const media = await mediaService.uploadFile({
    file: req.file,
    entityType: req.body.entity_type || req.params.entityType,
    entityId: req.body.entity_id || req.params.entityId,
    kind: req.body.kind || "attachment",
    uploadedByUserId: req.headers["x-user-id"] || null,
  });
  return sendCreated(res, media);
});

const list = catchAsync(async (req, res) => {
  const items = await mediaService.listMedia(req.params.entityType, req.params.entityId, req.query);
  return sendSuccess(res, items);
});

const getById = catchAsync(async (req, res) => {
  const media = await mediaService.getMediaById(req.params.id);
  return sendSuccess(res, media);
});

const download = catchAsync(async (req, res) => {
  const media = await mediaService.getMediaById(req.params.id);

  if (media.storage_disk === "local") {
    const absolutePath = localStorage.resolveAbsolutePath(media.storage_path);
    return res.download(absolutePath, media.original_name);
  }

  if (media.public_url) {
    return res.redirect(media.public_url);
  }

  return sendSuccess(res, media);
});

const remove = catchAsync(async (req, res) => {
  await mediaService.deleteMedia(req.params.id);
  return sendNoContent(res);
});

module.exports = { upload, list, getById, download, remove };
