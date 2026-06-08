const { Router } = require("express");
const multer = require("multer");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const whatsappController = require("./whatsapp.controller");

const router = Router();

// Upload dedicado para conversas exportadas (zips podem ser grandes).
const EXPORT_MAX_MB = Number(process.env.WHATSAPP_EXPORT_MAX_MB || 120);
const exportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: EXPORT_MAX_MB * 1024 * 1024 },
});

router.post("/webhooks/evolution", whatsappController.evolutionWebhook);
router.post("/webhooks/chatwoot", whatsappController.chatwootWebhook);

router.use(...requireAuth);

router.get("/instances", whatsappController.listInstances);
router.get("/setup", whatsappController.getSetup);
router.post("/disconnect", authorize("admin", "developer"), whatsappController.disconnect);
router.get("/chats/search", whatsappController.searchChats);
router.post("/instances", authorize("admin", "developer"), whatsappController.createInstance);
router.post("/instances/:id/sync", authorize("admin", "developer"), whatsappController.syncConnectionState);
router.post("/instances/:id/backfill", authorize("admin", "developer"), whatsappController.backfillHistory);
router.get("/instances/:id/connect", authorize("admin", "developer"), whatsappController.getConnectQr);

// Importação de conversa exportada — Cliente (um import, reimportável)
router.get("/clients/:clientId/import", whatsappController.getClientImportMode);
router.post(
  "/clients/:clientId/import",
  authorize("admin", "developer"),
  exportUpload.single("file"),
  whatsappController.importClientChat
);
router.post(
  "/clients/:clientId/import/switch-live",
  authorize("admin", "developer"),
  whatsappController.switchClientToLive
);
router.delete(
  "/clients/:clientId/import/:conversationId",
  authorize("admin", "developer"),
  whatsappController.removeClientImport
);

router.get("/clients/:clientId/threads", whatsappController.listClientThreads);
router.get("/clients/:clientId/links", whatsappController.listClientLinks);
router.post("/clients/:clientId/links", authorize("admin", "developer"), whatsappController.addClientLink);
router.delete(
  "/clients/:clientId/links/:linkId",
  authorize("admin", "developer"),
  whatsappController.removeClientLink
);

// Importação de conversa exportada — Projeto (vários grupos/contatos)
router.get("/projects/:projectId/import", whatsappController.getProjectImportMode);
router.post(
  "/projects/:projectId/import",
  authorize("admin", "developer"),
  exportUpload.single("file"),
  whatsappController.importProjectChat
);
router.post(
  "/projects/:projectId/import/switch-live",
  authorize("admin", "developer"),
  whatsappController.switchProjectToLive
);
router.delete(
  "/projects/:projectId/import/:conversationId",
  authorize("admin", "developer"),
  whatsappController.removeProjectImport
);

router.get("/projects/:projectId/threads", whatsappController.listProjectThreads);
router.get("/projects/:projectId/links", whatsappController.listProjectLinks);
router.get("/conversations/:conversationId/messages", whatsappController.listConversationMessages);
router.post("/projects/:projectId/links", authorize("admin", "developer"), whatsappController.addProjectLink);
router.delete(
  "/projects/:projectId/links/:linkId",
  authorize("admin", "developer"),
  whatsappController.removeProjectLink
);

module.exports = router;
