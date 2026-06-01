const { isGroupJid, jidToPhoneDigits } = require("../rag/phone-normalizer");

function extractMessageText(message = {}) {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return message.buttonsResponseMessage.selectedDisplayText;
  }
  if (message.listResponseMessage?.title) return message.listResponseMessage.title;
  if (message.reactionMessage?.text) return message.reactionMessage.text;
  return null;
}

function detectContentType(message = {}) {
  if (message.conversation || message.extendedTextMessage) return "text";
  if (message.audioMessage) return "audio";
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.documentMessage) return "document";
  if (message.locationMessage) return "location";
  if (message.reactionMessage) return "reaction";
  return "other";
}

function normalizeEvolutionPayload(body = {}) {
  const event = String(body.event || body.type || "").toLowerCase();
  const instanceName = body.instance || body.instanceName || body.data?.instance || null;
  const data = body.data || body;

  if (event.includes("connection")) {
    return {
      kind: "connection",
      instanceName,
      state: data.state || data.connection || data.status || "unknown",
      raw: body,
    };
  }

  const messages = Array.isArray(data) ? data : data.messages || [data].filter(Boolean);
  const normalizedMessages = [];

  for (const item of messages) {
    const key = item.key || item.message?.key || {};
    const remoteJid = key.remoteJid || item.remoteJid;
    if (!remoteJid) continue;

    const messagePayload = item.message || item;
    const text = extractMessageText(messagePayload);
    const contentType = detectContentType(messagePayload);
    const timestampRaw = item.messageTimestamp || item.timestamp || Date.now();
    const sentAt = new Date(Number(timestampRaw) * (String(timestampRaw).length <= 10 ? 1000 : 1));

    normalizedMessages.push({
      remoteJid,
      externalMessageId: key.id || item.id || `${remoteJid}:${sentAt.getTime()}`,
      direction: key.fromMe ? "outbound" : "inbound",
      senderId: key.participant || jidToPhoneDigits(remoteJid),
      senderName: item.pushName || item.senderName || null,
      contentType,
      bodyText: text,
      sentAt,
      isGroup: isGroupJid(remoteJid),
      raw: item,
    });
  }

  return {
    kind: "messages",
    instanceName,
    messages: normalizedMessages,
    raw: body,
  };
}

function normalizeChatwootPayload(body = {}) {
  const event = body.event;
  if (event !== "message_created") {
    return { kind: "ignored", raw: body };
  }

  const conversation = body.conversation || {};
  const contact = conversation.contact || body.sender || {};
  const phone = contact.phone_number || body.sender?.phone_number || null;

  return {
    kind: "chatwoot_message",
    externalThreadId: `chatwoot:${conversation.id}`,
    externalMessageId: `chatwoot:${body.id}`,
    direction: body.message_type === "incoming" ? "inbound" : "outbound",
    senderName: contact.name || body.sender?.name || null,
    senderId: phone || String(contact.id || body.sender?.id || ""),
    contentType: "text",
    bodyText: body.content || "",
    sentAt: new Date(body.created_at || Date.now()),
    metadata: {
      chatwoot_conversation_id: conversation.id,
      chatwoot_contact_id: contact.id,
      inbox_id: conversation.inbox_id,
      phone_number: phone,
    },
    raw: body,
  };
}

module.exports = {
  normalizeEvolutionPayload,
  normalizeChatwootPayload,
};
