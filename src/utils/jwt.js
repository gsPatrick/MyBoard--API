const jwt = require("jsonwebtoken");
const AppError = require("./app-error");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_RESET_EXPIRES_IN = process.env.JWT_RESET_EXPIRES_IN || "1h";

function signAccessToken(user, options = {}) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id || null,
  };
  // jti = id da sessão (para rastrear/desconectar dispositivos)
  if (options.jti) payload.jti = options.jti;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError("Token inválido ou expirado", 401, "INVALID_TOKEN");
  }
}

function getResetExpiresAt() {
  const ms = JWT_RESET_EXPIRES_IN.endsWith("h")
    ? Number(JWT_RESET_EXPIRES_IN.replace("h", "")) * 3600000
    : 3600000;
  return new Date(Date.now() + ms);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  getResetExpiresAt,
  JWT_RESET_EXPIRES_IN,
};
