const settingsService = require("./settings.service");
const llmClient = require("../../providers/openrouter/openrouter.client");
const cliproxyClient = require("../../providers/cliproxy/cliproxy.client");

const EMBEDDING_DIMENSIONS = Number(process.env.OPENROUTER_EMBEDDING_DIMENSIONS || 1536);

function buildOpenAiSurfaceHeaders(apiKey, baseUrl) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (String(baseUrl || "").includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "MyBoard";
  }

  return headers;
}

function resolveEmbeddingBaseUrl(credentials) {
  return String(credentials.baseUrl || "").replace(/\/$/, "");
}

async function getCredentials(tenantId) {
  if (!tenantId) return null;
  return settingsService.resolveAiCredentials(tenantId);
}

async function getEmbeddingCredentials(tenantId) {
  if (!tenantId) return null;
  return settingsService.resolveEmbeddingCredentials(tenantId);
}

function isConfigured(credentials) {
  return Boolean(credentials?.apiKey);
}

async function isConfiguredForTenant(tenantId) {
  const credentials = await getCredentials(tenantId);
  return isConfigured(credentials);
}

function supportsEmbeddings(credentials) {
  return isConfigured(credentials) && Boolean(credentials.embeddingModel);
}

async function supportsEmbeddingsForTenant(tenantId) {
  const credentials = await getEmbeddingCredentials(tenantId);
  return supportsEmbeddings(credentials);
}

async function createChatCompletion(tenantId, options = {}) {
  const ai = await getCredentials(tenantId);

  if (!isConfigured(ai)) {
    const lastUser = [...(options.messages || [])].reverse().find((item) => item.role === "user");
    return {
      content: `IA não configurada. Adicione a chave em Configurações → IA.`,
      raw: null,
      tool_calls: [],
    };
  }

  if (ai.provider === "custom") {
    return cliproxyClient.createChatCompletion({
      apiSurface: ai.apiSurface,
      proxyRoot: ai.proxyRoot,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      model: options.model || ai.chatModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      tools: options.tools,
    });
  }

  return llmClient.createChatCompletion({
    ...options,
    apiKey: ai.apiKey,
    baseUrl: ai.baseUrl,
    model: options.model || ai.chatModel,
    apiFormat: ai.apiFormat,
    provider: ai.provider,
  });
}

async function createEmbedding(tenantId, input) {
  const text = String(input || "").trim();
  if (!text || !tenantId) return null;

  const ai = await getEmbeddingCredentials(tenantId);
  if (!supportsEmbeddings(ai)) return null;

  const baseUrl = resolveEmbeddingBaseUrl(ai);
  const headers = buildOpenAiSurfaceHeaders(ai.apiKey, baseUrl);

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: ai.embeddingModel,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const vector = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || !vector.length) {
    throw new Error("Embedding vazio");
  }

  return {
    model: ai.embeddingModel,
    vector,
  };
}

module.exports = {
  EMBEDDING_DIMENSIONS,
  getCredentials,
  getEmbeddingCredentials,
  isConfigured,
  isConfiguredForTenant,
  supportsEmbeddings,
  supportsEmbeddingsForTenant,
  createChatCompletion,
  createEmbedding,
  buildOpenAiSurfaceHeaders,
};
