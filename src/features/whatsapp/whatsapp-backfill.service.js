const { WhatsappInstance } = require("../../models");
const evolutionClient = require("../../providers/evolution/evolution.client");
const whatsappIngest = require("./whatsapp-ingest.service");
const { normalizeEvolutionPayload } = require("./whatsapp-normalizer");

async function backfillInstanceHistory({ instanceId, tenantId, remoteJid, limit = 200 }) {
  const instance = await WhatsappInstance.findOne({
    where: { id: instanceId, tenant_id: tenantId, is_active: true },
  });

  if (!instance) {
    return { ok: false, reason: "instance_not_found" };
  }

  const payload = remoteJid
    ? { where: { key: { remoteJid } }, limit }
    : { limit };

  const response = await evolutionClient.findMessages(
    instance.instance_name,
    payload,
    instance.evolution_base_url
  );
  const messages = response?.messages?.records || response?.records || response || [];

  const syntheticBody = {
    event: "messages.upsert",
    instance: instance.instance_name,
    data: Array.isArray(messages) ? messages : [messages],
  };

  const normalized = normalizeEvolutionPayload(syntheticBody);
  if (!normalized.messages?.length) {
    return { ok: true, imported: 0 };
  }

  const body = {
    event: "messages.upsert",
    instance: instance.instance_name,
    data: normalized.messages.map((m) => m.raw),
  };

  const result = await whatsappIngest.ingestEvolutionWebhook(body);
  return {
    ok: true,
    imported: result.results?.length || 0,
    results: result.results,
  };
}

module.exports = { backfillInstanceHistory };
