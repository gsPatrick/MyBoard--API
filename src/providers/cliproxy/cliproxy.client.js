const CUSTOM_API_SURFACES = ["openai", "anthropic", "gemini"];

function normalizeApiSurface(value) {
  const id = String(value || "openai").toLowerCase();
  return CUSTOM_API_SURFACES.includes(id) ? id : "openai";
}

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

function resolveSurfaceBaseUrl(proxyRoot, apiSurface) {
  const root = normalizeProxyRoot(proxyRoot);
  if (apiSurface === "gemini") return `${root}/v1beta`;
  return `${root}/v1`;
}

function buildProxyAuthHeaders(apiKey, apiSurface) {
  const headers = { "Content-Type": "application/json" };

  if (apiSurface === "gemini") {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["X-Goog-Api-Key"] = apiKey;
  } else if (apiSurface === "anthropic") {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function openAiMessagesToGeminiContents(messages = []) {
  const systemParts = messages
    .filter((item) => item.role === "system")
    .map((item) => String(item.content || ""))
    .filter(Boolean);

  const contents = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    const role = message.role === "assistant" ? "model" : "user";
    const text = String(message.content || "").trim();
    if (!text) continue;

    contents.push({
      role,
      parts: [{ text }],
    });
  }

  if (systemParts.length && contents.length) {
    const firstUser = contents.find((item) => item.role === "user");
    if (firstUser?.parts?.[0]) {
      firstUser.parts[0].text = `${systemParts.join("\n\n")}\n\n${firstUser.parts[0].text}`.trim();
    }
  }

  return contents;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text || "")
    .join("")
    .trim();
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
    headers: buildProxyAuthHeaders(apiKey, "openai"),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proxy OpenAI falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message || {};

  return {
    content: message.content || "",
    tool_calls: message.tool_calls || [],
    raw: payload,
  };
}

async function createAnthropicSurfaceChat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  max_tokens = 1200,
}) {
  const systemParts = messages.filter((item) => item.role === "system").map((item) => item.content);
  const conversation = messages
    .filter((item) => item.role !== "system")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || ""),
    }));

  const response = await fetch(`${stripTrailingSlashes(baseUrl)}/messages`, {
    method: "POST",
    headers: buildProxyAuthHeaders(apiKey, "anthropic"),
    body: JSON.stringify({
      model,
      max_tokens: max_tokens || 1200,
      temperature,
      system: systemParts.length ? systemParts.join("\n\n") : undefined,
      messages: conversation,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proxy Claude falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const textBlock = Array.isArray(payload.content)
    ? payload.content.find((block) => block.type === "text")
    : null;

  return {
    content: textBlock?.text || "",
    tool_calls: [],
    raw: payload,
  };
}

async function createGeminiSurfaceChat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  max_tokens = 1200,
}) {
  const contents = openAiMessagesToGeminiContents(messages);
  if (!contents.length) {
    return { content: "", tool_calls: [], raw: null };
  }

  const url = `${stripTrailingSlashes(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildProxyAuthHeaders(apiKey, "gemini"),
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: max_tokens || 1200,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proxy Gemini falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();

  return {
    content: extractGeminiText(payload),
    tool_calls: [],
    raw: payload,
  };
}

async function createChatCompletion({
  apiSurface = "openai",
  proxyRoot,
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  max_tokens = 1200,
  tools = null,
}) {
  const surface = normalizeApiSurface(apiSurface);
  const root = normalizeProxyRoot(proxyRoot || baseUrl);
  const resolvedBase = baseUrl || resolveSurfaceBaseUrl(root, surface);

  if (tools?.length && surface !== "openai") {
    return createOpenAiSurfaceChat({
      baseUrl: resolveSurfaceBaseUrl(root, "openai"),
      apiKey,
      model,
      messages,
      temperature,
      max_tokens,
      tools,
    });
  }

  if (surface === "anthropic") {
    return createAnthropicSurfaceChat({
      baseUrl: resolvedBase,
      apiKey,
      model,
      messages,
      temperature,
      max_tokens,
    });
  }

  if (surface === "gemini") {
    return createGeminiSurfaceChat({
      baseUrl: resolvedBase,
      apiKey,
      model,
      messages,
      temperature,
      max_tokens,
    });
  }

  return createOpenAiSurfaceChat({
    baseUrl: resolvedBase,
    apiKey,
    model,
    messages,
    temperature,
    max_tokens,
    tools,
  });
}

module.exports = {
  CUSTOM_API_SURFACES,
  normalizeApiSurface,
  normalizeProxyRoot,
  resolveSurfaceBaseUrl,
  createChatCompletion,
};
