const { Op } = require("sequelize");
const { RagFact, RagMessageAsset, MediaFile } = require("../models");

function buildScopeWhere(tenantId, scope = {}) {
  const where = { tenant_id: tenantId };
  if (scope.client_id) where.client_id = scope.client_id;
  if (scope.project_id) where.project_id = scope.project_id;
  if (scope.conversation_id) where.conversation_id = scope.conversation_id;
  return where;
}

const FACT_QUERY_HINTS = {
  deal_value: /valor|preço|preco|quanto|fech|orçamento|orcamento|R\$/i,
  deal_date: /quando|data|dia|fech|assin|início|inicio/i,
  contract: /contrato|pdf|documento|proposta|envia|manda/i,
  payment: /pagamento|parcela|boleto|pix/i,
  deadline: /prazo|entrega|deadline/i,
};

function detectFactTypes(query) {
  const types = [];
  for (const [type, regex] of Object.entries(FACT_QUERY_HINTS)) {
    if (regex.test(query)) types.push(type);
  }
  return types.length ? types : Object.keys(FACT_QUERY_HINTS);
}

async function searchFacts({ tenantId, query, scope = {}, limit = 8 }) {
  const where = buildScopeWhere(tenantId, scope);
  const q = String(query || "").trim();
  const factTypes = detectFactTypes(q);

  const orConditions = [
    { fact_type: { [Op.in]: factTypes } },
    { value_text: { [Op.iLike]: `%${q.slice(0, 80)}%` } },
    { label: { [Op.iLike]: `%${q.slice(0, 80)}%` } },
    { source_excerpt: { [Op.iLike]: `%${q.slice(0, 80)}%` } },
  ];

  const rows = await RagFact.findAll({
    where: {
      ...where,
      [Op.or]: orConditions,
    },
    limit,
    order: [
      ["confidence", "DESC"],
      ["updated_at", "DESC"],
    ],
  });

  return rows.map((row) => ({
    id: row.id,
    fact_type: row.fact_type,
    fact_key: row.fact_key,
    label: row.label,
    value_text: row.value_text,
    value_number: row.value_number != null ? Number(row.value_number) : null,
    value_date: row.value_date,
    value_json: row.value_json,
    confidence: row.confidence,
    source_excerpt: row.source_excerpt,
    client_id: row.client_id,
    project_id: row.project_id,
    score: row.confidence,
    source: "fact",
  }));
}

async function searchMediaAssets({ tenantId, query, scope = {}, limit = 6 }) {
  const where = buildScopeWhere(tenantId, scope);
  const q = String(query || "").trim();

  const contractBoost = /contrato|pdf|documento|proposta/i.test(q);

  const rows = await RagMessageAsset.findAll({
    where: {
      ...where,
      [Op.or]: [
        { extracted_text: { [Op.iLike]: `%${q.slice(0, 100)}%` } },
        { original_name: { [Op.iLike]: `%${q.slice(0, 100)}%` } },
        ...(contractBoost ? [{ is_contract: true }] : []),
      ],
    },
    limit,
    order: [
      ["is_contract", "DESC"],
      ["updated_at", "DESC"],
    ],
    include: [{ model: MediaFile, as: "mediaFile", required: false }],
  });

  return rows.map((row) => ({
    id: row.id,
    asset_type: row.asset_type,
    original_name: row.original_name,
    is_contract: row.is_contract,
    extracted_text: row.extracted_text,
    media_file_id: row.media_file_id,
    public_url: row.mediaFile?.public_url || null,
    storage_path: row.mediaFile?.storage_path || null,
    client_id: row.client_id,
    project_id: row.project_id,
    score: row.is_contract && contractBoost ? 0.95 : 0.7,
    source: "media",
  }));
}

async function getDealFacts({ tenantId, projectId, clientId }) {
  const where = { tenant_id: tenantId };
  if (projectId) where.project_id = projectId;
  else if (clientId) where.client_id = clientId;
  else return [];

  return RagFact.findAll({
    where: {
      ...where,
      fact_type: { [Op.in]: ["deal_value", "deal_date", "contract", "decision", "payment"] },
    },
    order: [["confidence", "DESC"], ["updated_at", "DESC"]],
    limit: 20,
  });
}

async function getLatestContract({ tenantId, projectId, clientId }) {
  const where = { tenant_id: tenantId, is_contract: true };
  if (projectId) where.project_id = projectId;
  else if (clientId) where.client_id = clientId;
  else return null;

  return RagMessageAsset.findOne({
    where,
    order: [["created_at", "DESC"]],
    include: [{ model: MediaFile, as: "mediaFile", required: false }],
  });
}

function formatFactsForContext(facts = []) {
  if (!facts.length) return "";

  const lines = ["## Fatos estruturados (alta confiança)"];
  for (const fact of facts) {
    const parts = [`[${fact.fact_type}/${fact.fact_key}] ${fact.label || ""}`.trim()];
    if (fact.value_text) parts.push(`texto: ${fact.value_text}`);
    if (fact.value_number != null) parts.push(`número: ${fact.value_number}`);
    if (fact.value_date) parts.push(`data: ${new Date(fact.value_date).toISOString().slice(0, 10)}`);
    if (fact.source_excerpt) parts.push(`trecho: ${fact.source_excerpt}`);
    lines.push(parts.join(" · "));
  }
  return lines.join("\n");
}

function formatMediaForContext(assets = []) {
  if (!assets.length) return "";

  const lines = ["## Documentos e mídia indexados"];
  for (const asset of assets) {
    lines.push(
      `- ${asset.original_name || asset.asset_type}${asset.is_contract ? " [CONTRATO]" : ""}: ${(asset.extracted_text || "").slice(0, 400)}`
    );
    if (asset.media_file_id) {
      lines.push(`  media_file_id: ${asset.media_file_id}`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  searchFacts,
  searchMediaAssets,
  getDealFacts,
  getLatestContract,
  formatFactsForContext,
  formatMediaForContext,
};
