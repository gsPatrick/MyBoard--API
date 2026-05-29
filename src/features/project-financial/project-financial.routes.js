const { Router } = require("express");
const authorize = require("../../middlewares/authorize");
const projectFinancialController = require("./project-financial.controller");

const router = Router({ mergeParams: true });

router.get("/", projectFinancialController.listForProject);
router.post("/", authorize("admin", "developer"), projectFinancialController.create);
router.get("/:entryId", projectFinancialController.getById);
router.patch("/:entryId", authorize("admin", "developer"), projectFinancialController.update);
router.put("/:entryId", authorize("admin", "developer"), projectFinancialController.update);
router.delete("/:entryId", authorize("admin", "developer"), projectFinancialController.remove);

module.exports = router;
