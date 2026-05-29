const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User } = require("../../models");
const AppError = require("../../utils/app-error");
const { USER_ROLES } = require("../../config/constants");
const { applyTenantFilter, resolveTenantIdForWrite, assertResourceTenant } = require("../../utils/request-context");

async function listUsers(query = {}, ctx) {
  const where = applyTenantFilter({}, ctx);

  if (query.include_inactive !== "true") where.is_active = true;
  if (query.include_hidden !== "true") where.is_hidden = false;

  if (!ctx.isSuperAdmin) {
    where.role = { [Op.ne]: "super_admin" };
  }

  return User.findAll({
    where,
    order: [["name", "ASC"]],
  });
}

async function createUser(payload, ctx) {
  if (!payload.name?.trim() || !payload.email?.trim()) {
    throw new AppError("name e email são obrigatórios", 400, "VALIDATION_ERROR");
  }

  if (!payload.password || payload.password.length < 6) {
    throw new AppError("password é obrigatório (mín. 6 caracteres)", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);
  const role = payload.role || "developer";

  if (!USER_ROLES.includes(role) || role === "super_admin") {
    throw new AppError("role inválido", 400, "VALIDATION_ERROR");
  }

  const email = payload.email.trim().toLowerCase();
  const existing = await User.findOne({ where: { email, tenant_id: tenantId } });
  if (existing) {
    throw new AppError("E-mail já cadastrado nesta organização", 409, "EMAIL_EXISTS");
  }

  return User.create({
    tenant_id: tenantId,
    name: payload.name.trim(),
    email,
    password_hash: await bcrypt.hash(payload.password, 10),
    role,
    is_active: payload.is_active ?? true,
    is_hidden: payload.is_hidden ?? false,
  });
}

async function getUserById(id, ctx) {
  const user = await User.findByPk(id, {
    include: [{ association: "avatar", required: false }, { association: "tenant", required: false }],
  });

  if (user?.role === "super_admin" && !ctx.isSuperAdmin) {
    throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  }

  return assertResourceTenant(user, ctx, "USER_NOT_FOUND");
}

module.exports = { listUsers, createUser, getUserById };
