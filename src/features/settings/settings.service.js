const { Tenant, WhatsappInstance } = require("../../models");
const AppError = require("../../utils/app-error");
const { resolveTenantIdForWrite } = require("../../utils/request-context");
const openRouterClient = require("../../providers/openrouter/openrouter.client");
const policyEngine = require("../bordie/policy-engine.service");

const DEFAULT_PRIVACY = {
  retain_whatsapp_raw_days: 30,
  store_audio_transcripts_only: true,
  allow_ai_on_whatsapp: true,
};

function maskSecret(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function sanitizeAiSettings(ai = {}) {
  const hasKey = Boolean(ai.openrouter_api_key);
  return {
    provider: ai.provider || "openrouter",
    base_url: ai.base_url || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    chat_model: ai.chat_model || process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o-mini",
    embedding_model:
      ai.embedding_model || process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small",
    has_api_key: hasKey,
    api_key_masked: hasKey ? maskSecret(ai.openrouter_api_key) : null,
    configured: hasKey || openRouterClient.isConfigured(),
  };
}

async function getTenantForContext(ctx) {
  const tenantId = resolveTenantIdForWrite(ctx);
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) {
    throw new AppError("Organização não encontrada", 404, "TENANT_NOT_FOUND");
  }

  if (!ctx.isSuperAdmin && tenant.id !== ctx.tenantId) {
    throw new AppError("Acesso negado a esta organização", 403, "TENANT_FORBIDDEN");
  }

  return tenant;
}

async function getWorkspaceSettings(ctx) {
  const tenant = await getTenantForContext(ctx);
  const settings = tenant.settings || {};

  const instances = await WhatsappInstance.findAll({
    where: { tenant_id: tenant.id, is_active: true },
    order: [["updated_at", "DESC"]],
    attributes: [
      "id",
      "instance_name",
      "connection_state",
      "evolution_base_url",
      "provider",
      "updated_at",
    ],
  });

  const policy = policyEngine.normalizePolicy(settings.bordie_policy || {});

  return {
    ai: sanitizeAiSettings(settings.ai),
    privacy: {
      ...DEFAULT_PRIVACY,
      ...(settings.privacy || {}),
    },
    bordie_policy: policy,
    whatsapp: {
      instance_count: instances.length,
      instances: instances.map((item) => ({
        id: item.id,
        instance_name: item.instance_name,
        connection_state: item.connection_state,
        evolution_base_url: item.evolution_base_url,
        provider: item.provider,
        updated_at: item.updated_at,
      })),
    },
  };
}

async function updateAiSettings(payload, ctx) {
  const tenant = await getTenantForContext(ctx);
  const current = tenant.settings?.ai || {};
  const next = { ...current };

  if (payload.provider !== undefined) next.provider = payload.provider || "openrouter";
  if (payload.base_url !== undefined) next.base_url = String(payload.base_url || "").trim() || null;
  if (payload.chat_model !== undefined) next.chat_model = String(payload.chat_model || "").trim() || null;
  if (payload.embedding_model !== undefined) {
    next.embedding_model = String(payload.embedding_model || "").trim() || null;
  }

  if (payload.openrouter_api_key !== undefined) {
    const key = String(payload.openrouter_api_key || "").trim();
    if (key && !key.includes("••••")) {
      next.openrouter_api_key = key;
    }
  }

  if (payload.clear_api_key === true) {
    delete next.openrouter_api_key;
  }

  const settings = {
    ...(tenant.settings || {}),
    ai: next,
  };

  await tenant.update({ settings });
  return sanitizeAiSettings(next);
}

async function updatePrivacySettings(payload, ctx) {
  const tenant = await getTenantForContext(ctx);
  const currentPrivacy = {
    ...DEFAULT_PRIVACY,
    ...(tenant.settings?.privacy || {}),
  };

  const privacy = { ...currentPrivacy };
  if (payload.retain_whatsapp_raw_days !== undefined) {
    privacy.retain_whatsapp_raw_days = Math.max(0, Number(payload.retain_whatsapp_raw_days) || 0);
  }
  if (payload.store_audio_transcripts_only !== undefined) {
    privacy.store_audio_transcripts_only = Boolean(payload.store_audio_transcripts_only);
  }
  if (payload.allow_ai_on_whatsapp !== undefined) {
    privacy.allow_ai_on_whatsapp = Boolean(payload.allow_ai_on_whatsapp);
  }

  let bordiePolicy = policyEngine.normalizePolicy(tenant.settings?.bordie_policy || {});
  if (payload.bordie_policy) {
    bordiePolicy = policyEngine.normalizePolicy({
      ...bordiePolicy,
      ...payload.bordie_policy,
    });
  }

  const settings = {
    ...(tenant.settings || {}),
    privacy,
    bordie_policy: bordiePolicy,
  };

  await tenant.update({ settings });
  return {
    privacy,
    bordie_policy: bordiePolicy,
  };
}

async function testAiConnection(ctx) {
  const tenant = await getTenantForContext(ctx);
  const ai = tenant.settings?.ai || {};
  const apiKey = ai.openrouter_api_key || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return { ok: false, message: "Nenhuma chave de API configurada." };
  }

  try {
    const response = await openRouterClient.createChatCompletion({
      apiKey,
      baseUrl: ai.base_url,
      model: ai.chat_model,
      messages: [{ role: "user", content: "Responda apenas: ok" }],
      max_tokens: 8,
      temperature: 0,
    });

    return {
      ok: true,
      message: "Conexão com a IA estabelecida com sucesso.",
      sample: String(response.content || "").slice(0, 80),
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "Falha ao conectar com a IA.",
    };
  }
}

async function resolveTenantAiConfig(tenantId) {
  if (!tenantId) return {};
  const tenant = await Tenant.findByPk(tenantId);
  return tenant?.settings?.ai || {};
}

async function resolveAiCredentials(tenantId) {
  const ai = await resolveTenantAiConfig(tenantId);
  return {
    apiKey: ai.openrouter_api_key || process.env.OPENROUTER_API_KEY || null,
    baseUrl: ai.base_url || process.env.OPENROUTER_BASE_URL || null,
    chatModel: ai.chat_model || process.env.OPENROUTER_CHAT_MODEL || null,
    embeddingModel: ai.embedding_model || process.env.OPENROUTER_EMBEDDING_MODEL || null,
  };
}

module.exports = {
  getWorkspaceSettings,
  updateAiSettings,
  updatePrivacySettings,
  testAiConnection,
  resolveTenantAiConfig,
  resolveAiCredentials,
  sanitizeAiSettings,
  maskSecret,
};
