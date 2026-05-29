const { User } = require("../../models");
const AppError = require("../../utils/app-error");

async function listUsers(query = {}) {
  const where = {};
  if (query.include_inactive !== "true") where.is_active = true;
  if (query.include_hidden !== "true") where.is_hidden = false;

  return User.findAll({
    where,
    order: [["name", "ASC"]],
  });
}

async function createUser(payload) {
  if (!payload.name?.trim() || !payload.email?.trim()) {
    throw new AppError("name e email são obrigatórios", 400, "VALIDATION_ERROR");
  }

  return User.create({
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    role: payload.role || "developer",
    is_active: payload.is_active ?? true,
    is_hidden: payload.is_hidden ?? false,
  });
}

async function getUserById(id) {
  const user = await User.findByPk(id, {
    include: [{ association: "avatar", required: false }],
  });
  if (!user) throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  return user;
}

module.exports = { listUsers, createUser, getUserById };
