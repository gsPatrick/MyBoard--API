const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const clientsController = require("./clients.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", clientsController.list);
router.get("/:id", clientsController.getById);
router.post("/", authorize("admin", "developer"), clientsController.create);
router.patch("/:id", authorize("admin", "developer"), clientsController.update);
router.put("/:id", authorize("admin", "developer"), clientsController.update);
router.delete("/:id", authorize("admin"), clientsController.remove);

module.exports = router;
