const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const activitiesController = require("./activities.controller");

const router = Router();

router.use(...requireAuth);
router.get("/", activitiesController.list);

module.exports = router;
