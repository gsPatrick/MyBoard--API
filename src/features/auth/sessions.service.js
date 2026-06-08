const crypto = require("crypto");
const { Op } = require("sequelize");
const { UserSession } = require("../../models");
const { signAccessToken } = require("../../utils/jwt");
const AppError = require("../../utils/app-error");

const ALLOWED_PLATFORMS = ["web", "macos", "windows"];
const TOUCH_THROTTLE_MS = 60 * 1000; // só atualiza last_seen/ip 1x por minuto

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || null;
}

function parseUserAgent(ua = "") {
  let browser = null;
  let os = null;
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";

  return { browser, os };
}

function parseClient(req) {
  const ua = req.headers["user-agent"] || "";
  const hinted = String(req.headers["x-client-platform"] || "").toLowerCase();
  const { browser, os } = parseUserAgent(ua);

  const platform = ALLOWED_PLATFORMS.includes(hinted) ? hinted : "web";

  let clientName;
  if (platform === "macos") clientName = "MyBoard Desktop · Mac";
  else if (platform === "windows") clientName = "MyBoard Desktop · Windows";
  else clientName = browser ? `${browser}${os ? ` · ${os}` : ""}` : "Navegador";

  return {
    platform,
    clientName,
    browser,
    os,
    userAgent: ua ? String(ua).slice(0, 1024) : null,
    ip: clientIp(req),
  };
}

/** Cria uma sessão e devolve um token JWT carregando o jti dela. */
async function issueWithSession(user, req) {
  const jti = crypto.randomUUID();
  const info = parseClient(req);

  try {
    await UserSession.create({
      user_id: user.id,
      jti,
      platform: info.platform,
      client_name: info.clientName,
      browser: info.browser,
      os: info.os,
      user_agent: info.userAgent,
      ip_address: info.ip,
      last_seen_at: new Date(),
    });
    return { token: signAccessToken(user, { jti }), jti };
  } catch (err) {
    // Tabela ainda não migrada / erro de DB → não bloqueia o login.
    // Emite um token sem sessão (rastreio passa a funcionar após a migração).
    // eslint-disable-next-line no-console
    console.warn("[sessions] issueWithSession falhou, emitindo token sem sessão:", err.message);
    return { token: signAccessToken(user), jti: null };
  }
}

/** Renova o token mantendo a mesma sessão (ou cria uma se for token antigo). */
async function refreshToken(req) {
  const jti = req.auth?.jti;
  if (jti) {
    try {
      await UserSession.update(
        { last_seen_at: new Date(), ip_address: clientIp(req) },
        { where: { jti, revoked_at: null } }
      );
    } catch {
      /* ignora erro de DB ao tocar a sessão */
    }
    return signAccessToken(req.user, { jti });
  }
  const { token } = await issueWithSession(req.user, req);
  return token;
}

/**
 * Valida a sessão do token no middleware: bloqueia se foi revogada e
 * atualiza last_seen/ip de forma throttled. Tokens antigos (sem jti) passam.
 */
async function verifyAndTouch(payload, req) {
  const jti = payload?.jti;
  if (!jti) return;

  let session;
  try {
    session = await UserSession.findOne({ where: { jti } });
  } catch {
    return; // tabela ausente / erro de DB → não bloqueia o acesso
  }

  if (!session) return; // sessão não rastreada → não bloqueia

  if (session.revoked_at) {
    throw new AppError("Sessão encerrada neste dispositivo", 401, "SESSION_REVOKED");
  }

  const last = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - last > TOUCH_THROTTLE_MS) {
    try {
      session.last_seen_at = new Date();
      session.ip_address = clientIp(req);
      await session.save();
    } catch {
      /* ignora erro de DB ao tocar a sessão */
    }
  }
}

function presentSession(row, currentJti) {
  return {
    id: row.id,
    platform: row.platform,
    client_name: row.client_name,
    browser: row.browser,
    os: row.os,
    ip_address: row.ip_address,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    current: currentJti ? row.jti === currentJti : false,
  };
}

async function listSessions(userId, currentJti) {
  try {
    const rows = await UserSession.findAll({
      where: { user_id: userId, revoked_at: null },
      order: [["last_seen_at", "DESC"]],
    });
    return rows.map((r) => presentSession(r, currentJti));
  } catch {
    return []; // tabela ainda não migrada
  }
}

async function revokeSession(userId, id, currentJti) {
  const session = await UserSession.findOne({ where: { id, user_id: userId } });
  if (!session) {
    throw new AppError("Sessão não encontrada", 404, "SESSION_NOT_FOUND");
  }
  if (!session.revoked_at) {
    session.revoked_at = new Date();
    await session.save();
  }
  return { message: "Sessão desconectada.", current: session.jti === currentJti };
}

async function revokeOthers(userId, currentJti) {
  const where = { user_id: userId, revoked_at: null };
  if (currentJti) where.jti = { [Op.ne]: currentJti };
  const count = await UserSession.update({ revoked_at: new Date() }, { where });
  return { message: "Outras sessões desconectadas.", revoked: Array.isArray(count) ? count[0] : count };
}

module.exports = {
  parseClient,
  issueWithSession,
  refreshToken,
  verifyAndTouch,
  listSessions,
  revokeSession,
  revokeOthers,
};
