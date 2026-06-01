const DEFAULT_BASE_URL =
  process.env.EVOLUTION_API_BASE_URL ||
  "http://sistemas-externos-evolution-api.wxvjid.easypanel.host";

function getApiKey() {
  return process.env.EVOLUTION_API_KEY || "";
}

function formatEvolutionError(payload, status) {
  const nested = payload?.response?.message;
  if (Array.isArray(nested)) {
    const flat = nested.flat().filter(Boolean);
    if (flat.length) return flat.join("; ");
  }
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.error === "string" && payload.error !== "Bad Request") {
    return payload.error;
  }
  return `Evolution API error ${status}`;
}

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: getApiKey(),
  };
}

async function request(path, options = {}) {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: buildHeaders(),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = formatEvolutionError(payload, response.status);
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Evolution API timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function createInstance(payload, baseUrl) {
  return request("/instance/create", { method: "POST", body: payload, baseUrl });
}

async function fetchInstances(baseUrl) {
  return request("/instance/fetchInstances", { baseUrl });
}

function normalizeFetchedInstances(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.instances)) return payload.instances;
  return [];
}

async function findInstanceByName(instanceName, baseUrl) {
  const payload = await fetchInstances(baseUrl);
  const instances = normalizeFetchedInstances(payload);
  const target = String(instanceName || "").trim().toLowerCase();
  return (
    instances.find((item) => String(item?.name || item?.instanceName || "").toLowerCase() === target) ||
    null
  );
}

async function connectInstance(instanceName, baseUrl, { number } = {}) {
  const params = number ? `?number=${encodeURIComponent(String(number).replace(/\D/g, ""))}` : "";
  return request(`/instance/connect/${encodeURIComponent(instanceName)}${params}`, { baseUrl });
}

async function connectionState(instanceName, baseUrl) {
  return request(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { baseUrl });
}

async function setWebhook(instanceName, payload, baseUrl) {
  const events = payload.events || [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "CONNECTION_UPDATE",
    "SEND_MESSAGE",
  ];

  const body = {
    webhook: {
      enabled: payload.enabled !== false,
      url: payload.url,
      webhookByEvents: payload.webhookByEvents ?? payload.webhook_by_events ?? false,
      webhookBase64: payload.webhookBase64 ?? payload.webhook_base64 ?? false,
      events,
    },
  };

  return request(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body,
    baseUrl,
  });
}

async function sendText(instanceName, payload, baseUrl) {
  return request(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

async function sendMedia(instanceName, payload, baseUrl) {
  return request(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

async function getBase64FromMediaMessage(instanceName, payload, baseUrl) {
  return request(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

async function downloadMedia(instanceName, { message, baseUrl } = {}) {
  const result = await getBase64FromMediaMessage(
    instanceName,
    { message: message?.message ? message : { key: message?.key, message: message?.message || message } },
    baseUrl
  );

  const base64 = result?.base64 || result?.data?.base64 || result?.media?.base64;
  if (!base64) return null;
  const cleaned = String(base64).replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(cleaned, "base64");
}

async function findMessages(instanceName, payload, baseUrl) {
  return request(`/chat/findMessages/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

async function findContacts(instanceName, payload = {}, baseUrl) {
  return request(`/chat/findContacts/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
    timeoutMs: 45000,
  });
}

async function fetchAllGroups(instanceName, baseUrl, { getParticipants = false } = {}) {
  return request(
    `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=${getParticipants ? "true" : "false"}`,
    { baseUrl, timeoutMs: 20000 }
  );
}

async function setSettings(instanceName, payload, baseUrl) {
  return request(`/settings/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

async function findChats(instanceName, payload = {}, baseUrl) {
  return request(`/chat/findChats/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

async function setChatwoot(instanceName, payload, baseUrl) {
  return request(`/chatwoot/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
    baseUrl,
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  createInstance,
  fetchInstances,
  findInstanceByName,
  normalizeFetchedInstances,
  connectInstance,
  connectionState,
  setWebhook,
  sendText,
  sendMedia,
  getBase64FromMediaMessage,
  downloadMedia,
  findMessages,
  findContacts,
  fetchAllGroups,
  setSettings,
  findChats,
  setChatwoot,
};
