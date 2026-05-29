const { Router } = require("express");
const foldersController = require("./folders.controller");

const router = Router();

router.get("/tree", foldersController.tree);
router.get("/", foldersController.list);
router.post("/", foldersController.create);
router.get("/:id/contents", foldersController.contents);
router.patch("/:id", foldersController.update);
router.put("/:id", foldersController.update);
router.delete("/:id", foldersController.remove);
router.post("/move-project/:projectId", foldersController.moveProject);

module.exports = router;
