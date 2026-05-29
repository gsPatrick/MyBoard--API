const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const agendaController = require("./agenda.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", agendaController.list);
router.post("/", authorize("admin", "developer"), agendaController.create);
router.get("/:id", agendaController.getById);
router.patch("/:id", authorize("admin", "developer"), agendaController.update);
router.put("/:id", authorize("admin", "developer"), agendaController.update);
router.delete("/:id", authorize("admin"), agendaController.remove);

module.exports = router;
