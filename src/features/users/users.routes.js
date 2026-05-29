const { Router } = require("express");
const usersController = require("./users.controller");

const router = Router();

router.get("/", usersController.list);
router.post("/", usersController.create);
router.get("/:id", usersController.getById);

module.exports = router;
