const AppError = require("../utils/app-error");
const { verifyAccessToken } = require("../utils/jwt");
const { User, Tenant } = require("../models");
const catchAsync = require("./catch-async");

const authenticate = catchAsync(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    throw new AppError("Autenticação necessária", 401, "UNAUTHORIZED");
  }

  const payload = verifyAccessToken(token);
  const user = await User.scope("withPassword").findByPk(payload.sub, {
    include: [{ model: Tenant, as: "tenant", required: false }],
  });

  if (!user || !user.is_active) {
    throw new AppError("Usuário inválido ou inativo", 401, "UNAUTHORIZED");
  }

  req.user = user;
  req.auth = payload;
  next();
});

module.exports = authenticate;
