const DEFAULT_BASE_URL = process.env.CHATWOOT_BASE_URL || "";
const DEFAULT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "2";

function getToken() {
  return process.env.CHATWOOT_API_TOKEN || "";
}

function isConfigured() {
  return Boolean(DEFAULT_BASE_URL && getToken());
}

async function request(path, options = {}) {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const accountId = options.accountId || DEFAULT_ACCOUNT_ID;

  const response = await fetch(`${baseUrl}/api/v1/accounts/${accountId}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      api_access_token: getToken(),
    },
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
    const error = new Error(
      typeof payload === "object" && payload?.message ? payload.message : `Chatwoot error ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function listInboxes(options = {}) {
  return request("/inboxes", options);
}

async function searchContact(query, options = {}) {
  return request(`/contacts/search?q=${encodeURIComponent(query)}&include_contacts=true`, options);
}

async function listConversationMessages(conversationId, options = {}) {
  return request(`/conversations/${conversationId}/messages`, options);
}

module.exports = {
  isConfigured,
  listInboxes,
  searchContact,
  listConversationMessages,
};
