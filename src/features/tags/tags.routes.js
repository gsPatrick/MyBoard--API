const { Router } = require("express");
const tagsController = require("./tags.controller");

const router = Router();

router.get("/", tagsController.list);
router.post("/", tagsController.create);

module.exports = router;
