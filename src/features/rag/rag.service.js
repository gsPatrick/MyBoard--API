const retrievalService = require("../../rag/retrieval.service");
const ingestService = require("../../rag/ingest.service");

async function search(query, scope, ctx) {
  return retrievalService.searchKnowledge({
    tenantId: ctx.tenantId,
    query,
    scope: {
      client_id: scope.client_id || null,
      project_id: scope.project_id || null,
      channel: scope.channel || null,
      channels: scope.channels || null,
      conversation_id: scope.conversation_id || null,
    },
    limit: scope.limit || 12,
  });
}

async function ingestWorkspaceDocument(payload, ctx) {
  return ingestService.ingestWorkspaceDocument({
    tenantId: ctx.tenantId,
    channel: payload.channel || "workspace",
    sourceType: payload.source_type || "manual",
    clientId: payload.client_id || null,
    projectId: payload.project_id || null,
    title: payload.title || null,
    content: payload.content,
    metadata: payload.metadata || {},
  });
}

module.exports = {
  search,
  ingestWorkspaceDocument,
};
