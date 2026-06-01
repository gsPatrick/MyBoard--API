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
    label: "Agente / CLI",
    api_format: "openai",
    base_url: "https://openrouter.ai/api/v1",
    chat_model: "openai/gpt-4o-mini",
    embedding_model: "openai/text-embedding-3-small",
    key_hint: "Token da API ou do agente",
    docs_url: null,
    description:
      "Qualquer API compatível com OpenAI — OpenRouter, proxy local, token de agente CLI, etc.",
  },
};

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
};
