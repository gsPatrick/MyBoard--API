const { Router } = require("express");
const uploadMiddleware = require("../../middlewares/upload");
const { requireAuth } = require("../../middlewares/require-auth");
const documentsController = require("./documents.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", documentsController.list);
router.post("/", uploadMiddleware.single("file"), documentsController.create);
router.delete("/:id", documentsController.remove);

module.exports = router;
