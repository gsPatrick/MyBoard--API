const AppError = require("./app-error");

function buildServiceContext(req) {
  return {
    userId: req.user?.id,
    tenantId: req.tenantId ?? null,
    isSuperAdmin: Boolean(req.isSuperAdmin),
    role: req.user?.role,
  };
}

function resolveTenantIdForWrite(ctx, payloadTenantId = null) {
  if (ctx.isSuperAdmin) {
    const id = payloadTenantId || ctx.tenantId;
    if (!id) {
      throw new AppError("super_admin deve informar tenant_id para esta operação", 400, "TENANT_REQUIRED");
    }
    return id;
  }

  if (!ctx.tenantId) {
    throw new AppError("Tenant não vinculado ao usuário", 403, "TENANT_FORBIDDEN");
  }

  return ctx.tenantId;
}

function applyTenantFilter(where, ctx) {
  if (ctx.isSuperAdmin && !ctx.tenantId) {
    return where;
  }

  if (!ctx.tenantId) {
    throw new AppError("Tenant não vinculado ao usuário", 403, "TENANT_FORBIDDEN");
  }

  where.tenant_id = ctx.tenantId;
  return where;
}

function assertResourceTenant(resource, ctx, notFoundCode = "NOT_FOUND") {
  if (!resource) {
    throw new AppError("Recurso não encontrado", 404, notFoundCode);
  }

  if (ctx.isSuperAdmin && !ctx.tenantId) {
    return resource;
  }

  if (!ctx.tenantId) {
    throw new AppError("Tenant não vinculado ao usuário", 403, "TENANT_FORBIDDEN");
  }

  if (resource.tenant_id !== ctx.tenantId) {
    throw new AppError("Acesso negado a este recurso", 403, "TENANT_FORBIDDEN");
  }

  return resource;
}

module.exports = {
  buildServiceContext,
  resolveTenantIdForWrite,
  applyTenantFilter,
  assertResourceTenant,
};
