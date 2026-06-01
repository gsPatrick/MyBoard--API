const { Tenant, WhatsappInstance } = require("../../models");
const AppError = require("../../utils/app-error");
const { resolveTenantIdForWrite } = require("../../utils/request-context");
const openRouterClient = require("../../providers/openrouter/openrouter.client");
const policyEngine = require("../bordie/policy-engine.service");
const {
  AI_PROVIDER_IDS,
  AI_PROVIDER_PRESETS,
  normalizeProviderId,
  migrateLegacyAiSettings,
} = require("./ai-providers.config");

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

function sanitizeProviderConfig(providerId, config = {}) {
  const preset = AI_PROVIDER_PRESETS[providerId];
  const hasKey = Boolean(config.api_key);
  return {
    id: providerId,
    label: preset.label,
    enabled: Boolean(config.enabled),
    api_format: preset.api_format,
    base_url: config.base_url || preset.base_url,
    chat_model: config.chat_model || preset.chat_model,
    embedding_model: config.embedding_model ?? preset.embedding_model,
    has_api_key: hasKey,
    api_key_masked: hasKey ? maskSecret(config.api_key) : null,
    configured: hasKey,
    description: preset.description,
    key_hint: preset.key_hint,
    docs_url: preset.docs_url,
  };
}

function sanitizeAiSettings(ai = {}) {
  const migrated = migrateLegacyAiSettings(ai);
  const activeProvider = normalizeProviderId(migrated.active_provider);
  const activeConfig = migrated.providers[activeProvider] || {};

  const providers = AI_PROVIDER_IDS.reduce((acc, id) => {
    acc[id] = sanitizeProviderConfig(id, migrated.providers[id]);
    return acc;
  }, {});

  const hasActiveKey = Boolean(activeConfig.api_key);
  const envFallback = openRouterClient.isConfigured();

  return {
    active_provider: activeProvider,
    providers,
    provider: activeProvider,
    base_url: activeConfig.base_url || AI_PROVIDER_PRESETS[activeProvider].base_url,
    chat_model: activeConfig.chat_model || AI_PROVIDER_PRESETS[activeProvider].chat_model,
    embedding_model:
      activeConfig.embedding_model ?? AI_PROVIDER_PRESETS[activeProvider].embedding_model,
    has_api_key: hasActiveKey,
    api_key_masked: hasActiveKey ? maskSecret(activeConfig.api_key) : null,
    configured: hasActiveKey || envFallback,
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
  const migrated = migrateLegacyAiSettings(tenant.settings?.ai || {});
  const next = { ...migrated };

  if (payload.active_provider !== undefined) {
    next.active_provider = normalizeProviderId(payload.active_provider);
  }

  const providerId = normalizeProviderId(payload.provider || payload.active_provider || next.active_provider);
  const providerConfig = { ...(next.providers[providerId] || {}) };
  const preset = AI_PROVIDER_PRESETS[providerId];
  const isCustom = providerId === "custom";

  if (payload.enabled !== undefined) providerConfig.enabled = Boolean(payload.enabled);

  if (isCustom) {
    if (payload.base_url !== undefined) {
      providerConfig.base_url = String(payload.base_url || "").trim() || preset.base_url;
    }
    if (payload.chat_model !== undefined) {
      providerConfig.chat_model = String(payload.chat_model || "").trim() || preset.chat_model;
    }
    if (payload.embedding_model !== undefined) {
      providerConfig.embedding_model = String(payload.embedding_model || "").trim() || null;
    }
  } else {
    providerConfig.base_url = preset.base_url;
    providerConfig.chat_model = preset.chat_model;
    providerConfig.embedding_model = preset.embedding_model;
  }

  if (payload.api_key !== undefined) {
    const key = String(payload.api_key || "").trim();
    if (key && !key.includes("••••")) providerConfig.api_key = key;
  }

  if (payload.openrouter_api_key !== undefined) {
    const key = String(payload.openrouter_api_key || "").trim();
    if (key && !key.includes("••••")) {
      providerConfig.api_key = key;
      next.active_provider = providerId;
    }
  }

  if (payload.clear_api_key === true) {
    delete providerConfig.api_key;
  }

  if (providerConfig.api_key) {
    providerConfig.enabled = true;
    next.active_provider = providerId;
  }

  next.providers = {
    ...next.providers,
    [providerId]: providerConfig,
  };

  delete next.openrouter_api_key;
  delete next.base_url;
  delete next.chat_model;
  delete next.embedding_model;

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
  const credentials = await resolveAiCredentials(tenant.id);

  if (!credentials.apiKey) {
    return { ok: false, message: "Nenhuma chave de API configurada para o provedor ativo." };
  }

  try {
    const response = await openRouterClient.createChatCompletion({
      apiKey: credentials.apiKey,
      baseUrl: credentials.baseUrl,
      model: credentials.chatModel,
      apiFormat: credentials.apiFormat,
      messages: [{ role: "user", content: "Responda apenas: ok" }],
      max_tokens: 8,
      temperature: 0,
    });

    return {
      ok: true,
      message: `Conexão com ${AI_PROVIDER_PRESETS[credentials.provider]?.label || credentials.provider} OK.`,
      sample: String(response.content || "").slice(0, 80),
      provider: credentials.provider,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "Falha ao conectar com a IA.",
      provider: credentials.provider,
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
  const migrated = migrateLegacyAiSettings(ai);
  const provider = normalizeProviderId(migrated.active_provider);
  const config = migrated.providers[provider] || {};
  const preset = AI_PROVIDER_PRESETS[provider];

  const envKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || null;

  return {
    provider,
    apiFormat: preset.api_format,
    apiKey: config.api_key || envKey,
    baseUrl: config.base_url || preset.base_url || process.env.OPENROUTER_BASE_URL || null,
    chatModel: config.chat_model || preset.chat_model || process.env.OPENROUTER_CHAT_MODEL || null,
    embeddingModel:
      config.embedding_model ??
      preset.embedding_model ??
      process.env.OPENROUTER_EMBEDDING_MODEL ??
      null,
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
