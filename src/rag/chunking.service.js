const { estimateTokens } = require("./token-estimate");

const DEFAULT_TARGET_TOKENS = 700;
const DEFAULT_OVERLAP_TOKENS = 120;

function splitTextIntoPieces(text, maxChars = 2800) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.split(/(?<=[.!?…])\s+/);
  const pieces = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) pieces.push(current);
    if (sentence.length <= maxChars) {
      current = sentence;
    } else {
      for (let i = 0; i < sentence.length; i += maxChars) {
        pieces.push(sentence.slice(i, i + maxChars));
      }
      current = "";
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

function buildMessageChunks(messages, options = {}) {
  const targetTokens = options.targetTokens || DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens || DEFAULT_OVERLAP_TOKENS;
  const maxChars = options.maxChars || targetTokens * 4;

  const chunks = [];
  let buffer = [];
  let bufferTokens = 0;
  let chunkIndex = 0;

  function flush() {
    if (!buffer.length) return;

    const periodStart = buffer[0].sent_at;
    const periodEnd = buffer[buffer.length - 1].sent_at;
    const content = buffer
      .map((message) => {
        const speaker = message.sender_name || message.sender_id || "Contato";
        const prefix = message.direction === "outbound" ? "Você" : speaker;
        return `[${prefix}] ${message.body_normalized || message.body_text || ""}`.trim();
      })
      .filter(Boolean)
      .join("\n");

    if (content.trim()) {
      chunks.push({
        chunk_index: chunkIndex++,
        content,
        token_estimate: estimateTokens(content),
        message_ids: buffer.map((item) => item.id),
        period_start: periodStart,
        period_end: periodEnd,
      });
    }

    if (overlapTokens > 0 && buffer.length > 1) {
      const overlap = [];
      let overlapCount = 0;
      for (let i = buffer.length - 1; i >= 0; i -= 1) {
        overlap.unshift(buffer[i]);
        overlapCount += buffer[i].token_estimate || estimateTokens(buffer[i].body_text);
        if (overlapCount >= overlapTokens) break;
      }
      buffer = overlap;
      bufferTokens = overlap.reduce(
        (sum, item) => sum + (item.token_estimate || estimateTokens(item.body_text)),
        0
      );
      return;
    }

    buffer = [];
    bufferTokens = 0;
  }

  for (const message of messages) {
    const lineTokens = message.token_estimate || estimateTokens(message.body_text);
    if (bufferTokens + lineTokens > targetTokens && buffer.length) {
      flush();
    }

    buffer.push(message);
    bufferTokens += lineTokens;
  }

  flush();
  return chunks;
}

function chunkPlainText(text, metadata = {}) {
  return splitTextIntoPieces(text).map((content, index) => ({
    chunk_index: index,
    content,
    token_estimate: estimateTokens(content),
    message_ids: [],
    period_start: metadata.period_start || null,
    period_end: metadata.period_end || null,
  }));
}

module.exports = {
  DEFAULT_TARGET_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  splitTextIntoPieces,
  buildMessageChunks,
  chunkPlainText,
};
