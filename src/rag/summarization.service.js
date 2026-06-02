const aiRuntime = require("../features/settings/ai-runtime.service");
const promptLoader = require("../ai/prompt-loader");

const SUMMARY_LEVELS = {
  THREAD: "thread",
  DAILY: "daily",
  PROJECT: "project",
  CLIENT: "client",
};

async function summarizeText(content, mode = "thread", tenantId = null) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return "";

  if (!tenantId || !(await aiRuntime.isConfiguredForTenant(tenantId))) {
    return trimmed.length > 1200 ? `${trimmed.slice(0, 1200)}…` : trimmed;
  }

  const systemPrompt = promptLoader.loadPrompt("rag/synthesize");
  const response = await aiRuntime.createChatCompletion(tenantId, {
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Nível: ${mode}\n\nConteúdo:\n${trimmed.slice(0, 12000)}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 900,
  });

  return response.content.trim();
}

async function upsertSummary({
  tenantId,
  conversationId = null,
  clientId = null,
  projectId = null,
  level,
  content,
  sourceChunkCount = 0,
  periodStart = null,
  periodEnd = null,
  transaction = null,
}) {
  const { RagSummary } = require("../models");
  const { estimateTokens } = require("./token-estimate");

  const where = {
    tenant_id: tenantId,
    level,
    conversation_id: conversationId,
    client_id: clientId,
    project_id: projectId,
  };

  const existing = await RagSummary.findOne({ where, transaction });
  const payload = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    client_id: clientId,
    project_id: projectId,
    level,
    content,
    token_estimate: estimateTokens(content),
    source_chunk_count: sourceChunkCount,
    period_start: periodStart,
    period_end: periodEnd,
    metadata: {},
  };

  if (existing) {
    await existing.update(payload, { transaction });
    return existing;
  }

  return RagSummary.create(payload, { transaction });
}

async function refreshConversationSummaries(conversation, options = {}) {
  const transaction = options.transaction || null;
  const latestChunks = options.latestChunks || [];

  if (!latestChunks.length) return null;

  const merged = latestChunks.map((chunk) => chunk.content).join("\n\n");
  const threadSummary = await summarizeText(merged, SUMMARY_LEVELS.THREAD, conversation.tenant_id);

  return upsertSummary({
    tenantId: conversation.tenant_id,
    conversationId: conversation.id,
    clientId: conversation.client_id,
    projectId: conversation.project_id,
    level: SUMMARY_LEVELS.THREAD,
    content: threadSummary,
    sourceChunkCount: latestChunks.length,
    periodStart: latestChunks[0]?.period_start || null,
    periodEnd: latestChunks[latestChunks.length - 1]?.period_end || null,
    transaction,
  });
}

module.exports = {
  SUMMARY_LEVELS,
  summarizeText,
  upsertSummary,
  refreshConversationSummaries,
};
