const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const projectFinancialController = require("../project-financial/project-financial.controller");

const router = Router();

router.use(...requireAuth);
router.get("/entries", projectFinancialController.listForTenant);

module.exports = router;
