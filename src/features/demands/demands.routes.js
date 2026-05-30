const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const projectDemandsController = require("../project-demands/project-demands.controller");

const router = Router();

router.use(...requireAuth);
router.get("/", projectDemandsController.listForTenant);

module.exports = router;
