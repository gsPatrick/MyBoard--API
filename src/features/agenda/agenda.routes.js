const { Router } = require("express");
const agendaController = require("./agenda.controller");

const router = Router();

router.get("/", agendaController.list);
router.post("/", agendaController.create);
router.get("/:id", agendaController.getById);
router.patch("/:id", agendaController.update);
router.put("/:id", agendaController.update);
router.delete("/:id", agendaController.remove);

module.exports = router;
