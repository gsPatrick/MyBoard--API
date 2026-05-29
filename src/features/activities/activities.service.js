const { UserActivity } = require("../../models");

async function recordActivity({
  userId,
  tenantId,
  actionType,
  title,
  entityType = null,
  entityId = null,
  payload = {},
}) {
  if (!userId || !title?.trim()) return null;

  try {
    return await UserActivity.create({
      tenant_id: tenantId || null,
      user_id: userId,
      action_type: actionType,
      title: title.trim(),
      entity_type: entityType,
      entity_id: entityId,
      payload: payload || {},
    });
  } catch (err) {
    console.error("[activities] record failed:", err.message);
    return null;
  }
}

module.exports = {
  recordActivity,
};
