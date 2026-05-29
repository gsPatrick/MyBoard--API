const { emitToUser, emitBroadcast } = require("../../providers/realtime/socket.provider");
const { Notification } = require("../../models");

async function createAndEmit({ userId, eventType, title, message, payload, entityType, entityId, broadcast = false }) {
  const notification = await Notification.create({
    user_id: userId,
    event_type: eventType,
    title,
    message: message || null,
    payload: payload || {},
    entity_type: entityType || null,
    entity_id: entityId || null,
  });

  const data = notification.toJSON();

  if (broadcast) {
    emitBroadcast("notification", data);
  } else {
    emitToUser(userId, "notification", data);
  }

  return notification;
}

async function notifyAllActiveUsers(users, params) {
  const results = [];
  for (const user of users) {
    results.push(await createAndEmit({ ...params, userId: user.id }));
  }
  return results;
}

module.exports = {
  createAndEmit,
  notifyAllActiveUsers,
};
