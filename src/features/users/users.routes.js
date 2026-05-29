const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const usersController = require("./users.controller");

const router = Router();

router.use(...requireAuth, authorize("admin"));

router.get("/", usersController.list);
router.post("/", usersController.create);
router.get("/:id", usersController.getById);

module.exports = router;
