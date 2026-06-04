const { Router } = require("express");
const uploadMiddleware = require("../../middlewares/upload");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const ingestionController = require("./ingestion.controller");

const router = Router();

router.use(...requireAuth);

router.post(
  "/analyze",
  authorize("admin", "developer"),
  uploadMiddleware.array("files", 10),
  ingestionController.analyze
);

router.post(
  "/apply",
  authorize("admin", "developer"),
  uploadMiddleware.array("files", 10),
  ingestionController.apply
);

module.exports = router;
