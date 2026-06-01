const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = Number(process.env.OPENROUTER_EMBEDDING_DIMENSIONS || 1536);

function isConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function toPgVectorLiteral(vector) {
  if (!Array.isArray(vector) || !vector.length) return null;
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function buildEmbeddingFields(vector) {
  const literal = toPgVectorLiteral(vector);
  if (!literal) return { embedding: null, embedding_vector: null };

  const { Sequelize } = require("sequelize");
  return {
    embedding: vector,
    embedding_vector: Sequelize.literal(`'${literal}'::vector`),
  };
}

async function createEmbedding(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  if (!isConfigured()) return null;

  const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "MyBoard Bordie RAG",
    },
    body: JSON.stringify({
      model: OPENROUTER_EMBEDDING_MODEL,
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
    model: OPENROUTER_EMBEDDING_MODEL,
    vector,
  };
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
  OPENROUTER_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  isConfigured,
  createEmbedding,
  cosineSimilarity,
  toPgVectorLiteral,
  buildEmbeddingFields,
};
