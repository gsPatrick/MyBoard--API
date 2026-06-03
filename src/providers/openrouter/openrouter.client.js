const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o-mini";

function isConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

async function createChatCompletion({
  messages,
  model = OPENROUTER_CHAT_MODEL,
  temperature = 0.3,
  max_tokens = 1200,
  tools = null,
  apiKey = null,
  baseUrl = null,
  apiFormat = "openai",
  provider = null,
}) {
  const resolvedKey = apiKey || process.env.OPENROUTER_API_KEY;
  const resolvedBase = String(baseUrl || OPENROUTER_BASE_URL).replace(/\/$/, "");

  if (!resolvedKey) {
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    return {
      content: `IA não configurada. Entrada recebida: ${lastUser?.content || "…"}`,
      raw: null,
      tool_calls: [],
    };
  }

  if (apiFormat === "anthropic") {
    return createAnthropicChatCompletion({
      messages,
      model,
      temperature,
      max_tokens,
      apiKey: resolvedKey,
      baseUrl: resolvedBase,
      provider,
    });
  }

  const body = {
    model: model || OPENROUTER_CHAT_MODEL,
    messages,
    temperature,
    max_tokens,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const headers = {
    Authorization: `Bearer ${resolvedKey}`,
    "Content-Type": "application/json",
  };

  if (resolvedBase.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "MyBoard Bordie";
  }

  const response = await fetch(`${resolvedBase}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat IA falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message || {};
  return {
    content: message.content || "",
    tool_calls: message.tool_calls || [],
    raw: payload,
  };
}

async function createAnthropicChatCompletion({
  messages,
  model,
  temperature = 0.3,
  max_tokens = 1200,
  apiKey,
  baseUrl,
  provider = null,
}) {
  const systemParts = messages.filter((item) => item.role === "system").map((item) => item.content);
  const conversation = messages
    .filter((item) => item.role !== "system")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || ""),
    }));

  const headers = {
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };

  if (provider === "custom") {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: max_tokens || 1200,
      temperature,
      system: systemParts.length ? systemParts.join("\n\n") : undefined,
      messages: conversation,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude falhou (${response.status}): ${errorText.slice(0, 240)}`);
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

module.exports = {
  OPENROUTER_CHAT_MODEL,
  isConfigured,
  createChatCompletion,
};
