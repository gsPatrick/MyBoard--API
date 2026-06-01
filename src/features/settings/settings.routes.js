const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const settingsController = require("./settings.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", settingsController.getSettings);
router.patch("/ai", authorize("admin", "developer"), settingsController.updateAi);
router.post("/ai/test", authorize("admin", "developer"), settingsController.testAi);
router.patch("/privacy", authorize("admin", "developer"), settingsController.updatePrivacy);

module.exports = router;
