const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const mediaService = require("./media.service");
const localStorage = require("../../providers/storage/local-storage.provider");

const upload = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const media = await mediaService.uploadFile({
    file: req.file,
    entityType: req.body.entity_type || req.params.entityType,
    entityId: req.body.entity_id || req.params.entityId,
    kind: req.body.kind || "attachment",
    category: req.body.category || null,
    ctx,
  });
  return sendCreated(res, media);
});

const clientLibrary = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const items = await mediaService.listClientLibrary(req.params.clientId, req.query, ctx);
  return sendSuccess(res, items);
});

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const items = await mediaService.listMedia(req.params.entityType, req.params.entityId, req.query, ctx);
  return sendSuccess(res, items);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const media = await mediaService.getMediaById(req.params.id, ctx);
  return sendSuccess(res, media);
});

const download = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const media = await mediaService.getMediaById(req.params.id, ctx);

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
  const ctx = buildServiceContext(req);
  await mediaService.deleteMedia(req.params.id, ctx);
  return sendNoContent(res);
});

module.exports = { upload, list, clientLibrary, getById, download, remove };
