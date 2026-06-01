const DEFAULT_BASE_URL =
  process.env.EVOLUTION_API_BASE_URL ||
  "http://sistemas-externos-evolution-api.wxvjid.easypanel.host";

function getApiKey() {
  return process.env.EVOLUTION_API_KEY || "";
}

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: getApiKey(),
  };
}

async function request(path, options = {}) {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: buildHeaders(),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.message
        ? payload.message
        : typeof payload === "string"
          ? payload
          : `Evolution API error ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function createInstance(payload, baseUrl) {
  return request("/instance/create", { method: "POST", body: payload, baseUrl });
}

async function fetchInstances(baseUrl) {
  return request("/instance/fetchInstances", { baseUrl });
}

async function connectInstance(instanceName, baseUrl) {
  return request(`/instance/connect/${encodeURIComponent(instanceName)}`, { baseUrl });
}

async function connectionState(instanceName, baseUrl) {
  return request(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { baseUrl });
}

async function setWebhook(instanceName, payload, baseUrl) {
  return request(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: payload,
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
  connectInstance,
  connectionState,
  setWebhook,
  sendText,
  sendMedia,
  getBase64FromMediaMessage,
  downloadMedia,
  findMessages,
  findChats,
  setChatwoot,
};
