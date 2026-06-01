const openRouterClient = require("../providers/openrouter/openrouter.client");
const promptLoader = require("../ai/prompt-loader");

const SYNONYM_EXPANSIONS = [
  { pattern: /fech(amos|ou|ado)?/i, extra: ["valor acordado", "deal closed", "preço final"] },
  { pattern: /contrato/i, extra: ["PDF contrato", "documento assinado", "proposta"] },
  { pattern: /valor|preço|preco/i, extra: ["R$", "orçamento", "investimento", "deal_value"] },
  { pattern: /quando|data|dia/i, extra: ["data fechamento", "deal_date", "assinatura"] },
];

function heuristicExpansions(query) {
  const base = String(query || "").trim();
  const variants = new Set([base]);

  for (const rule of SYNONYM_EXPANSIONS) {
    if (rule.pattern.test(base)) {
      for (const extra of rule.extra) {
        variants.add(`${base} ${extra}`.trim());
      }
    }
  }

  return Array.from(variants).slice(0, 4);
}

async function expandQuery(query, scope = {}) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [trimmed];

  const heuristic = heuristicExpansions(trimmed);

  if (!openRouterClient.isConfigured()) {
    return heuristic;
  }

  try {
    const systemPrompt =
      promptLoader.loadPrompt("rag/query_rewrite") +
      "\n\nGere até 3 reformulações curtas da pergunta para busca semântica. Retorne JSON array de strings.";

    const response = await openRouterClient.createChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify({ query: trimmed, scope }) },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const parsed = JSON.parse(
      String(response.content || "[]")
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim()
    );

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === "string" && item.trim()) heuristic.push(item.trim());
      }
    }
  } catch {
    // fallback heuristic only
  }

  return [...new Set(heuristic)].slice(0, 5);
}

module.exports = { expandQuery, heuristicExpansions };
