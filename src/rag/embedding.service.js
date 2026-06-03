const aiRuntime = require("../features/settings/ai-runtime.service");

function toPgVectorLiteral(vector) {
  if (!Array.isArray(vector) || !vector.length) return null;
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function buildEmbeddingFields(vector) {
  const literal = toPgVectorLiteral(vector);
  if (!literal) return { embedding: null, embedding_vector: null };

  const { Sequelize } = require("sequelize");
  const fields = {
    embedding: vector,
    embedding_vector: null,
  };

  if (vector.length === aiRuntime.EMBEDDING_DIMENSIONS) {
    fields.embedding_vector = Sequelize.literal(`'${literal}'::vector`);
  }

  return fields;
}

async function isConfigured(tenantId) {
  if (!tenantId) return false;
  return aiRuntime.supportsEmbeddingsForTenant(tenantId);
}

async function createEmbedding(input, tenantId) {
  const text = String(input || "").trim();
  if (!text || !tenantId) return null;
  return aiRuntime.createEmbedding(tenantId, text);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  EMBEDDING_DIMENSIONS: aiRuntime.EMBEDDING_DIMENSIONS,
  isConfigured,
  createEmbedding,
  cosineSimilarity,
  toPgVectorLiteral,
  buildEmbeddingFields,
};
