const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const bordieController = require("./bordie.controller");

const router = Router();

router.use(...requireAuth);

router.post("/chat", bordieController.chat);
router.post("/command", bordieController.command);
router.post("/execute", bordieController.execute);
router.get("/policy", bordieController.policy);

module.exports = router;
