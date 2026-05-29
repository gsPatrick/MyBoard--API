const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const notificationsController = require("./notifications.controller");

const router = Router();

router.use(...requireAuth);

router.get("/unread-count", notificationsController.unreadCount);
router.patch("/read-all", notificationsController.markAllRead);
router.get("/", notificationsController.list);
router.patch("/:id/read", notificationsController.markRead);
router.patch("/:id/hide", notificationsController.hide);

module.exports = router;
