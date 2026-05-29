const { Router } = require("express");
const uploadMiddleware = require("../../middlewares/upload");
const mediaController = require("./media.controller");

const router = Router();

router.post("/upload", uploadMiddleware.single("file"), mediaController.upload);
router.get("/entity/:entityType/:entityId", mediaController.list);
router.get("/:id/download", mediaController.download);
router.get("/:id", mediaController.getById);
router.delete("/:id", mediaController.remove);

module.exports = router;
