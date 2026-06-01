const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const whatsappService = require("./whatsapp.service");
const whatsappIngestService = require("./whatsapp-ingest.service");

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
  });
  return sendSuccess(res, data);
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

module.exports = {
  listInstances,
  createInstance,
  syncConnectionState,
  getConnectQr,
  listClientLinks,
  addClientLink,
  removeClientLink,
  listProjectLinks,
  addProjectLink,
  removeProjectLink,
  getSetup,
  searchChats,
  backfillHistory,
  evolutionWebhook,
  chatwootWebhook,
};
