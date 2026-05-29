const { Router } = require("express");
const uploadMiddleware = require("../../middlewares/upload");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const mediaController = require("./media.controller");

const router = Router();

router.use(...requireAuth);

router.post("/upload", authorize("admin", "developer"), uploadMiddleware.single("file"), mediaController.upload);
router.get("/entity/:entityType/:entityId", mediaController.list);
router.get("/:id/download", mediaController.download);
router.get("/:id", mediaController.getById);
router.delete("/:id", authorize("admin", "developer"), mediaController.remove);

module.exports = router;
