const AppError = require("../utils/app-error");

function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError("Autenticação necessária", 401, "UNAUTHORIZED"));
    }

    if (req.user.role === "super_admin") {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError("Sem permissão para esta ação", 403, "FORBIDDEN"));
    }

    return next();
  };
}

module.exports = authorize;
