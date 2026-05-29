const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const tagsController = require("./tags.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", tagsController.list);
router.post("/", authorize("admin", "developer"), tagsController.create);

module.exports = router;
