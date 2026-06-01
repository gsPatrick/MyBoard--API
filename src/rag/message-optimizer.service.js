const { RagMessage, RagChunk } = require("../models");
const { hashContent } = require("./content-hash");

const MIN_RAW_PAYLOAD_BYTES = 500;

function compactRawPayload(raw = {}) {
  const key = raw?.key || {};
  return {
    archived: true,
    external_id: key.id || raw.id || null,
    remote_jid: key.remoteJid || raw.remoteJid || null,
    message_type: Object.keys(raw.message || raw).find((k) => k.endsWith("Message")) || null,
  };
}

async function optimizeMessageRecord(message, { force = false } = {}) {
  if (message.storage_optimized && !force) {
    return { optimized: false, reason: "already_optimized" };
  }

  const rawSize = JSON.stringify(message.raw_payload || {}).length;
  const updates = {
    storage_optimized: true,
    content_hash: message.content_hash || hashContent(message.body_normalized || message.body_text),
  };

  if (message.content_type === "audio" && !message.body_text?.trim()) {
    updates.body_text = "[Áudio — texto disponível via transcrição indexada]";
    updates.body_normalized = updates.body_text;
  }

  if (rawSize > MIN_RAW_PAYLOAD_BYTES || force) {
    updates.raw_payload = compactRawPayload(message.raw_payload);
  }

  await message.update(updates);
  return { optimized: true, raw_bytes_saved: Math.max(0, rawSize - JSON.stringify(updates.raw_payload || {}).length) };
}

async function optimizeConversationStorage(conversationId, { batchSize = 200 } = {}) {
  const messages = await RagMessage.findAll({
    where: { conversation_id: conversationId, storage_optimized: false },
    order: [["sent_at", "ASC"]],
    limit: batchSize,
  });

  let optimized = 0;
  let bytesSaved = 0;

  for (const message of messages) {
    const result = await optimizeMessageRecord(message);
    if (result.optimized) {
      optimized += 1;
      bytesSaved += result.raw_bytes_saved || 0;
    }
  }

  return { optimized, bytesSaved };
}

async function dedupeConversationChunks(conversationId) {
  const chunks = await RagChunk.findAll({
    where: { conversation_id: conversationId },
    order: [["chunk_index", "ASC"]],
  });

  const seen = new Set();
  let removed = 0;

  for (const chunk of chunks) {
    const hash = chunk.content_hash || hashContent(chunk.content);
    if (!chunk.content_hash) {
      await chunk.update({ content_hash: hash });
    }

    if (seen.has(hash)) {
      await chunk.destroy();
      removed += 1;
    } else {
      seen.add(hash);
    }
  }

  return { removed };
}

module.exports = {
  optimizeMessageRecord,
  optimizeConversationStorage,
  dedupeConversationChunks,
  compactRawPayload,
};
