const { RagConversation, WhatsappInstance } = require("../../models");
const linkResolver = require("../../rag/link-resolver.service");
const ingestService = require("../../rag/ingest.service");
const { isGroupJid } = require("../../rag/phone-normalizer");

async function findInstanceByName(instanceName) {
  if (!instanceName) return null;
  return WhatsappInstance.findOne({
    where: { instance_name: instanceName, is_active: true },
  });
}

async function ensureConversation({
  tenantId,
  channel,
  externalThreadId,
  whatsappInstanceId = null,
  remoteJid = null,
  participantLabel = null,
  isGroup = false,
  clientId = null,
  projectId = null,
  metadata = {},
}) {
  let resolvedClientId = clientId;
  let resolvedProjectId = projectId;

  if (remoteJid && (!resolvedClientId || !resolvedProjectId)) {
    const resolved = await linkResolver.resolveContextFromJid(tenantId, remoteJid);
    resolvedClientId = resolvedClientId || resolved.client_id;
    resolvedProjectId = resolvedProjectId || resolved.project_id;
  }

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
      whatsapp_instance_id: whatsappInstanceId,
      client_id: resolvedClientId,
      project_id: resolvedProjectId,
      participant_label: participantLabel,
      is_group: isGroup,
      title: participantLabel || externalThreadId,
      metadata,
    },
  });

  const updates = {};
  if (!conversation.client_id && resolvedClientId) updates.client_id = resolvedClientId;
  if (!conversation.project_id && resolvedProjectId) updates.project_id = resolvedProjectId;
  if (participantLabel && !conversation.participant_label) {
    updates.participant_label = participantLabel;
  }
  if (Object.keys(updates).length) {
    await conversation.update(updates);
  }

  return conversation;
}

async function ingestEvolutionWebhook(body) {
  const { normalizeEvolutionPayload } = require("./whatsapp-normalizer");
  const normalized = normalizeEvolutionPayload(body);

  if (normalized.kind === "connection") {
    const instance = await findInstanceByName(normalized.instanceName);
    if (!instance) return { handled: false, reason: "instance_not_found" };
    await instance.update({ connection_state: normalized.state || "unknown" });
    return { handled: true, kind: "connection", state: normalized.state };
  }

  if (normalized.kind !== "messages" || !normalized.messages.length) {
    return { handled: false, reason: "no_messages" };
  }

  const instance = await findInstanceByName(normalized.instanceName);
  if (!instance) return { handled: false, reason: "instance_not_found" };

  const results = [];

  for (const message of normalized.messages) {
    if (!message.bodyText && message.contentType === "text") continue;

    const conversation = await ensureConversation({
      tenantId: instance.tenant_id,
      channel: "whatsapp",
      externalThreadId: message.remoteJid,
      whatsappInstanceId: instance.id,
      remoteJid: message.remoteJid,
      participantLabel: message.senderName,
      isGroup: message.isGroup || isGroupJid(message.remoteJid),
      metadata: {
        provider: "evolution",
        instance_name: instance.instance_name,
      },
    });

    const ingested = await ingestService.ingestMessageRecord({
      tenantId: instance.tenant_id,
      conversation,
      externalMessageId: message.externalMessageId,
      direction: message.direction,
      senderId: message.senderId,
      senderName: message.senderName,
      contentType: message.contentType,
      bodyText:
        message.bodyText ||
        (message.contentType === "text"
          ? ""
          : `[${message.contentType}] processando conteúdo…`),
      sentAt: message.sentAt,
      rawPayload: message.raw,
      metadata: {
        remote_jid: message.remoteJid,
        provider: "evolution",
      },
      instanceName: instance.instance_name,
    });

    results.push({
      conversation_id: conversation.id,
      message_id: ingested.message.id,
      created: ingested.created,
      reindexed: ingested.reindexed,
    });
  }

  return { handled: true, kind: "messages", results };
}

async function ingestChatwootWebhook(body, tenantId) {
  const { normalizeChatwootPayload } = require("./whatsapp-normalizer");
  const normalized = normalizeChatwootPayload(body);

  if (normalized.kind === "ignored") {
    return { handled: false, reason: "ignored_event" };
  }

  const phoneJid = normalized.metadata?.phone_number
    ? `${String(normalized.metadata.phone_number).replace(/\D/g, "")}@s.whatsapp.net`
    : null;

  const conversation = await ensureConversation({
    tenantId,
    channel: "chatwoot",
    externalThreadId: normalized.externalThreadId,
    remoteJid: phoneJid,
    participantLabel: normalized.senderName,
    metadata: normalized.metadata,
  });

  const ingested = await ingestService.ingestMessageRecord({
    tenantId,
    conversation,
    externalMessageId: normalized.externalMessageId,
    direction: normalized.direction,
    senderId: normalized.senderId,
    senderName: normalized.senderName,
    contentType: normalized.contentType,
    bodyText: normalized.bodyText,
    sentAt: normalized.sentAt,
    rawPayload: normalized.raw,
    metadata: normalized.metadata,
  });

  return {
    handled: true,
    kind: "chatwoot_message",
    conversation_id: conversation.id,
    message_id: ingested.message.id,
    created: ingested.created,
    reindexed: ingested.reindexed,
  };
}

module.exports = {
  ensureConversation,
  ingestEvolutionWebhook,
  ingestChatwootWebhook,
};
