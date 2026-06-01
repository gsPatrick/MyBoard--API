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
const DEFAULT_QR_TTL_MS = Number(process.env.WHATSAPP_QR_TTL_MS) || 25000;

function getQrCache(instance) {
  return instance?.settings?.qr_cache || null;
}

function isQrCacheValid(instance) {
  const cache = getQrCache(instance);
  if (!cache?.base64) return false;
  return Date.now() < Number(cache.expires_at || 0);
}

function buildQrResponseFromCache(instance) {
  const cache = getQrCache(instance);
  if (!isQrCacheValid(instance)) return null;

  return {
    base64: cache.base64,
    pairingCode: cache.pairing_code || null,
    cached: true,
    expires_at: cache.expires_at,
  };
}

async function persistQrCache(instance, qrPayload) {
  const fetchedAt = Date.now();
  const expiresAt = fetchedAt + DEFAULT_QR_TTL_MS;
  const settings = {
    ...(instance.settings || {}),
    qr_cache: {
      base64: qrPayload?.base64 || null,
      pairing_code: qrPayload?.pairingCode || null,
      code: qrPayload?.code || null,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    },
  };

  await instance.update({ settings });
  instance.settings = settings;

  return {
    ...(qrPayload || {}),
    cached: false,
    expires_at: expiresAt,
  };
}

async function clearQrCache(instance) {
  if (!instance?.settings?.qr_cache) return;
  const settings = { ...(instance.settings || {}) };
  delete settings.qr_cache;
  await instance.update({ settings });
  instance.settings = settings;
}

async function fetchConnectQr(instance, { force = false } = {}) {
  if (!force && isQrCacheValid(instance)) {
    return buildQrResponseFromCache(instance);
  }

  const qrPayload = await evolutionClient.connectInstance(
    instance.instance_name,
    instance.evolution_base_url
  );

  if (qrPayload?.base64) {
    return persistQrCache(instance, qrPayload);
  }

  return qrPayload;
}

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
  const base = `${appUrl}${prefix}/v1/whatsapp/webhooks/evolution`;
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}secret=${encodeURIComponent(secret)}`;
}

function mapEvolutionConnectionState(remoteInstance) {
  return (
    remoteInstance?.connectionStatus ||
    remoteInstance?.connection_state ||
    remoteInstance?.state ||
    "unknown"
  );
}

function isEvolutionNameInUseError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 403 && message.includes("already in use");
}

async function configureEvolutionWebhook(instanceName, baseUrl) {
  const webhookUrl = buildWebhookUrl();
  if (!webhookUrl.startsWith("http")) {
    console.warn("[whatsapp] APP_URL inválida para webhook:", webhookUrl);
    return null;
  }

  try {
    return await evolutionClient.setWebhook(
      instanceName,
      {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"],
      },
      baseUrl
    );
  } catch (error) {
    console.warn(`[whatsapp] Falha ao configurar webhook (${instanceName}):`, error.message);
    return null;
  }
}

async function provisionEvolutionInstance(instanceName, baseUrl, options = {}) {
  if (!process.env.EVOLUTION_API_KEY) return null;

  let remoteInstance = await evolutionClient.findInstanceByName(instanceName, baseUrl);

  if (!remoteInstance) {
    try {
      await evolutionClient.createInstance(
        {
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          ...(options.chatwoot_account_id
            ? {
                chatwootAccountId: String(options.chatwoot_account_id),
                chatwootToken: options.chatwoot_token || process.env.CHATWOOT_API_TOKEN,
                chatwootUrl: options.chatwoot_url || process.env.CHATWOOT_BASE_URL,
                chatwootSignMsg: false,
                chatwootReopenConversation: true,
                chatwootConversationPending: false,
                chatwootImportContacts: true,
                chatwootNameInbox: options.chatwoot_name_inbox || instanceName,
                chatwootMergeBrazilContacts: true,
                chatwootImportMessages: true,
                chatwootDaysLimitImportMessages: options.import_days || 3,
              }
            : {}),
        },
        baseUrl
      );
      remoteInstance = await evolutionClient.findInstanceByName(instanceName, baseUrl);
    } catch (error) {
      if (!isEvolutionNameInUseError(error)) throw error;
      remoteInstance = await evolutionClient.findInstanceByName(instanceName, baseUrl);
    }
  }

  if (options.configure_webhook !== false) {
    await configureEvolutionWebhook(instanceName, baseUrl);
  }

  return remoteInstance;
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
  let remoteInstance = null;

  if (payload.provision !== false && process.env.EVOLUTION_API_KEY) {
    remoteInstance = await provisionEvolutionInstance(instanceName, baseUrl, payload);
  }

  return WhatsappInstance.create({
    tenant_id: ctx.tenantId,
    instance_name: instanceName,
    provider: "evolution",
    evolution_base_url: baseUrl,
    connection_state: mapEvolutionConnectionState(remoteInstance),
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

  instance = await WhatsappInstance.findOne({
    where: { tenant_id: ctx.tenantId, instance_name: DEFAULT_INSTANCE_NAME },
  });
  if (instance) {
    if (!instance.is_active) {
      await instance.update({ is_active: true });
    }
    return instance;
  }

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

async function refreshInstanceConnectionState(instance) {
  if (!instance) return instance;

  try {
    const payload = await evolutionClient.connectionState(
      instance.instance_name,
      instance.evolution_base_url
    );
    const state = payload?.instance?.state || payload?.state || "unknown";
    if (state !== instance.connection_state) {
      await instance.update({ connection_state: state });
    }
  } catch (error) {
    console.warn(`[whatsapp] Falha ao sincronizar estado (${instance.instance_name}):`, error.message);
  }

  return instance;
}

async function getWhatsappSetup(ctx, options = {}) {
  const statusOnly = Boolean(options.statusOnly);
  const refreshQr = Boolean(options.refreshQr);
  let instance = await refreshInstanceConnectionState(await ensureDefaultInstance(ctx));

  if (instance.connection_state === "open") {
    await clearQrCache(instance);
    return {
      instance: {
        id: instance.id,
        instance_name: instance.instance_name,
        connection_state: instance.connection_state,
      },
      qr: null,
      connected: true,
    };
  }

  if (statusOnly) {
    const cachedQr = buildQrResponseFromCache(instance);
    return {
      instance: {
        id: instance.id,
        instance_name: instance.instance_name,
        connection_state: instance.connection_state,
      },
      qr: cachedQr,
      connected: false,
      qr_expired: !cachedQr,
      qr_expires_at: cachedQr?.expires_at || getQrCache(instance)?.expires_at || null,
    };
  }

  let qr = null;
  try {
    qr = await fetchConnectQr(instance, { force: refreshQr });
  } catch (error) {
    qr = { error: error.message };
  }

  return {
    instance: {
      id: instance.id,
      instance_name: instance.instance_name,
      connection_state: instance.connection_state,
    },
    qr,
    connected: false,
    qr_expired: Boolean(qr?.error),
    qr_expires_at: qr?.expires_at || null,
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

  return fetchConnectQr(instance, { force: true });
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
