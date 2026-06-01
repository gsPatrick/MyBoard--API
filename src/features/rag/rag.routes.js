const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const ragController = require("./rag.controller");

const router = Router();

router.use(...requireAuth);

router.post("/search", ragController.search);
router.post("/ingest", authorize("admin", "developer"), ragController.ingest);

module.exports = router;
