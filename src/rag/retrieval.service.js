const { Op, Sequelize } = require("sequelize");
const { RagChunk, RagSummary, sequelize } = require("../models");
const { createEmbedding, cosineSimilarity, isConfigured } = require("./embedding.service");
const aiRuntime = require("../features/settings/ai-runtime.service");
const promptLoader = require("../ai/prompt-loader");
const { expandQuery } = require("./query-expansion.service");
const factsRetrieval = require("./facts-retrieval.service");
const { hashContent } = require("./content-hash");

function buildScopeWhere(tenantId, scope = {}) {
  const where = { tenant_id: tenantId };

  if (scope.client_id) where.client_id = scope.client_id;
  if (scope.project_id) where.project_id = scope.project_id;
  if (scope.channel) where.channel = scope.channel;
  if (scope.conversation_id) where.conversation_id = scope.conversation_id;

  if (scope.channels?.length) {
    where.channel = { [Op.in]: scope.channels };
  }

  return where;
}

async function fullTextSearch(tenantId, query, scope = {}, limit = 12) {
  const where = buildScopeWhere(tenantId, scope);
  const q = String(query || "").trim();
  if (!q) return [];

  const rows = await RagChunk.findAll({
    where: {
      ...where,
      [Op.and]: Sequelize.literal(
        `search_vector @@ plainto_tsquery('portuguese', ${sequelize.escape(q)})`
      ),
    },
    limit,
    order: [["updated_at", "DESC"]],
  }).catch(async () => {
    return RagChunk.findAll({
      where: {
        ...where,
        content: { [Op.iLike]: `%${q.slice(0, 120)}%` },
      },
      limit,
      order: [["updated_at", "DESC"]],
    });
  });

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    score: 0.55,
    source: "keyword",
    channel: row.channel,
    client_id: row.client_id,
    project_id: row.project_id,
    conversation_id: row.conversation_id,
    metadata: row.metadata,
  }));
}

async function fuzzySearch(tenantId, query, scope = {}, limit = 8) {
  const where = buildScopeWhere(tenantId, scope);
  const q = String(query || "").trim().slice(0, 80);
  if (!q) return [];

  const rows = await RagChunk.findAll({
    where: {
      ...where,
      content: { [Op.iLike]: `%${q.split(/\s+/).slice(0, 3).join("%")}%` },
    },
    limit,
    order: [["updated_at", "DESC"]],
  });

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    score: 0.42,
    source: "fuzzy",
    channel: row.channel,
    client_id: row.client_id,
    project_id: row.project_id,
    conversation_id: row.conversation_id,
    metadata: row.metadata,
  }));
}

async function vectorSearch(tenantId, query, scope = {}, limit = 12) {
  if (!(await isConfigured(tenantId))) return [];

  const embedded = await createEmbedding(query, tenantId);
  if (!embedded) return [];

  const { toPgVectorLiteral, cosineSimilarity } = require("./embedding.service");
  const vectorLiteral = toPgVectorLiteral(embedded.vector);
  if (!vectorLiteral) return [];

  const whereParts = ["tenant_id = :tenantId", "embedding_vector IS NOT NULL"];
  const replacements = {
    tenantId,
    queryVector: vectorLiteral,
    limit: Math.max(limit * 10, 60),
  };

  if (scope.client_id) {
    whereParts.push("client_id = :clientId");
    replacements.clientId = scope.client_id;
  }
  if (scope.project_id) {
    whereParts.push("project_id = :projectId");
    replacements.projectId = scope.project_id;
  }
  if (scope.channel) {
    whereParts.push("channel = :channel");
    replacements.channel = scope.channel;
  }
  if (scope.conversation_id) {
    whereParts.push("conversation_id = :conversationId");
    replacements.conversationId = scope.conversation_id;
  }
  if (scope.channels?.length) {
    whereParts.push("channel = ANY(:channels)");
    replacements.channels = scope.channels;
  }

  try {
    const rows = await sequelize.query(
      `
      SELECT id, content, channel, client_id, project_id, conversation_id, metadata,
             1 - (embedding_vector <=> :queryVector::vector) AS score
      FROM rag_chunks
      WHERE ${whereParts.join(" AND ")}
      ORDER BY embedding_vector <=> :queryVector::vector
      LIMIT :limit
      `,
      {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    return rows
      .map((row) => ({
        id: row.id,
        content: row.content,
        score: Number(row.score) || 0,
        source: "vector",
        channel: row.channel,
        client_id: row.client_id,
        project_id: row.project_id,
        conversation_id: row.conversation_id,
        metadata: row.metadata,
      }))
      .filter((item) => item.score > 0.15)
      .slice(0, limit);
  } catch (error) {
    console.warn("[RAG] pgvector search fallback JSONB:", error.message);
  }

  const where = buildScopeWhere(tenantId, scope);
  const rows = await RagChunk.findAll({
    where: {
      ...where,
      embedding: { [Op.ne]: null },
    },
    limit: Math.max(limit * 10, 60),
    order: [["updated_at", "DESC"]],
  });

  return rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      score: cosineSimilarity(embedded.vector, row.embedding),
      source: "vector",
      channel: row.channel,
      client_id: row.client_id,
      project_id: row.project_id,
      conversation_id: row.conversation_id,
      metadata: row.metadata,
    }))
    .filter((item) => item.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function mergeResults(items, limit = 12) {
  const map = new Map();

  for (const item of items) {
    const current = map.get(item.id);
    const boost = item.source === "fact" ? 0.15 : item.source === "media" ? 0.12 : 0;
    const score = (item.score || 0) + boost;

    if (!current || score > current.score) {
      map.set(item.id, {
        ...item,
        score: current ? Math.max(current.score, score) + 0.06 : score,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function factsAsChunks(facts = []) {
  return facts.map((fact) => ({
    id: `fact:${fact.id}`,
    content: [
      `[FATO ${fact.fact_type}] ${fact.label || ""}`,
      fact.value_text,
      fact.value_number != null ? `Valor numérico: ${fact.value_number}` : null,
      fact.value_date ? `Data: ${new Date(fact.value_date).toISOString()}` : null,
      fact.source_excerpt ? `Trecho: ${fact.source_excerpt}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    score: fact.score || fact.confidence || 0.85,
    source: "fact",
    channel: fact.source_channel || "structured",
    client_id: fact.client_id,
    project_id: fact.project_id,
    metadata: { fact_type: fact.fact_type },
  }));
}

function mediaAsChunks(assets = []) {
  return assets.map((asset) => ({
    id: `media:${asset.id}`,
    content: [
      `[${asset.is_contract ? "CONTRATO" : asset.asset_type?.toUpperCase()}] ${asset.original_name || "arquivo"}`,
      asset.extracted_text,
    ]
      .filter(Boolean)
      .join("\n"),
    score: asset.score || 0.75,
    source: "media",
    channel: "whatsapp",
    client_id: asset.client_id,
    project_id: asset.project_id,
    metadata: { media_file_id: asset.media_file_id, is_contract: asset.is_contract },
  }));
}

async function fetchSummaries(tenantId, scope = {}, limit = 4) {
  const where = buildScopeWhere(tenantId, scope);
  const rows = await RagSummary.findAll({
    where,
    limit,
    order: [["updated_at", "DESC"]],
  });

  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    content: row.content,
    client_id: row.client_id,
    project_id: row.project_id,
    conversation_id: row.conversation_id,
    period_start: row.period_start,
    period_end: row.period_end,
  }));
}

async function rewriteQuery(query, scope = {}, tenantId = null) {
  const trimmed = String(query || "").trim();
  if (!trimmed || !tenantId) return trimmed;
  if (!(await aiRuntime.isConfiguredForTenant(tenantId))) return trimmed;

  try {
    const systemPrompt = promptLoader.loadPrompt("rag/query_rewrite");
    const response = await aiRuntime.createChatCompletion(tenantId, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ query: trimmed, scope }, null, 2),
        },
      ],
      temperature: 0,
      max_tokens: 180,
    });

    const rewritten = response.content.trim();
    return rewritten || trimmed;
  } catch {
    return trimmed;
  }
}

async function searchKnowledge({ tenantId, query, scope = {}, limit = 12 }) {
  try {
    const rewritten = await rewriteQuery(query, scope, tenantId);
    const queries = await expandQuery(rewritten, scope, tenantId);

    const searchJobs = queries.flatMap((q) => [
      fullTextSearch(tenantId, q, scope, limit),
      vectorSearch(tenantId, q, scope, limit),
      fuzzySearch(tenantId, q, scope, Math.ceil(limit / 2)),
    ]);

    const [keywordBatches, factHits, mediaHits, summaries] = await Promise.all([
      Promise.all(searchJobs).then((batches) => batches.flat()),
      factsRetrieval.searchFacts({ tenantId, query: rewritten, scope, limit: 10 }),
      factsRetrieval.searchMediaAssets({ tenantId, query: rewritten, scope, limit: 6 }),
      fetchSummaries(tenantId, scope, 4),
    ]);

    const chunks = mergeResults(
      [...keywordBatches, ...factsAsChunks(factHits), ...mediaAsChunks(mediaHits)],
      limit
    );

    return {
      query,
      rewritten_query: rewritten,
      expanded_queries: queries,
      chunks,
      facts: factHits,
      media: mediaHits,
      summaries,
      stats: {
        keyword_hits: keywordBatches.filter((i) => i.source === "keyword").length,
        vector_hits: keywordBatches.filter((i) => i.source === "vector").length,
        fact_hits: factHits.length,
        media_hits: mediaHits.length,
        summaries: summaries.length,
      },
    };
  } catch (error) {
    console.warn("[rag] searchKnowledge indisponível:", error.message);
    return {
      query,
      rewritten_query: query,
      expanded_queries: [query],
      chunks: [],
      facts: [],
      media: [],
      summaries: [],
      stats: {},
    };
  }
}

function buildContextPack(searchResult, maxChars = 14000) {
  const parts = [];

  if (searchResult.facts?.length) {
    parts.push(factsRetrieval.formatFactsForContext(searchResult.facts));
  }

  if (searchResult.media?.length) {
    parts.push(factsRetrieval.formatMediaForContext(searchResult.media));
  }

  if (searchResult.summaries?.length) {
    parts.push("## Resumos");
    for (const summary of searchResult.summaries) {
      parts.push(`[${summary.level}] ${summary.content}`);
    }
  }

  if (searchResult.chunks?.length) {
    parts.push("## Trechos relevantes");
    for (const chunk of searchResult.chunks) {
      parts.push(`(score ${chunk.score.toFixed(2)} · ${chunk.source} · ${chunk.channel || ""})\n${chunk.content}`);
    }
  }

  let text = parts.join("\n\n").trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}…`;
  }

  return text;
}

module.exports = {
  searchKnowledge,
  buildContextPack,
  rewriteQuery,
};
