const {
  RagConversation,
  RagMessage,
  RagChunk,
  RagSummary,
  sequelize,
} = require("../models");
const { buildMessageChunks } = require("./chunking.service");
const { createEmbedding, buildEmbeddingFields } = require("./embedding.service");
const { estimateTokens } = require("./token-estimate");
const { hashContent } = require("./content-hash");
const summarizationService = require("./summarization.service");
const factExtractionService = require("./fact-extraction.service");
const mediaProcessorService = require("./media-processor.service");
const messageOptimizer = require("./message-optimizer.service");
const evolutionClient = require("../providers/evolution/evolution.client");

async function resolveEmbeddingFields(text, tenantId) {
  try {
    const embedded = await createEmbedding(text, tenantId);
    if (!embedded) {
      return { embedding: null, embedding_model: null, embedding_vector: null };
    }
    const fields = buildEmbeddingFields(embedded.vector);
    return {
      embedding: fields.embedding,
      embedding_vector: fields.embedding_vector,
      embedding_model: embedded.model,
    };
  } catch (error) {
    console.warn("[RAG] embedding falhou:", error.message);
    return { embedding: null, embedding_model: null, embedding_vector: null };
  }
}

async function appendSingleMessageChunk(conversation, message) {
  const line =
    `[${message.direction === "outbound" ? "Você" : message.sender_name || "Contato"}] ${message.body_normalized || message.body_text || ""}`.trim();
  if (!line) return;

  let embeddingFields = { embedding: null, embedding_model: null, embedding_vector: null };
  try {
    embeddingFields = await resolveEmbeddingFields(line, conversation.tenant_id);
  } catch (error) {
    console.warn("[RAG] embedding incremental falhou:", error.message);
  }

  const lastChunk = await RagChunk.findOne({
    where: { conversation_id: conversation.id },
    order: [["chunk_index", "DESC"]],
  });

  await RagChunk.create({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    client_id: conversation.client_id,
    project_id: conversation.project_id,
    channel: conversation.channel,
    source_type: conversation.channel === "whatsapp" ? "whatsapp_message" : "manual",
    chunk_index: (lastChunk?.chunk_index ?? -1) + 1,
    content: line,
    content_hash: hashContent(line),
    token_estimate: estimateTokens(line),
    message_ids: [message.id],
    period_start: message.sent_at,
    period_end: message.sent_at,
    embedding_model: embeddingFields.embedding_model,
    embedding: embeddingFields.embedding,
    embedding_vector: embeddingFields.embedding_vector,
    metadata: { incremental: true },
  });
}

async function indexConversationMessages(conversationId, options = {}) {
  const transaction = options.transaction || null;

  const conversation = await RagConversation.findByPk(conversationId, { transaction });
  if (!conversation) return { chunksCreated: 0 };

  const messages = await RagMessage.findAll({
    where: { conversation_id: conversationId },
    order: [["sent_at", "ASC"]],
    transaction,
  });

  await RagChunk.destroy({
    where: { conversation_id: conversationId },
    transaction,
  });

  const builtChunks = buildMessageChunks(messages);
  let chunksCreated = 0;

  for (const chunk of builtChunks) {
    const embeddingFields = await resolveEmbeddingFields(chunk.content, conversation.tenant_id);

    await RagChunk.create(
      {
        tenant_id: conversation.tenant_id,
        conversation_id: conversation.id,
        client_id: conversation.client_id,
        project_id: conversation.project_id,
        channel: conversation.channel,
        source_type:
          conversation.channel === "whatsapp"
            ? "whatsapp_message"
            : conversation.channel === "chatwoot"
              ? "chatwoot_message"
              : "manual",
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        content_hash: hashContent(chunk.content),
        token_estimate: chunk.token_estimate,
        message_ids: chunk.message_ids,
        period_start: chunk.period_start,
        period_end: chunk.period_end,
        embedding_model: embeddingFields.embedding_model,
        embedding: embeddingFields.embedding,
        embedding_vector: embeddingFields.embedding_vector,
        metadata: {
          message_count: chunk.message_ids.length,
        },
      },
      { transaction }
    );

    chunksCreated += 1;
  }

  if (!options.skipSummary && builtChunks.length) {
    await summarizationService.refreshConversationSummaries(conversation, {
      transaction,
      latestChunks: builtChunks,
    });
  }

  await messageOptimizer.dedupeConversationChunks(conversation.id);
  await messageOptimizer.optimizeConversationStorage(conversation.id);

  return { chunksCreated };
}

async function enrichIngestedMessage({
  tenantId,
  conversation,
  message,
  rawPayload,
  instanceName,
}) {
  let enrichedText = message.body_text || "";

  if (rawPayload && message.content_type !== "text") {
    const asset = await mediaProcessorService.processMessageMedia({
      tenantId,
      message,
      conversation,
      rawPayload,
      evolutionClient,
      instanceName,
    });

    if (asset?.extracted_text) {
      enrichedText = `${enrichedText}\n\n[${asset.asset_type}] ${asset.extracted_text}`.trim();
      const normalized = enrichedText.replace(/\s+/g, " ").trim();
      await message.update({
        body_text: enrichedText,
        body_normalized: normalized,
        token_estimate: estimateTokens(normalized),
        content_hash: hashContent(normalized),
      });

      if (asset.is_contract) {
        await factExtractionService.upsertFacts({
          tenantId,
          clientId: conversation.client_id,
          projectId: conversation.project_id,
          conversationId: conversation.id,
          messageId: message.id,
          sourceChannel: conversation.channel,
          text: enrichedText,
          extraFacts: [
            {
              fact_type: "contract",
              fact_key: "file",
              label: "Arquivo de contrato",
              value_text: asset.original_name,
              value_json: { media_file_id: asset.media_file_id, asset_id: asset.id },
              confidence: 0.92,
              source_excerpt: (asset.extracted_text || "").slice(0, 200),
            },
          ],
        });
      }
    }
  }

  await factExtractionService.upsertFacts({
    tenantId,
    clientId: conversation.client_id,
    projectId: conversation.project_id,
    conversationId: conversation.id,
    messageId: message.id,
    sourceChannel: conversation.channel,
    text: enrichedText,
  });

  await messageOptimizer.optimizeMessageRecord(message);
}

async function ingestMessageRecord({
  tenantId,
  conversation,
  externalMessageId,
  direction,
  senderId,
  senderName,
  contentType,
  bodyText,
  sentAt,
  rawPayload,
  metadata,
  instanceName = null,
}) {
  const normalizedBody = String(bodyText || "").replace(/\s+/g, " ").trim();
  const tokenEstimate = estimateTokens(normalizedBody);

  const [message, created] = await RagMessage.findOrCreate({
    where: {
      conversation_id: conversation.id,
      external_message_id: externalMessageId,
    },
    defaults: {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      external_message_id: externalMessageId,
      direction,
      sender_id: senderId || null,
      sender_name: senderName || null,
      content_type: contentType || "text",
      body_text: bodyText || null,
      body_normalized: normalizedBody || null,
      token_estimate: tokenEstimate,
      content_hash: hashContent(normalizedBody),
      sent_at: sentAt,
      raw_payload: rawPayload || {},
      metadata: metadata || {},
    },
  });

  if (!created) {
    return { message, created: false, reindexed: false };
  }

  await conversation.update({
    message_count: conversation.message_count + 1,
    token_estimate: Number(conversation.token_estimate || 0) + tokenEstimate,
    last_message_at: sentAt,
    participant_label: senderName || conversation.participant_label,
  });

  await enrichIngestedMessage({
    tenantId,
    conversation,
    message,
    rawPayload,
    instanceName,
  });

  const shouldReindex = conversation.message_count % 10 === 0;

  if (shouldReindex) {
    await indexConversationMessages(conversation.id);
    return { message, created: true, reindexed: true };
  }

  await appendSingleMessageChunk(conversation, message);
  return { message, created: true, reindexed: false };
}

/**
 * Indexa um CONTEÚDO CURADO (texto limpo) numa conversa existente, substituindo
 * os chunks. Usado pela importação do WhatsApp: a IA destila o que importa e só
 * isso vai pro RAG (sem o ruído da conversa crua).
 */
async function indexConversationContent({ conversation, content, sourceType = "whatsapp_message" }) {
  const text = String(content || "").trim();
  if (!text) return { chunksCreated: 0 };

  const { chunkPlainText } = require("./chunking.service");
  const now = conversation.last_message_at || new Date();
  const chunks = chunkPlainText(text, { period_start: now, period_end: now });

  await RagChunk.destroy({ where: { conversation_id: conversation.id } });

  let chunksCreated = 0;
  for (const chunk of chunks) {
    const embeddingFields = await resolveEmbeddingFields(chunk.content, conversation.tenant_id);
    await RagChunk.create({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      client_id: conversation.client_id,
      project_id: conversation.project_id,
      channel: conversation.channel,
      source_type: sourceType,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      content_hash: hashContent(chunk.content),
      token_estimate: chunk.token_estimate,
      message_ids: [],
      period_start: chunk.period_start,
      period_end: chunk.period_end,
      embedding_model: embeddingFields.embedding_model,
      embedding: embeddingFields.embedding,
      embedding_vector: embeddingFields.embedding_vector,
      metadata: { curated: true },
    });
    chunksCreated += 1;
  }

  await RagSummary.destroy({
    where: { conversation_id: conversation.id, level: "thread" },
  });
  await RagSummary.create({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    client_id: conversation.client_id,
    project_id: conversation.project_id,
    level: "thread",
    content: text.slice(0, 4000),
    token_estimate: estimateTokens(text),
    source_chunk_count: chunks.length,
    metadata: { curated: true },
  });

  return { chunksCreated };
}

async function ingestWorkspaceDocument({
  tenantId,
  channel = "workspace",
  sourceType = "manual",
  clientId = null,
  projectId = null,
  title,
  content,
  metadata = {},
}) {
  return sequelize.transaction(async (transaction) => {
    const externalThreadId = metadata.external_thread_id || `workspace:${sourceType}:${projectId || clientId || "general"}`;

    const [conversation] = await RagConversation.findOrCreate({
      where: {
        tenant_id: tenantId,
        channel,
        external_thread_id: externalThreadId,
      },
      defaults: {
        tenant_id: tenantId,
        channel,
        external_thread_id: externalThreadId,
        client_id: clientId,
        project_id: projectId,
        title: title || null,
        metadata,
      },
      transaction,
    });

    const sentAt = new Date();
    const { chunkPlainText } = require("./chunking.service");
    const chunks = chunkPlainText(content, { period_start: sentAt, period_end: sentAt });

    await RagChunk.destroy({
      where: { conversation_id: conversation.id },
      transaction,
    });

    for (const chunk of chunks) {
      const embeddingFields = await resolveEmbeddingFields(chunk.content, tenantId);

      await RagChunk.create(
        {
          tenant_id: tenantId,
          conversation_id: conversation.id,
          client_id: clientId,
          project_id: projectId,
          channel,
          source_type: sourceType,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          content_hash: hashContent(chunk.content),
          token_estimate: chunk.token_estimate,
          message_ids: [],
          period_start: chunk.period_start,
          period_end: chunk.period_end,
          embedding_model: embeddingFields.embedding_model,
          embedding: embeddingFields.embedding,
          embedding_vector: embeddingFields.embedding_vector,
          metadata,
        },
        { transaction }
      );
    }

    await RagSummary.create(
      {
        tenant_id: tenantId,
        conversation_id: conversation.id,
        client_id: clientId,
        project_id: projectId,
        level: "thread",
        content: content.slice(0, 4000),
        token_estimate: estimateTokens(content),
        source_chunk_count: chunks.length,
        metadata,
      },
      { transaction }
    );

    await factExtractionService.upsertFacts({
      tenantId,
      clientId,
      projectId,
      conversationId: conversation.id,
      sourceChannel: channel,
      text: content,
    });

    return { conversation, chunksCreated: chunks.length };
  });
}

module.exports = {
  indexConversationMessages,
  indexConversationContent,
  ingestMessageRecord,
  ingestWorkspaceDocument,
  enrichIngestedMessage,
};
