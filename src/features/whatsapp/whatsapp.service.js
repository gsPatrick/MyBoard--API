const AppError = require("../../utils/app-error");
const {
  WhatsappInstance,
  ClientWhatsappLink,
  ProjectWhatsappLink,
} = require("../../models");
const evolutionClient = require("../../providers/evolution/evolution.client");
const linkResolver = require("../../rag/link-resolver.service");
const {
  isGroupJid,
  jidToPhoneDigits,
  normalizePhoneDigits,
  toE164,
} = require("../../rag/phone-normalizer");

const DEFAULT_INSTANCE_NAME = "myboard";

function formatPhoneDisplay(digits) {
  if (!digits) return "";
  const raw = String(digits).replace(/^55/, "");
  if (raw.length === 11) {
    return `+55 (${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  }
  if (raw.length === 10) {
    return `+55 (${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  }
  return `+${digits}`;
}

function buildWebhookUrl() {
  const appUrl = (process.env.APP_URL || "http://localhost:4000").replace(/\/$/, "");
  const prefix = process.env.APP_API_PREFIX || "/api";
  return `${appUrl}${prefix}/v1/whatsapp/webhooks/evolution`;
}

async function listInstances(ctx) {
  return WhatsappInstance.findAll({
    where: { tenant_id: ctx.tenantId },
    order: [["created_at", "DESC"]],
  });
}

async function createInstance(payload, ctx) {
  const instanceName = String(payload.instance_name || "").trim();
  if (!instanceName) throw new AppError("instance_name é obrigatório", 400);

  const existing = await WhatsappInstance.findOne({
    where: { tenant_id: ctx.tenantId, instance_name: instanceName },
  });
  if (existing) throw new AppError("Instância já existe", 409);

  const baseUrl = payload.evolution_base_url || evolutionClient.DEFAULT_BASE_URL;

  if (payload.provision !== false && process.env.EVOLUTION_API_KEY) {
    await evolutionClient.createInstance(
      {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        ...(payload.chatwoot_account_id
          ? {
              chatwootAccountId: String(payload.chatwoot_account_id),
              chatwootToken: payload.chatwoot_token || process.env.CHATWOOT_API_TOKEN,
              chatwootUrl: payload.chatwoot_url || process.env.CHATWOOT_BASE_URL,
              chatwootSignMsg: false,
              chatwootReopenConversation: true,
              chatwootConversationPending: false,
              chatwootImportContacts: true,
              chatwootNameInbox: payload.chatwoot_name_inbox || instanceName,
              chatwootMergeBrazilContacts: true,
              chatwootImportMessages: true,
              chatwootDaysLimitImportMessages: payload.import_days || 3,
            }
          : {}),
      },
      baseUrl
    );

    if (payload.configure_webhook !== false) {
      await evolutionClient.setWebhook(
        instanceName,
        {
          url: buildWebhookUrl(),
          webhook_by_events: false,
          webhook_base64: false,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"],
          headers: process.env.WHATSAPP_WEBHOOK_SECRET
            ? { "x-myboard-webhook-secret": process.env.WHATSAPP_WEBHOOK_SECRET }
            : undefined,
        },
        baseUrl
      );
    }
  }

  return WhatsappInstance.create({
    tenant_id: ctx.tenantId,
    instance_name: instanceName,
    provider: "evolution",
    evolution_base_url: baseUrl,
    chatwoot_account_id: payload.chatwoot_account_id
      ? String(payload.chatwoot_account_id)
      : process.env.CHATWOOT_ACCOUNT_ID || null,
    chatwoot_url: payload.chatwoot_url || process.env.CHATWOOT_BASE_URL || null,
    settings: payload.settings || {},
  });
}

async function syncConnectionState(id, ctx) {
  const instance = await WhatsappInstance.findOne({
    where: { id, tenant_id: ctx.tenantId },
  });
  if (!instance) throw new AppError("Instância não encontrada", 404);

  const payload = await evolutionClient.connectionState(
    instance.instance_name,
    instance.evolution_base_url
  );

  const state = payload?.instance?.state || payload?.state || "unknown";
  await instance.update({ connection_state: state });
  return instance;
}

async function getActiveInstance(ctx) {
  return WhatsappInstance.findOne({
    where: { tenant_id: ctx.tenantId, is_active: true },
    order: [["updated_at", "DESC"]],
  });
}

async function ensureDefaultInstance(ctx) {
  let instance = await getActiveInstance(ctx);
  if (instance) return instance;

  const instanceName = DEFAULT_INSTANCE_NAME;
  return createInstance(
    {
      instance_name: instanceName,
      provision: Boolean(process.env.EVOLUTION_API_KEY),
      configure_webhook: true,
    },
    ctx
  );
}

async function getWhatsappSetup(ctx) {
  const instance = await ensureDefaultInstance(ctx);

  let qr = null;
  if (instance.connection_state !== "open") {
    try {
      qr = await evolutionClient.connectInstance(
        instance.instance_name,
        instance.evolution_base_url
      );
    } catch (error) {
      qr = { error: error.message };
    }
  }

  return {
    instance: {
      id: instance.id,
      instance_name: instance.instance_name,
      connection_state: instance.connection_state,
    },
    qr,
    connected: instance.connection_state === "open",
  };
}

function normalizeChatRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.chats)) return payload.chats;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function mapChatToSearchItem(chat = {}) {
  const jid = chat.id || chat.remoteJid || chat.jid || chat.key?.remoteJid || null;
  if (!jid) return null;

  if (isGroupJid(jid)) {
    return {
      type: "group",
      jid,
      external_id: String(jid).split("@")[0],
      name: chat.name || chat.subject || chat.pushName || "Grupo",
      display: chat.name || chat.subject || "Grupo WhatsApp",
    };
  }

  const digits = jidToPhoneDigits(jid);
  if (!digits) return null;

  return {
    type: "phone",
    jid,
    external_id: digits,
    phone_digits: digits,
    phone_e164: toE164(digits),
    name: chat.name || chat.pushName || chat.verifiedName || null,
    display: formatPhoneDisplay(digits),
  };
}

async function searchChats(ctx, { q = "", type = "all", limit = 40 } = {}) {
  const instance = await getActiveInstance(ctx);
  if (!instance) {
    return { connected: false, results: [], message: "WhatsApp não conectado nas configurações." };
  }

  if (instance.connection_state !== "open") {
    return { connected: false, results: [], message: "Escaneie o QR Code em Configurações → WhatsApp." };
  }

  let payload = null;
  try {
    payload = await evolutionClient.findChats(
      instance.instance_name,
      { limit: Math.min(Number(limit) * 3, 120) },
      instance.evolution_base_url
    );
  } catch (error) {
    return { connected: true, results: [], message: error.message };
  }

  const query = String(q || "")
    .trim()
    .toLowerCase();
  const queryDigits = query.replace(/\D/g, "");

  const results = normalizeChatRecords(payload)
    .map(mapChatToSearchItem)
    .filter(Boolean)
    .filter((item) => {
      if (type === "phone" && item.type !== "phone") return false;
      if (type === "group" && item.type !== "group") return false;
      if (!query) return true;

      const haystack = [item.display, item.name, item.external_id, item.phone_digits, item.jid]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (haystack.includes(query)) return true;
      if (queryDigits && String(item.phone_digits || item.external_id || "").includes(queryDigits)) {
        return true;
      }
      return false;
    })
    .slice(0, Math.min(Number(limit) || 40, 60));

  return { connected: true, results };
}

async function getConnectQr(id, ctx) {
  const instance = await WhatsappInstance.findOne({
    where: { id, tenant_id: ctx.tenantId },
  });
  if (!instance) throw new AppError("Instância não encontrada", 404);

  return evolutionClient.connectInstance(instance.instance_name, instance.evolution_base_url);
}

async function listClientLinks(clientId, ctx) {
  return linkResolver.listClientLinks(ctx.tenantId, clientId);
}

async function addClientLink(clientId, payload, ctx) {
  return linkResolver.upsertClientLink(ctx.tenantId, clientId, payload);
}

async function removeClientLink(clientId, linkId, ctx) {
  const link = await ClientWhatsappLink.findOne({
    where: { id: linkId, tenant_id: ctx.tenantId, client_id: clientId },
  });
  if (!link) throw new AppError("Vínculo não encontrado", 404);
  await link.destroy();
}

async function listProjectLinks(projectId, ctx) {
  await linkResolver.ensureProjectClientPhoneLink(ctx.tenantId, projectId);
  return linkResolver.listProjectLinks(ctx.tenantId, projectId);
}

async function addProjectLink(projectId, payload, ctx) {
  return linkResolver.upsertProjectLink(ctx.tenantId, projectId, payload);
}

async function removeProjectLink(projectId, linkId, ctx) {
  const link = await ProjectWhatsappLink.findOne({
    where: { id: linkId, tenant_id: ctx.tenantId, project_id: projectId },
  });
  if (!link) throw new AppError("Vínculo não encontrado", 404);
  await link.destroy();
}

module.exports = {
  listInstances,
  createInstance,
  ensureDefaultInstance,
  getWhatsappSetup,
  searchChats,
  syncConnectionState,
  getConnectQr,
  listClientLinks,
  addClientLink,
  removeClientLink,
  listProjectLinks,
  addProjectLink,
  removeProjectLink,
  formatPhoneDisplay,
};
