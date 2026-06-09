const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const chatsService = require("./chats.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.listChats(ctx, { projectId: req.query.project_id });
  return sendSuccess(res, result);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.createChat(ctx, req.body || {});
  return sendCreated(res, result);
});

const get = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.getChat(ctx, req.params.id);
  return sendSuccess(res, result);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.updateChat(ctx, req.params.id, req.body || {});
  return sendSuccess(res, result);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.deleteChat(ctx, req.params.id);
  return sendSuccess(res, result);
});

const listMessages = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.listMessages(ctx, req.params.id, { limit: req.query.limit });
  return sendSuccess(res, result);
});

const sendMessage = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await chatsService.sendMessage(ctx, req.params.id, {
    content: req.body?.content,
    attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
  });
  return sendSuccess(res, result);
});

module.exports = { list, create, get, update, remove, listMessages, sendMessage };
