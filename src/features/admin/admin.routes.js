const { Router } = require("express");
const authenticate = require("../../middlewares/authenticate");
const authorize = require("../../middlewares/authorize");
const adminController = require("./admin.controller");

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/tenants", adminController.listTenants);
router.get("/tenants/:id", adminController.getTenantStats);
router.patch("/tenants/:id", adminController.updateTenant);

module.exports = router;
