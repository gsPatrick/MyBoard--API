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
}) {
  const resolvedKey = apiKey || process.env.OPENROUTER_API_KEY;
  const resolvedBase = (baseUrl || OPENROUTER_BASE_URL).replace(/\/$/, "");

  if (!resolvedKey) {
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    return {
      content: `OpenRouter não configurado. Entrada recebida: ${lastUser?.content || "…"}`,
      raw: null,
    };
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

  const response = await fetch(`${resolvedBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "MyBoard Bordie",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter chat falhou (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message || {};
  return {
    content: message.content || "",
    tool_calls: message.tool_calls || [],
    raw: payload,
  };
}

module.exports = {
  OPENROUTER_CHAT_MODEL,
  isConfigured,
  createChatCompletion,
};
