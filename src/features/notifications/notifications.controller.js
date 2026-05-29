const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const notificationsQueryService = require("./notifications-query.service");

const list = catchAsync(async (req, res) => {
  const userId = req.params.userId || req.headers["x-user-id"];
  const result = await notificationsQueryService.listForUser(userId, req.query);
  return sendSuccess(res, result.items, 200, result.meta);
});

const unreadCount = catchAsync(async (req, res) => {
  const userId = req.params.userId || req.headers["x-user-id"];
  const count = await notificationsQueryService.getUnreadCount(userId);
  return sendSuccess(res, { count });
});

const markRead = catchAsync(async (req, res) => {
  const userId = req.headers["x-user-id"];
  const notification = await notificationsQueryService.markAsRead(userId, req.params.id);
  return sendSuccess(res, notification);
});

const markAllRead = catchAsync(async (req, res) => {
  const userId = req.headers["x-user-id"];
  await notificationsQueryService.markAllAsRead(userId);
  return sendSuccess(res, { ok: true });
});

const hide = catchAsync(async (req, res) => {
  const userId = req.headers["x-user-id"];
  const notification = await notificationsQueryService.hideNotification(userId, req.params.id);
  return sendSuccess(res, notification);
});

module.exports = { list, unreadCount, markRead, markAllRead, hide };
