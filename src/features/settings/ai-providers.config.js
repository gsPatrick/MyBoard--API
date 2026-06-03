const AI_PROVIDER_IDS = ["gpt", "claude", "gemini", "custom"];

const CUSTOM_API_SURFACE_PRESETS = {
  openai: {
    id: "openai",
    label: "OpenAI (GPT)",
    chat_model: "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    chat_model: "claude-sonnet-4-5-20250929",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    chat_model: "gemini-2.5-pro",
  },
};

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
    api_surface: "openai",
    base_url: "http://localhost:8317",
    chat_model: CUSTOM_API_SURFACE_PRESETS.openai.chat_model,
    embedding_model: null,
    key_hint: "your-api-key-1",
    docs_url: null,
    description:
      "CLIProxyAPI: escolha a superfície (GPT / Claude / Gemini), endpoint, token e model id do proxy.",
  },
};

/** Embeddings RAG no modo custom — Gemini direto (gratuito), fora do proxy */
const FIXED_GEMINI_EMBEDDING = {
  provider: "gemini",
  api_format: "openai",
  base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
  embedding_model: "text-embedding-004",
};

function stripTrailingSlashes(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeCustomApiSurface(value) {
  const id = String(value || "openai").toLowerCase();
  return CUSTOM_API_SURFACE_PRESETS[id] ? id : "openai";
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

function resolveCustomSurfaceBaseUrl(proxyRoot, apiSurface) {
  const root = normalizeCustomProxyRoot(proxyRoot);
  if (apiSurface === "gemini") return `${root}/v1beta`;
  return `${root}/v1`;
}

function resolveCustomApiFormat(apiSurface) {
  if (apiSurface === "anthropic") return "anthropic";
  if (apiSurface === "gemini") return "gemini";
  return "openai";
}

function resolveProviderBaseUrl(providerId, config = {}) {
  const preset = AI_PROVIDER_PRESETS[providerId];
  const raw = config.base_url || preset.base_url || null;
  if (providerId === "custom") {
    const surface = normalizeCustomApiSurface(config.api_surface || preset.api_surface);
    return resolveCustomSurfaceBaseUrl(raw, surface);
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
      api_surface: preset.api_surface || "openai",
      chat_model: preset.chat_model,
      embedding_model: preset.embedding_model,
      api_key: null,
      gemini_api_key: null,
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
      base_url: ai.base_url || providers.custom.base_url,
      chat_model: ai.chat_model || providers.custom.chat_model,
    };
  }

  for (const id of AI_PROVIDER_IDS) {
    const preset = AI_PROVIDER_PRESETS[id];
    const surface = normalizeCustomApiSurface(providers[id]?.api_surface || preset.api_surface);
    providers[id] = {
      enabled: Boolean(providers[id]?.enabled),
      base_url:
        id === "custom"
          ? normalizeCustomProxyRoot(providers[id]?.base_url || preset.base_url)
          : providers[id]?.base_url || preset.base_url,
      api_surface: id === "custom" ? surface : preset.api_surface || "openai",
      chat_model: providers[id]?.chat_model || preset.chat_model,
      embedding_model:
        id === "custom"
          ? null
          : providers[id]?.embedding_model !== undefined
            ? providers[id].embedding_model
            : preset.embedding_model,
      api_key: providers[id]?.api_key || null,
      gemini_api_key: id === "custom" ? providers[id]?.gemini_api_key || null : null,
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
  CUSTOM_API_SURFACE_PRESETS,
  FIXED_GEMINI_EMBEDDING,
  normalizeProviderId,
  normalizeCustomApiSurface,
  normalizeCustomProxyRoot,
  resolveCustomSurfaceBaseUrl,
  resolveCustomApiFormat,
  buildDefaultProviders,
  migrateLegacyAiSettings,
  resolveProviderBaseUrl,
  stripTrailingSlashes,
};
