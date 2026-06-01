const openRouterClient = require("../providers/openrouter/openrouter.client");

const FACT_TYPES = [
  "deal_value",
  "deal_date",
  "contract",
  "payment",
  "deadline",
  "contact",
  "decision",
  "scope",
  "document",
  "other",
];

const MONEY_REGEX = /R\$\s*([\d.,]+)/gi;
const DATE_REGEX = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
const CLOSED_REGEX = /\b(fechamos|fechado|fechou|aprovado|assinado|confirmado)\b/i;
const CONTRACT_REGEX = /\b(contrato|proposta|pdf|documento)\b/i;
const EMAIL_REGEX = /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/gi;
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}\b/g;

function parseBrazilianMoney(raw) {
  const cleaned = String(raw).replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseBrazilianDate(day, month, year) {
  let y = parseInt(year, 10);
  if (y < 100) y += 2000;
  const d = new Date(Date.UTC(y, parseInt(month, 10) - 1, parseInt(day, 10)));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeFact(raw = {}) {
  const factType = FACT_TYPES.includes(raw.fact_type) ? raw.fact_type : "other";
  return {
    fact_type: factType,
    fact_key: String(raw.fact_key || "primary").slice(0, 120),
    label: raw.label ? String(raw.label).slice(0, 300) : null,
    value_text: raw.value_text ? String(raw.value_text).slice(0, 2000) : null,
    value_number: raw.value_number != null && Number.isFinite(Number(raw.value_number))
      ? Number(raw.value_number)
      : null,
    value_date: raw.value_date ? new Date(raw.value_date) : null,
    value_json: raw.value_json && typeof raw.value_json === "object" ? raw.value_json : {},
    confidence: Math.min(1, Math.max(0.3, Number(raw.confidence) || 0.7)),
    source_excerpt: raw.source_excerpt ? String(raw.source_excerpt).slice(0, 300) : null,
  };
}

function extractFactsFromText(text, { minConfidence = 0.5 } = {}) {
  const source = String(text || "").trim();
  const facts = [];
  if (!source) return facts;

  let match;
  while ((match = MONEY_REGEX.exec(source)) !== null) {
    const amount = parseBrazilianMoney(match[1]);
    if (amount != null) {
      facts.push(
        normalizeFact({
          fact_type: "deal_value",
          fact_key: "primary",
          label: "Valor mencionado",
          value_text: match[0],
          value_number: amount,
          confidence: 0.78,
          source_excerpt: source.slice(Math.max(0, match.index - 24), match.index + 48),
        })
      );
    }
  }

  while ((match = DATE_REGEX.exec(source)) !== null) {
    const date = parseBrazilianDate(match[1], match[2], match[3]);
    if (date) {
      const isClosed = CLOSED_REGEX.test(source);
      facts.push(
        normalizeFact({
          fact_type: isClosed ? "deal_date" : "deadline",
          fact_key: isClosed ? "closed_at" : "due_at",
          label: isClosed ? "Data de fechamento" : "Data/prazo",
          value_text: match[0],
          value_date: date,
          confidence: 0.72,
          source_excerpt: source.slice(Math.max(0, match.index - 24), match.index + 48),
        })
      );
    }
  }

  if (CLOSED_REGEX.test(source)) {
    facts.push(
      normalizeFact({
        fact_type: "decision",
        fact_key: "closed",
        label: "Decisão de fechamento",
        value_text: "Fechamento confirmado na conversa",
        confidence: 0.68,
        source_excerpt: source.slice(0, 160),
      })
    );
  }

  if (CONTRACT_REGEX.test(source)) {
    facts.push(
      normalizeFact({
        fact_type: "contract",
        fact_key: "mentioned",
        label: "Contrato/documento",
        value_text: source.match(CONTRACT_REGEX)?.[0] || "contrato",
        value_json: { mentioned: true },
        confidence: 0.62,
        source_excerpt: source.slice(0, 160),
      })
    );
  }

  while ((match = EMAIL_REGEX.exec(source)) !== null) {
    facts.push(
      normalizeFact({
        fact_type: "contact",
        fact_key: "email",
        label: "E-mail",
        value_text: match[0],
        value_json: { email: match[0] },
        confidence: 0.8,
        source_excerpt: match[0],
      })
    );
  }

  while ((match = PHONE_REGEX.exec(source)) !== null) {
    facts.push(
      normalizeFact({
        fact_type: "contact",
        fact_key: "phone",
        label: "Telefone",
        value_text: match[0],
        value_json: { phone: match[0] },
        confidence: 0.75,
        source_excerpt: match[0],
      })
    );
  }

  return facts.filter((fact) => fact.confidence >= minConfidence);
}

function buildLlmExtractionInstruction() {
  return [
    "Extraia fatos estruturados de mensagens em português.",
    `Tipos permitidos: ${FACT_TYPES.join(", ")}.`,
    "Retorne APENAS JSON array válido, sem markdown.",
    "Cada item: fact_type, fact_key, label, value_text, value_number, value_date (ISO), value_json, confidence (0.5-1), source_excerpt.",
    "Extraia só fatos explícitos ou fortemente implícitos. Não invente.",
  ].join(" ");
}

function parseJsonArray(raw) {
  try {
    const cleaned = String(raw || "")
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed.map(normalizeFact) : [];
  } catch {
    return [];
  }
}

async function extractFactsWithLlm(text, { maxChars = 3500 } = {}) {
  const source = String(text || "").trim();
  if (!openRouterClient.isConfigured() || source.length < 15) return [];

  try {
    const response = await openRouterClient.createChatCompletion({
      messages: [
        { role: "system", content: buildLlmExtractionInstruction() },
        { role: "user", content: source.slice(0, maxChars) },
      ],
      temperature: 0,
      max_tokens: 900,
    });

    return parseJsonArray(response.content);
  } catch (error) {
    console.warn("[RAG] extractFactsWithLlm falhou:", error.message);
    return [];
  }
}

function mergeExtractedFacts(...groups) {
  const map = new Map();

  for (const group of groups) {
    for (const fact of group || []) {
      const normalized = normalizeFact(fact);
      const key = `${normalized.fact_type}:${normalized.fact_key}`;
      const existing = map.get(key);
      if (!existing || normalized.confidence > existing.confidence) {
        map.set(key, normalized);
      }
    }
  }

  return Array.from(map.values());
}

async function extractAllFacts(text, options = {}) {
  const heuristic = extractFactsFromText(text, options);
  const llm = options.skipLlm ? [] : await extractFactsWithLlm(text, options);
  const extra = (options.extraFacts || []).map(normalizeFact);
  return mergeExtractedFacts(heuristic, llm, extra);
}

module.exports = {
  FACT_TYPES,
  extractFactsFromText,
  extractFactsWithLlm,
  extractAllFacts,
  mergeExtractedFacts,
  normalizeFact,
  buildLlmExtractionInstruction,
};
