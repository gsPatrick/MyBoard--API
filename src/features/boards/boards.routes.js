const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const boardsController = require("./boards.controller");

const router = Router();

router.use(...requireAuth);

router.get("/", boardsController.list);
router.get("/default", boardsController.defaultBoard);
router.post("/", authorize("admin", "developer"), boardsController.create);
router.get("/:id", boardsController.getById);
router.patch("/:id", authorize("admin", "developer"), boardsController.update);
router.put("/:id", authorize("admin", "developer"), boardsController.update);
router.delete("/:id", authorize("admin", "developer"), boardsController.remove);

module.exports = router;
