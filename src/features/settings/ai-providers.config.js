const DEFAULT_CLIPROXY_URL = "https://geral-cli-antigravity-patrick.r954jc.easypanel.host";

const AI_PROVIDER_IDS = ["gpt", "claude", "gemini", "custom"];

const AI_PROVIDER_PRESETS = {
  gpt: {
    id: "gpt",
    label: "ChatGPT",
    api_format: "openai",
    base_url: "https://api.openai.com/v1",
    chat_model: "gpt-4o-mini",
    embedding_model: "text-embedding-3-small",
    key_hint: "sk-...",
    docs_url: "https://platform.openai.com/api-keys",
    description: "API oficial da OpenAI (GPT-4o, GPT-4o mini, etc.).",
  },
  claude: {
    id: "claude",
    label: "Claude",
    api_format: "anthropic",
    base_url: "https://api.anthropic.com/v1",
    chat_model: "claude-sonnet-4-20250514",
    embedding_model: null,
    key_hint: "sk-ant-...",
    docs_url: "https://console.anthropic.com/settings/keys",
    description: "API oficial da Anthropic (Claude Sonnet, Opus, etc.).",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    api_format: "openai",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    chat_model: "gemini-2.0-flash",
    embedding_model: "text-embedding-004",
    key_hint: "AIza...",
    docs_url: "https://aistudio.google.com/apikey",
    description: "Google AI Studio / Gemini via endpoint compatível OpenAI.",
  },
  custom: {
    id: "custom",
    label: "Proxy / CLI",
    api_format: "openai",
    base_url: DEFAULT_CLIPROXY_URL,
    chat_model: "gemini-2.5-flash",
    embedding_model: null,
    key_hint: "batata",
    docs_url: null,
    description:
      "CLIProxyAPI: URL da API, Bearer token (api-keys) e model id de GET /v1/models.",
  },
};

const FIXED_GEMINI_EMBEDDING = {
  provider: "gemini",
  api_format: "openai",
  base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
  embedding_model: "text-embedding-004",
};

function stripTrailingSlashes(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeCustomProxyRoot(rawUrl) {
  let url = stripTrailingSlashes(rawUrl);
  if (!url) return AI_PROVIDER_PRESETS.custom.base_url;

  for (let i = 0; i < 5; i += 1) {
    const next = stripTrailingSlashes(url)
      .replace(/\/v1beta$/i, "")
      .replace(/\/v1$/i, "")
      .replace(/\/chat\/completions$/i, "")
      .replace(/\/embeddings$/i, "")
      .replace(/\/messages$/i, "")
      .replace(/\/models\/[^/]+:generateContent$/i, "");
    if (next === url) break;
    url = next;
  }

  return url || AI_PROVIDER_PRESETS.custom.base_url;
}

function resolveCustomOpenAiBaseUrl(proxyRoot) {
  return `${normalizeCustomProxyRoot(proxyRoot)}/v1`;
}

function isLegacyOpenRouterUrl(url) {
  return /openrouter\.ai/i.test(String(url || ""));
}

function sanitizeCustomProviderConfig(config = {}) {
  const preset = AI_PROVIDER_PRESETS.custom;
  let baseUrl = normalizeCustomProxyRoot(config.base_url || preset.base_url);
  let chatModel = config.chat_model || preset.chat_model;

  if (isLegacyOpenRouterUrl(baseUrl)) {
    baseUrl = preset.base_url;
    if (/^openai\//i.test(chatModel)) {
      chatModel = preset.chat_model;
    }
  }

  return { baseUrl, chatModel };
}

function resolveProviderBaseUrl(providerId, config = {}) {
  const preset = AI_PROVIDER_PRESETS[providerId];
  const raw = config.base_url || preset.base_url || null;
  if (providerId === "custom") {
    const { baseUrl } = sanitizeCustomProviderConfig(config);
    return resolveCustomOpenAiBaseUrl(baseUrl);
  }
  return stripTrailingSlashes(raw);
}

function normalizeProviderId(value) {
  const id = String(value || "gpt").toLowerCase();
  return AI_PROVIDER_IDS.includes(id) ? id : "gpt";
}

function buildDefaultProviders() {
  return AI_PROVIDER_IDS.reduce((acc, id) => {
    const preset = AI_PROVIDER_PRESETS[id];
    acc[id] = {
      enabled: id === "gpt",
      base_url: preset.base_url,
      chat_model: preset.chat_model,
      embedding_model: preset.embedding_model,
      api_key: null,
    };
    return acc;
  }, {});
}

function migrateLegacyAiSettings(ai = {}) {
  const providers = {
    ...buildDefaultProviders(),
    ...(ai.providers || {}),
  };

  if (ai.openrouter_api_key && !providers.custom?.api_key) {
    providers.custom = {
      ...providers.custom,
      enabled: true,
      api_key: ai.openrouter_api_key,
      base_url: AI_PROVIDER_PRESETS.custom.base_url,
      chat_model: AI_PROVIDER_PRESETS.custom.chat_model,
    };
  }

  for (const id of AI_PROVIDER_IDS) {
    const preset = AI_PROVIDER_PRESETS[id];
    const incoming = providers[id] || {};
    const sanitizedCustom =
      id === "custom" ? sanitizeCustomProviderConfig(incoming) : null;

    providers[id] = {
      enabled: Boolean(incoming.enabled),
      base_url:
        id === "custom" ? sanitizedCustom.baseUrl : incoming.base_url || preset.base_url,
      chat_model:
        id === "custom" ? sanitizedCustom.chatModel : incoming.chat_model || preset.chat_model,
      embedding_model:
        id === "custom"
          ? null
          : incoming.embedding_model !== undefined
            ? incoming.embedding_model
            : preset.embedding_model,
      api_key: incoming.api_key || null,
    };
  }

  return {
    active_provider: normalizeProviderId(ai.active_provider || (ai.openrouter_api_key ? "custom" : "gpt")),
    providers,
  };
}

module.exports = {
  AI_PROVIDER_IDS,
  AI_PROVIDER_PRESETS,
  FIXED_GEMINI_EMBEDDING,
  DEFAULT_CLIPROXY_URL,
  normalizeProviderId,
  normalizeCustomProxyRoot,
  resolveCustomOpenAiBaseUrl,
  sanitizeCustomProviderConfig,
  buildDefaultProviders,
  migrateLegacyAiSettings,
  resolveProviderBaseUrl,
  stripTrailingSlashes,
};
