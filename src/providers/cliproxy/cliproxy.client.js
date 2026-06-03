function stripTrailingSlashes(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeProxyRoot(rawUrl) {
  let url = stripTrailingSlashes(rawUrl);
  if (!url) return "http://localhost:8317";

  for (let i = 0; i < 5; i += 1) {
    const next = stripTrailingSlashes(url)
      .replace(/\/v1beta$/i, "")
      .replace(/\/v1$/i, "")
      .replace(/\/chat\/completions$/i, "")
      .replace(/\/embeddings$/i, "")
      .replace(/\/messages$/i, "")
      .replace(/\/models\/[^/]+:generateContent$/i, "");
    if (next === url) break;
    url = next;
  }

  return url || "http://localhost:8317";
}

function resolveSurfaceBaseUrl(proxyRoot, apiSurface = "openai") {
  const root = normalizeProxyRoot(proxyRoot);
  if (apiSurface === "gemini") return `${root}/v1beta`;
  return `${root}/v1`;
}

function buildProxyAuthHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function createOpenAiSurfaceChat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  max_tokens = 1200,
  tools = null,
}) {
  const body = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(`${stripTrailingSlashes(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: buildProxyAuthHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proxy falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message || {};

  return {
    content: message.content || "",
    tool_calls: message.tool_calls || [],
    raw: payload,
  };
}

async function createChatCompletion({
  proxyRoot,
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  max_tokens = 1200,
  tools = null,
}) {
  const root = normalizeProxyRoot(proxyRoot || baseUrl);
  const openAiBase = baseUrl || resolveSurfaceBaseUrl(root, "openai");

  return createOpenAiSurfaceChat({
    baseUrl: openAiBase,
    apiKey,
    model,
    messages,
    temperature,
    max_tokens,
    tools,
  });
}

module.exports = {
  normalizeProxyRoot,
  resolveSurfaceBaseUrl,
  createOpenAiSurfaceChat,
  createChatCompletion,
};
