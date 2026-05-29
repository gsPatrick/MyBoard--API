const { Router } = require("express");
const clientsController = require("./clients.controller");

const router = Router();

router.get("/", clientsController.list);
router.post("/", clientsController.create);
router.get("/:id", clientsController.getById);
router.patch("/:id", clientsController.update);
router.put("/:id", clientsController.update);
router.delete("/:id", clientsController.remove);

module.exports = router;
