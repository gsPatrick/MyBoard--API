const { Tenant, User, Client, Project } = require("../../models");
const AppError = require("../../utils/app-error");
const { slugify } = require("../../utils/crypto");

async function listTenants(query = {}) {
  const where = {};
  if (query.is_active === "true") where.is_active = true;
  if (query.is_active === "false") where.is_active = false;

  return Tenant.findAll({
    where,
    order: [["created_at", "DESC"]],
    include: [
      {
        model: User,
        as: "users",
        attributes: ["id", "name", "email", "role", "is_active"],
        where: { role: "admin" },
        required: false,
      },
    ],
  });
}

async function getTenantStats(tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new AppError("Tenant não encontrado", 404, "TENANT_NOT_FOUND");

  const [users, clients, projects] = await Promise.all([
    User.count({ where: { tenant_id: tenantId } }),
    Client.count({ where: { tenant_id: tenantId } }),
    Project.count({ where: { tenant_id: tenantId } }),
  ]);

  return { tenant, stats: { users, clients, projects } };
}

async function updateTenant(id, payload) {
  const tenant = await Tenant.findByPk(id);
  if (!tenant) throw new AppError("Tenant não encontrado", 404, "TENANT_NOT_FOUND");

  const updates = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.plan !== undefined) updates.plan = payload.plan;
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;
  if (payload.settings !== undefined) updates.settings = payload.settings;

  if (payload.slug !== undefined) {
    updates.slug = slugify(payload.slug);
  }

  await tenant.update(updates);
  return tenant;
}

module.exports = { listTenants, getTenantStats, updateTenant };
