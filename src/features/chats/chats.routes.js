const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const chatsController = require("./chats.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", chatsController.list);
router.post("/", chatsController.create);
router.get("/:id", chatsController.get);
router.patch("/:id", chatsController.update);
router.delete("/:id", chatsController.remove);
router.get("/:id/messages", chatsController.listMessages);
router.post("/:id/messages", chatsController.sendMessage);

module.exports = router;
