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
    base_url: "http://localhost:8317",
    chat_model: "gemini-2.5-pro",
    embedding_model: "text-embedding-3-small",
    key_hint: "your-api-key-1",
    docs_url: null,
    description:
      "CLIProxyAPI ou gateway compatível OpenAI (/v1). Informe host:porta, Bearer token e model id listado em GET /v1/models.",
  },
};

function stripTrailingSlashes(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

/**
 * Normaliza a URL do modo custom para a superfície OpenAI do CLIProxyAPI:
 * http://host:8317  →  http://host:8317/v1
 * Requisições: POST {base}/chat/completions e POST {base}/embeddings com Authorization: Bearer
 */
function normalizeCustomOpenAiBaseUrl(rawUrl) {
  let url = stripTrailingSlashes(rawUrl);
  if (!url) return "http://localhost:8317/v1";

  url = url.replace(/\/chat\/completions$/i, "");
  url = url.replace(/\/embeddings$/i, "");
  url = url.replace(/\/messages$/i, "");
  url = stripTrailingSlashes(url);

  if (!/\/v1$/i.test(url)) {
    url = `${url}/v1`;
  }

  return url;
}

function resolveProviderBaseUrl(providerId, config = {}) {
  const preset = AI_PROVIDER_PRESETS[providerId];
  const raw = config.base_url || preset.base_url || null;
  if (providerId === "custom") {
    return normalizeCustomOpenAiBaseUrl(raw);
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
      base_url: ai.base_url || providers.custom.base_url,
      chat_model: ai.chat_model || providers.custom.chat_model,
      embedding_model: ai.embedding_model || providers.custom.embedding_model,
    };
  }

  for (const id of AI_PROVIDER_IDS) {
    const preset = AI_PROVIDER_PRESETS[id];
    providers[id] = {
      enabled: Boolean(providers[id]?.enabled),
      base_url: providers[id]?.base_url || preset.base_url,
      chat_model: providers[id]?.chat_model || preset.chat_model,
      embedding_model:
        providers[id]?.embedding_model !== undefined
          ? providers[id].embedding_model
          : preset.embedding_model,
      api_key: providers[id]?.api_key || null,
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
  normalizeProviderId,
  buildDefaultProviders,
  migrateLegacyAiSettings,
  normalizeCustomOpenAiBaseUrl,
  resolveProviderBaseUrl,
  stripTrailingSlashes,
};
