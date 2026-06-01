const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User, Tenant, PasswordResetToken, MediaFile, sequelize } = require("../../models");
const AppError = require("../../utils/app-error");
const { slugify } = require("../../utils/crypto");
const { signAccessToken, getResetExpiresAt } = require("../../utils/jwt");
const emailProvider = require("../../providers/email/email.provider");
const tagsService = require("../tags/tags.service");
const {
  ONBOARDING_STATUSES,
  ONBOARDING_VERSION,
} = require("../../config/constants");

function defaultOnboarding() {
  return {
    status: "pending",
    step: 0,
    version: ONBOARDING_VERSION,
    completed_at: null,
  };
}

function normalizeOnboarding(value) {
  if (!value || typeof value !== "object") {
    return defaultOnboarding();
  }

  const storedVersion = Number(value.version) || 0;
  if (
    storedVersion < ONBOARDING_VERSION &&
    (value.status === "pending" || value.status === "in_progress")
  ) {
    return defaultOnboarding();
  }

  return {
    status: ONBOARDING_STATUSES.includes(value.status) ? value.status : "pending",
    step: Number.isFinite(Number(value.step)) ? Math.max(0, Number(value.step)) : 0,
    version: ONBOARDING_VERSION,
    completed_at: value.completed_at || null,
  };
}

async function ensureUniqueTenantSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 1;

  while (await Tenant.findOne({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

async function ensureUniqueEmail(email, tenantId = null) {
  const where = { email: email.toLowerCase() };
  if (tenantId) where.tenant_id = tenantId;

  const existing = await User.findOne({ where });
  if (existing) {
    throw new AppError("E-mail já cadastrado", 409, "EMAIL_EXISTS");
  }
}

function sanitizeUser(user) {
  const json = user?.toSafeJSON ? user.toSafeJSON() : user;
  if (!json) return json;
  delete json.password_hash;
  json.onboarding = normalizeOnboarding(json.onboarding);
  return json;
}

const USER_ME_INCLUDE = [
  { model: Tenant, as: "tenant", required: false },
  { model: MediaFile, as: "avatar", required: false },
];

async function register(payload) {
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password;
  const companyName = payload.company_name?.trim() || payload.tenant_name?.trim();

  if (!name || !email || !password || !companyName) {
    throw new AppError("name, email, password e company_name são obrigatórios", 400, "VALIDATION_ERROR");
  }

  if (password.length < 6) {
    throw new AppError("Senha deve ter no mínimo 6 caracteres", 400, "VALIDATION_ERROR");
  }

  const slug = await ensureUniqueTenantSlug(slugify(payload.company_slug || companyName));

  return sequelize.transaction(async (transaction) => {
    const tenant = await Tenant.create(
      {
        name: companyName,
        slug,
        plan: payload.plan || null,
        is_active: true,
      },
      { transaction }
    );

    await ensureUniqueEmail(email, tenant.id);

    const user = await User.create(
      {
        tenant_id: tenant.id,
        name,
        email,
        password_hash: await bcrypt.hash(password, 10),
        role: "admin",
        is_active: true,
      },
      { transaction }
    );

    await tagsService.seedDefaultTagsForTenant(tenant.id, transaction);

    const token = signAccessToken(user);
    const fullUser = await User.findByPk(user.id, {
      include: [{ model: Tenant, as: "tenant" }],
      transaction,
    });

    return {
      token,
      user: sanitizeUser(fullUser),
      tenant: tenant.toJSON(),
    };
  });
}

async function login(payload) {
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password;
  const tenantSlug = payload.tenant_slug?.trim();

  if (!email || !password) {
    throw new AppError("email e password são obrigatórios", 400, "VALIDATION_ERROR");
  }

  let user;

  if (tenantSlug) {
    const tenant = await Tenant.findOne({ where: { slug: tenantSlug, is_active: true } });
    if (!tenant) {
      throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
    }

    user = await User.scope("withPassword").findOne({
      where: { email, tenant_id: tenant.id, is_active: true },
      include: [{ model: Tenant, as: "tenant", required: false }],
    });
  } else {
    const users = await User.scope("withPassword").findAll({
      where: { email, is_active: true },
      include: [{ model: Tenant, as: "tenant", required: false }],
    });

    const matches = [];
    for (const candidate of users) {
      if (candidate.password_hash && (await bcrypt.compare(password, candidate.password_hash))) {
        matches.push(candidate);
      }
    }

    if (matches.length === 0) {
      throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
    }

    if (matches.length > 1) {
      throw new AppError(
        "Este e-mail existe em mais de uma organização. Informe tenant_slug.",
        409,
        "TENANT_SELECTION_REQUIRED",
        {
          tenants: matches
            .filter((m) => m.tenant)
            .map((m) => ({ slug: m.tenant.slug, name: m.tenant.name })),
        }
      );
    }

    user = matches[0];
  }

  if (!user?.password_hash) {
    throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
  }

  if (user.tenant_id && user.tenant && !user.tenant.is_active) {
    throw new AppError("Conta da organização desativada", 403, "TENANT_INACTIVE");
  }

  const token = signAccessToken(user);

  return {
    token,
    user: sanitizeUser(user),
    tenant: user.tenant ? user.tenant.toJSON() : null,
  };
}

async function me(userId) {
  const user = await User.findByPk(userId, {
    include: USER_ME_INCLUDE,
  });

  if (!user) {
    throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  }

  return {
    user: sanitizeUser(user),
    tenant: user.tenant ? user.tenant.toJSON() : null,
  };
}

async function updateProfile(userId, payload) {
  const user = await User.findByPk(userId, {
    include: USER_ME_INCLUDE,
  });

  if (!user) {
    throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  }

  if (payload.name !== undefined) {
    const name = payload.name?.trim();
    if (!name) {
      throw new AppError("Nome é obrigatório", 400, "VALIDATION_ERROR");
    }
    user.name = name;
  }

  if (payload.email !== undefined) {
    const email = payload.email?.trim().toLowerCase();
    if (!email) {
      throw new AppError("E-mail é obrigatório", 400, "VALIDATION_ERROR");
    }

    const duplicateWhere = {
      email,
      id: { [Op.ne]: userId },
    };

    if (user.tenant_id) {
      duplicateWhere.tenant_id = user.tenant_id;
    }

    const duplicate = await User.findOne({ where: duplicateWhere });
    if (duplicate) {
      throw new AppError("E-mail já cadastrado", 409, "EMAIL_EXISTS");
    }

    user.email = email;
  }

  await user.save();
  await user.reload({ include: USER_ME_INCLUDE });

  return {
    user: sanitizeUser(user),
    tenant: user.tenant ? user.tenant.toJSON() : null,
  };
}

async function updateOnboarding(userId, payload) {
  const user = await User.findByPk(userId, {
    include: USER_ME_INCLUDE,
  });

  if (!user) {
    throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  }

  const current = normalizeOnboarding(user.onboarding);
  const next = { ...current };

  if (payload.status !== undefined) {
    if (!ONBOARDING_STATUSES.includes(payload.status)) {
      throw new AppError("Status de onboarding inválido", 400, "VALIDATION_ERROR");
    }
    next.status = payload.status;

    if (payload.status === "completed" || payload.status === "skipped") {
      next.completed_at = new Date().toISOString();
    }

    if (payload.status === "in_progress") {
      next.completed_at = null;
    }
  }

  if (payload.step !== undefined) {
    const step = Number(payload.step);
    if (!Number.isFinite(step) || step < 0) {
      throw new AppError("Passo de onboarding inválido", 400, "VALIDATION_ERROR");
    }
    next.step = Math.floor(step);

    if (next.status === "pending") {
      next.status = "in_progress";
    }
  }

  next.version = ONBOARDING_VERSION;
  user.onboarding = next;
  await user.save();
  await user.reload({ include: USER_ME_INCLUDE });

  return {
    user: sanitizeUser(user),
    tenant: user.tenant ? user.tenant.toJSON() : null,
  };
}

async function forgotPassword(payload) {
  const email = payload.email?.trim().toLowerCase();
  if (!email) {
    throw new AppError("email é obrigatório", 400, "VALIDATION_ERROR");
  }

  const user = await User.scope("withPassword").findOne({ where: { email, is_active: true } });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await PasswordResetToken.update(
      { used_at: new Date() },
      { where: { user_id: user.id, used_at: null } }
    );

    await PasswordResetToken.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: getResetExpiresAt(),
    });

    await emailProvider.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token: rawToken,
    });
  }

  return {
    message: "Se o e-mail existir, enviaremos instruções para redefinir a senha.",
  };
}

async function resetPassword(payload) {
  const token = payload.token?.trim();
  const password = payload.password;

  if (!token || !password) {
    throw new AppError("token e password são obrigatórios", 400, "VALIDATION_ERROR");
  }

  if (password.length < 6) {
    throw new AppError("Senha deve ter no mínimo 6 caracteres", 400, "VALIDATION_ERROR");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetRecord = await PasswordResetToken.findOne({
    where: {
      token_hash: tokenHash,
      used_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!resetRecord) {
    throw new AppError("Token inválido ou expirado", 400, "INVALID_RESET_TOKEN");
  }

  const user = await User.scope("withPassword").findByPk(resetRecord.user_id);
  if (!user) {
    throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  }

  await user.update({ password_hash: await bcrypt.hash(password, 10) });
  await resetRecord.update({ used_at: new Date() });

  return { message: "Senha redefinida com sucesso." };
}

async function changePassword(userId, payload) {
  const currentPassword = payload.current_password;
  const newPassword = payload.new_password;

  if (!currentPassword || !newPassword) {
    throw new AppError("current_password e new_password são obrigatórios", 400, "VALIDATION_ERROR");
  }

  if (newPassword.length < 6) {
    throw new AppError("Nova senha deve ter no mínimo 6 caracteres", 400, "VALIDATION_ERROR");
  }

  const user = await User.scope("withPassword").findByPk(userId);
  if (!user?.password_hash) {
    throw new AppError("Usuário não encontrado", 404, "USER_NOT_FOUND");
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    throw new AppError("Senha atual incorreta", 400, "INVALID_PASSWORD");
  }

  await user.update({ password_hash: await bcrypt.hash(newPassword, 10) });
  return { message: "Senha alterada com sucesso." };
}

module.exports = {
  register,
  login,
  me,
  updateProfile,
  updateOnboarding,
  forgotPassword,
  resetPassword,
  changePassword,
  sanitizeUser,
};
