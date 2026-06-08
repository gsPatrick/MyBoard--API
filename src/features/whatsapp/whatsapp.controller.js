const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const AppError = require("../../utils/app-error");
const whatsappService = require("./whatsapp.service");
const whatsappIngestService = require("./whatsapp-ingest.service");
const whatsappConversationsService = require("./whatsapp-conversations.service");
const whatsappImportService = require("./whatsapp-import.service");

function isTruthyFlag(value) {
  return value === "1" || value === "true" || value === true;
}

const listInstances = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const instances = await whatsappService.listInstances(ctx);
  return sendSuccess(res, instances);
});

const createInstance = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const instance = await whatsappService.createInstance(req.body, ctx);
  return sendCreated(res, instance);
});

const syncConnectionState = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const instance = await whatsappService.syncConnectionState(req.params.id, ctx);
  return sendSuccess(res, instance);
});

const getConnectQr = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const qr = await whatsappService.getConnectQr(req.params.id, ctx);
  return sendSuccess(res, qr);
});

const listClientLinks = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const links = await whatsappService.listClientLinks(req.params.clientId, ctx);
  return sendSuccess(res, links);
});

const addClientLink = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const link = await whatsappService.addClientLink(req.params.clientId, req.body, ctx);
  return sendCreated(res, link);
});

const removeClientLink = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await whatsappService.removeClientLink(req.params.clientId, req.params.linkId, ctx);
  return sendNoContent(res);
});

const listProjectLinks = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const links = await whatsappService.listProjectLinks(req.params.projectId, ctx);
  return sendSuccess(res, links);
});

const addProjectLink = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const link = await whatsappService.addProjectLink(req.params.projectId, req.body, ctx);
  return sendCreated(res, link);
});

const removeProjectLink = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await whatsappService.removeProjectLink(req.params.projectId, req.params.linkId, ctx);
  return sendNoContent(res);
});

const getSetup = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await whatsappService.getWhatsappSetup(ctx, {
    statusOnly: req.query.status_only === "1" || req.query.status_only === "true",
    refreshQr: req.query.refresh_qr === "1" || req.query.refresh_qr === "true",
    phone: req.query.phone || null,
  });
  return sendSuccess(res, data);
});

const disconnect = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappService.disconnectWhatsapp(ctx);
  return sendSuccess(res, result);
});

const searchChats = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await whatsappService.searchChats(ctx, {
    q: req.query.q || "",
    type: req.query.type || "all",
    limit: req.query.limit,
  });
  return sendSuccess(res, data);
});

const listClientThreads = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const threads = await whatsappConversationsService.listClientThreads(req.params.clientId, ctx);
  return sendSuccess(res, threads);
});

const listProjectThreads = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const threads = await whatsappConversationsService.listProjectThreads(req.params.projectId, ctx);
  return sendSuccess(res, threads);
});

const listConversationMessages = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await whatsappConversationsService.listConversationMessages(
    req.params.conversationId,
    ctx,
    {
      limit: req.query.limit,
      before: req.query.before,
      clientId: req.query.client_id || null,
      projectId: req.query.project_id || null,
    }
  );
  return sendSuccess(res, data);
});

const backfillHistory = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const backfillService = require("./whatsapp-backfill.service");
  const result = await backfillService.backfillInstanceHistory({
    instanceId: req.params.id,
    tenantId: ctx.tenantId,
    remoteJid: req.body?.remote_jid || null,
    limit: Math.min(Number(req.body?.limit) || 200, 500),
  });
  return sendSuccess(res, result);
});

function verifyWebhookSecret(req) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) return true;
  const headerSecret = req.get("x-myboard-webhook-secret");
  const querySecret = req.query?.secret;
  return headerSecret === secret || querySecret === secret;
}

const evolutionWebhook = catchAsync(async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ success: false, message: "Webhook não autorizado" });
  }

  const result = await whatsappIngestService.ingestEvolutionWebhook(req.body);
  return sendSuccess(res, result);
});

const chatwootWebhook = catchAsync(async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ success: false, message: "Webhook não autorizado" });
  }

  const tenantId = req.query.tenant_id || req.body?.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ success: false, message: "tenant_id é obrigatório" });
  }

  const result = await whatsappIngestService.ingestChatwootWebhook(req.body, tenantId);
  return sendSuccess(res, result);
});

// ---- Importação de conversa exportada (.zip/.txt) ----
const getClientImportMode = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappImportService.getClientMode(req.params.clientId, ctx);
  return sendSuccess(res, result);
});

const importClientChat = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Envie o arquivo da conversa (.zip ou .txt).", 400, "FILE_REQUIRED");
  const ctx = buildServiceContext(req);
  const confirmSwitch = isTruthyFlag(req.query.confirm ?? req.body?.confirm);
  const result = await whatsappImportService.importClient(req.params.clientId, req.file, { confirmSwitch }, ctx);
  return sendCreated(res, result);
});

const removeClientImport = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappImportService.removeClientImport(req.params.clientId, req.params.conversationId, ctx);
  return sendSuccess(res, result);
});

const switchClientToLive = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappImportService.switchClientToLive(req.params.clientId, ctx);
  return sendSuccess(res, result);
});

const getProjectImportMode = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappImportService.getProjectMode(req.params.projectId, ctx);
  return sendSuccess(res, result);
});

const importProjectChat = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Envie o arquivo da conversa (.zip ou .txt).", 400, "FILE_REQUIRED");
  const ctx = buildServiceContext(req);
  const confirmSwitch = isTruthyFlag(req.query.confirm ?? req.body?.confirm);
  const result = await whatsappImportService.importProject(req.params.projectId, req.file, { confirmSwitch }, ctx);
  return sendCreated(res, result);
});

const removeProjectImport = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappImportService.removeProjectImport(req.params.projectId, req.params.conversationId, ctx);
  return sendSuccess(res, result);
});

const switchProjectToLive = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await whatsappImportService.switchProjectToLive(req.params.projectId, ctx);
  return sendSuccess(res, result);
});

module.exports = {
  listInstances,
  createInstance,
  getClientImportMode,
  importClientChat,
  removeClientImport,
  switchClientToLive,
  getProjectImportMode,
  importProjectChat,
  removeProjectImport,
  switchProjectToLive,
  syncConnectionState,
  getConnectQr,
  listClientLinks,
  addClientLink,
  removeClientLink,
  listProjectLinks,
  addProjectLink,
  removeProjectLink,
  getSetup,
  disconnect,
  searchChats,
  listClientThreads,
  listProjectThreads,
  listConversationMessages,
  backfillHistory,
  evolutionWebhook,
  chatwootWebhook,
};
