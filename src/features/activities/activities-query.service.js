const { UserActivity, User, MediaFile } = require("../../models");
const { formatForResponse } = require("../../utils/datetime");
const { applyTenantFilter } = require("../../utils/request-context");

async function listForUser(userId, query = {}, ctx = {}) {
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 5));

  const where = applyTenantFilter({ user_id: userId }, ctx);

  const rows = await UserActivity.findAll({
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email", "avatar_media_id"],
        include: [{ model: MediaFile, as: "avatar", required: false }],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
  });

  return rows.map((row) => {
    const plain = row.toJSON();
    plain.created_at_display = formatForResponse(plain.created_at);
    return plain;
  });
}

module.exports = {
  listForUser,
};
