const { WhatsappInstance, ProjectWhatsappLink } = require("../../models");
const factsRetrieval = require("../../rag/facts-retrieval.service");

const CONTRACT_INTENT = /contrato|pdf|documento|envia|manda|mandar/i;
const DEAL_INTENT = /valor|preço|preco|fech|quanto|data|dia/i;

function detectToolNeeds(message = "") {
  const text = String(message);
  return {
    wantsContract: CONTRACT_INTENT.test(text),
    wantsDealFacts: DEAL_INTENT.test(text),
  };
}

async function gatherStructuredIntel({ tenantId, query, context = {} }) {
  const scope = {
    client_id: context.client?.id || context.client_id || null,
    project_id: context.project?.id || context.project_id || null,
  };

  const needs = detectToolNeeds(query);
  const [facts, media, dealFacts, contract] = await Promise.all([
    factsRetrieval.searchFacts({ tenantId, query, scope, limit: 10 }),
    needs.wantsContract
      ? factsRetrieval.searchMediaAssets({ tenantId, query, scope, limit: 4 })
      : Promise.resolve([]),
    needs.wantsDealFacts || scope.project_id || scope.client_id
      ? factsRetrieval.getDealFacts({
          tenantId,
          projectId: scope.project_id,
          clientId: scope.client_id,
        })
      : Promise.resolve([]),
    needs.wantsContract
      ? factsRetrieval.getLatestContract({
          tenantId,
          projectId: scope.project_id,
          clientId: scope.client_id,
        })
      : Promise.resolve(null),
  ]);

  return { facts, media, dealFacts, contract, scope, needs };
}

async function resolveWhatsappTarget({ tenantId, projectId, clientId }) {
  const where = { tenant_id: tenantId };
  if (projectId) where.project_id = projectId;

  const link = await ProjectWhatsappLink.findOne({
    where,
    order: [["updated_at", "DESC"]],
  });

  if (link?.whatsapp_jid || link?.external_id) {
    const jid =
      link.link_type === "group"
        ? link.whatsapp_jid || link.external_id
        : link.whatsapp_jid || `${String(link.external_id).replace(/\D/g, "")}@s.whatsapp.net`;
    return {
      remoteJid: jid,
    };
  }

  return null;
}

async function buildWhatsAppMediaAction({ tenantId, context, contractAsset }) {
  if (!contractAsset?.media_file_id) return null;

  const instance = await WhatsappInstance.findOne({
    where: { tenant_id: tenantId, is_active: true },
    order: [["updated_at", "DESC"]],
  });

  if (!instance) return null;

  const target = await resolveWhatsappTarget({
    tenantId,
    projectId: context.project?.id || context.project_id,
    clientId: context.client?.id || context.client_id,
  });

  if (!target?.remoteJid) return null;

  return {
    type: "send_whatsapp_media",
    status: "ready",
    requires_confirmation: true,
    payload: {
      instance_name: instance.instance_name,
      remote_jid: target.remoteJid,
      media_file_id: contractAsset.media_file_id,
      file_name: contractAsset.original_name,
      caption: contractAsset.original_name || "Contrato",
    },
  };
}

function formatIntelContext(intel) {
  const parts = [];

  const dealFormatted = (intel.dealFacts || []).map((f) => ({
    fact_type: f.fact_type,
    label: f.label,
    value_text: f.value_text,
    value_number: f.value_number != null ? Number(f.value_number) : null,
    value_date: f.value_date,
    confidence: f.confidence,
  }));

  if (dealFormatted.length) {
    parts.push("## Inteligência do negócio (SQL)");
    parts.push(JSON.stringify(dealFormatted, null, 2));
  }

  parts.push(factsRetrieval.formatFactsForContext(intel.facts));
  parts.push(factsRetrieval.formatMediaForContext(intel.media));

  if (intel.contract) {
    parts.push(
      `## Contrato mais recente\n- ${intel.contract.original_name}\n- media_file_id: ${intel.contract.media_file_id || "n/a"}\n- trecho: ${(intel.contract.extracted_text || "").slice(0, 500)}`
    );
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

module.exports = {
  detectToolNeeds,
  gatherStructuredIntel,
  buildWhatsAppMediaAction,
  formatIntelContext,
  resolveWhatsappTarget,
};
