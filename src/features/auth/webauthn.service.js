const crypto = require("crypto");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const { isoBase64URL, isoUint8Array } = require("@simplewebauthn/server/helpers");
const { UserPasskey, User, Tenant } = require("../../models");
const AppError = require("../../utils/app-error");
const { signAccessToken } = require("../../utils/jwt");
const authService = require("./auth.service");

const RP_NAME = "MyBoard";
const RP_ID = process.env.WEBAUTHN_RP_ID || "myboard.codebypatrick.dev";
const EXPECTED_ORIGINS = (
  process.env.WEBAUTHN_ORIGINS || "https://myboard.codebypatrick.dev,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const EXPECTED_RPIDS = Array.from(new Set([RP_ID, "localhost"]));

// Armazena o challenge entre as duas requisições (TTL 5 min).
// Single-instance é suficiente aqui; em cluster, trocar por Redis/DB.
const challenges = new Map();
const CHALLENGE_TTL = 5 * 60 * 1000;

function putChallenge(data) {
  const flowId = crypto.randomUUID();
  challenges.set(flowId, { ...data, exp: Date.now() + CHALLENGE_TTL });
  return flowId;
}
function takeChallenge(flowId) {
  const entry = challenges.get(flowId);
  challenges.delete(flowId);
  if (!entry || entry.exp < Date.now()) return null;
  return entry;
}

function parseTransports(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// ---- Registro (usuário autenticado) ----
async function registrationOptions(user) {
  const existing = await UserPasskey.findAll({ where: { user_id: user.id } });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: isoUint8Array.fromUTF8String(String(user.id)),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.credential_id,
      transports: parseTransports(p.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "preferred",
    },
  });

  const flowId = putChallenge({ challenge: options.challenge, userId: user.id });
  return { flowId, options };
}

async function verifyRegistration(user, { flowId, response, label }) {
  const flow = takeChallenge(flowId);
  if (!flow || flow.userId !== user.id) {
    throw new AppError("Sessão de registro inválida ou expirada", 400, "WEBAUTHN_FLOW");
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: flow.challenge,
    expectedOrigin: EXPECTED_ORIGINS,
    expectedRPID: EXPECTED_RPIDS,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError("Não foi possível registrar a passkey", 400, "WEBAUTHN_VERIFY");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await UserPasskey.create({
    user_id: user.id,
    credential_id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter || 0,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    device_type: credentialDeviceType || null,
    backed_up: Boolean(credentialBackedUp),
    name: (label || "Touch ID").toString().slice(0, 120),
    last_used_at: new Date(),
  });

  return { verified: true };
}

// ---- Login (sem autenticação) ----
async function authenticationOptions() {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    // sem allowCredentials => credenciais descobríveis (o SO mostra as passkeys do domínio)
  });
  const flowId = putChallenge({ challenge: options.challenge });
  return { flowId, options };
}

async function verifyAuthentication({ flowId, response }) {
  const flow = takeChallenge(flowId);
  if (!flow) {
    throw new AppError("Sessão de login inválida ou expirada", 400, "WEBAUTHN_FLOW");
  }

  const passkey = await UserPasskey.findOne({ where: { credential_id: response.id } });
  if (!passkey) {
    throw new AppError("Passkey não reconhecida", 400, "WEBAUTHN_UNKNOWN");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: flow.challenge,
    expectedOrigin: EXPECTED_ORIGINS,
    expectedRPID: EXPECTED_RPIDS,
    credential: {
      id: passkey.credential_id,
      publicKey: isoBase64URL.toBuffer(passkey.public_key),
      counter: Number(passkey.counter) || 0,
      transports: parseTransports(passkey.transports),
    },
  });

  if (!verification.verified) {
    throw new AppError("Falha na autenticação", 401, "WEBAUTHN_FAILED");
  }

  await passkey.update({
    counter: verification.authenticationInfo.newCounter,
    last_used_at: new Date(),
  });

  const user = await User.findByPk(passkey.user_id, {
    include: [{ model: Tenant, as: "tenant", required: false }],
  });
  if (!user || user.is_active === false) {
    throw new AppError("Usuário inválido", 401, "USER_INACTIVE");
  }

  const token = signAccessToken(user);
  const meResult = await authService.me(user.id); // { user, tenant }
  return { token, ...meResult };
}

// ---- Gerenciamento ----
async function listPasskeys(userId) {
  const items = await UserPasskey.findAll({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
  });
  return items.map((p) => ({
    id: p.id,
    name: p.name,
    device_type: p.device_type,
    backed_up: p.backed_up,
    created_at: p.created_at,
    last_used_at: p.last_used_at,
  }));
}

async function deletePasskey(userId, id) {
  const passkey = await UserPasskey.findOne({ where: { id, user_id: userId } });
  if (!passkey) throw new AppError("Passkey não encontrada", 404, "NOT_FOUND");
  await passkey.destroy();
  return { deleted: true };
}

module.exports = {
  registrationOptions,
  verifyRegistration,
  authenticationOptions,
  verifyAuthentication,
  listPasskeys,
  deletePasskey,
};
