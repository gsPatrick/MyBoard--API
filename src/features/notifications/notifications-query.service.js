const { Op } = require("sequelize");
const { Notification } = require("../../models");
const AppError = require("../../utils/app-error");
const { formatForResponse } = require("../../utils/datetime");

async function listForUser(userId, query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
  const offset = (page - 1) * limit;

  const where = { user_id: userId };

  if (query.unread === "true") {
    where.read_at = null;
  }

  if (query.include_hidden !== "true") {
    where.is_hidden = false;
  }

  const { rows, count } = await Notification.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const items = rows.map((n) => {
    const plain = n.toJSON();
    plain.created_at_display = formatForResponse(plain.created_at);
    plain.read_at_display = plain.read_at ? formatForResponse(plain.read_at) : null;
    return plain;
  });

  return {
    items,
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
  };
}

async function markAsRead(userId, notificationId) {
  const notification = await Notification.findOne({
    where: { id: notificationId, user_id: userId },
  });

  if (!notification) {
    throw new AppError("Notificação não encontrada", 404, "NOTIFICATION_NOT_FOUND");
  }

  if (!notification.read_at) {
    await notification.update({ read_at: new Date() });
  }

  return notification;
}

async function markAllAsRead(userId) {
  await Notification.update(
    { read_at: new Date() },
    { where: { user_id: userId, read_at: null } }
  );
}

async function hideNotification(userId, notificationId) {
  const notification = await Notification.findOne({
    where: { id: notificationId, user_id: userId },
  });

  if (!notification) {
    throw new AppError("Notificação não encontrada", 404, "NOTIFICATION_NOT_FOUND");
  }

  await notification.update({ is_hidden: true });
  return notification;
}

async function getUnreadCount(userId) {
  return Notification.count({
    where: { user_id: userId, read_at: null, is_hidden: false },
  });
}

module.exports = {
  listForUser,
  markAsRead,
  markAllAsRead,
  hideNotification,
  getUnreadCount,
};
