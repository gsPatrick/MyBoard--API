const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const notificationsQueryService = require("./notifications-query.service");

const list = catchAsync(async (req, res) => {
  const result = await notificationsQueryService.listForUser(req.user.id, req.query);
  return sendSuccess(res, result.items, 200, result.meta);
});

const unreadCount = catchAsync(async (req, res) => {
  const count = await notificationsQueryService.getUnreadCount(req.user.id);
  return sendSuccess(res, { count });
});

const markRead = catchAsync(async (req, res) => {
  const notification = await notificationsQueryService.markAsRead(req.user.id, req.params.id);
  return sendSuccess(res, notification);
});

const markAllRead = catchAsync(async (req, res) => {
  await notificationsQueryService.markAllAsRead(req.user.id);
  return sendSuccess(res, { ok: true });
});

const hide = catchAsync(async (req, res) => {
  const notification = await notificationsQueryService.hideNotification(req.user.id, req.params.id);
  return sendSuccess(res, notification);
});

module.exports = { list, unreadCount, markRead, markAllRead, hide };
