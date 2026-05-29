const resolveTenant = (req, _res, next) => {
  if (!req.user) {
    req.tenantId = null;
    req.isSuperAdmin = false;
    return next();
  }

  if (req.user.role === "super_admin") {
    req.isSuperAdmin = true;
    req.tenantId =
      req.headers["x-tenant-id"] ||
      req.query.tenant_id ||
      req.body?.tenant_id ||
      null;
  } else {
    req.isSuperAdmin = false;
    req.tenantId = req.user.tenant_id || null;
  }

  next();
};

module.exports = resolveTenant;
