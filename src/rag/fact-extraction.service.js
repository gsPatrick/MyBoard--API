const { RagFact } = require("../models");
const { extractAllFacts } = require("./extract-facts");
const { estimateTokens } = require("./token-estimate");

async function upsertFacts({
  tenantId,
  clientId,
  projectId,
  conversationId,
  messageId,
  sourceChannel,
  text,
  extraFacts = [],
  skipLlm = false,
}) {
  const merged = await extractAllFacts(text, { extraFacts, skipLlm, tenantId });
  const saved = [];

  for (const fact of merged) {
    const payload = {
      tenant_id: tenantId,
      client_id: clientId || null,
      project_id: projectId || null,
      conversation_id: conversationId || null,
      message_id: messageId || null,
      fact_type: fact.fact_type,
      fact_key: fact.fact_key,
      label: fact.label,
      value_text: fact.value_text,
      value_number: fact.value_number,
      value_date: fact.value_date,
      value_json: fact.value_json,
      confidence: fact.confidence,
      source_channel: sourceChannel || null,
      source_excerpt: fact.source_excerpt || String(text || "").slice(0, 200),
      metadata: { token_estimate: estimateTokens(text) },
    };

    const where = {
      tenant_id: tenantId,
      fact_type: payload.fact_type,
      fact_key: payload.fact_key,
    };

    if (projectId) {
      where.project_id = projectId;
    } else {
      where.project_id = null;
      where.client_id = clientId || null;
      where.conversation_id = conversationId || null;
    }

    const existing = await RagFact.findOne({ where });
    let record;
    if (existing) {
      if (payload.confidence >= (existing.confidence || 0)) {
        await existing.update(payload);
      }
      record = existing;
    } else {
      record = await RagFact.create(payload);
    }

    saved.push(record);
  }

  return saved;
}

module.exports = {
  upsertFacts,
  extractAllFacts,
};
