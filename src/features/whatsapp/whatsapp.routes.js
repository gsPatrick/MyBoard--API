const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const whatsappController = require("./whatsapp.controller");

const router = Router();

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

router.get("/clients/:clientId/threads", whatsappController.listClientThreads);
router.get("/clients/:clientId/links", whatsappController.listClientLinks);
router.post("/clients/:clientId/links", authorize("admin", "developer"), whatsappController.addClientLink);
router.delete(
  "/clients/:clientId/links/:linkId",
  authorize("admin", "developer"),
  whatsappController.removeClientLink
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
