const settingsService = require("./settings.service");
const llmClient = require("../../providers/openrouter/openrouter.client");

const EMBEDDING_DIMENSIONS = Number(process.env.OPENROUTER_EMBEDDING_DIMENSIONS || 1536);

async function getCredentials(tenantId) {
  if (!tenantId) return null;
  return settingsService.resolveAiCredentials(tenantId);
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

  return llmClient.createChatCompletion({
    ...options,
    apiKey: ai.apiKey,
    baseUrl: ai.baseUrl,
    model: options.model || ai.chatModel,
    apiFormat: ai.apiFormat,
  });
}

async function createEmbedding(tenantId, input) {
  const text = String(input || "").trim();
  if (!text || !tenantId) return null;

  const ai = await getCredentials(tenantId);
  if (!supportsEmbeddings(ai)) return null;

  const baseUrl = String(ai.baseUrl || "").replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${ai.apiKey}`,
    "Content-Type": "application/json",
  };

  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "MyBoard RAG";
  }

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
  isConfigured,
  isConfiguredForTenant,
  supportsEmbeddings,
  createChatCompletion,
  createEmbedding,
};
