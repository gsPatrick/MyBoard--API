const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const foldersController = require("./folders.controller");

const router = Router();

router.use(...requireAuth);

router.get("/tree", foldersController.tree);
router.get("/", foldersController.list);
router.post("/workspace/reorder", authorize("admin", "developer"), foldersController.reorderWorkspace);
router.post("/", authorize("admin", "developer"), foldersController.create);
router.get("/:id/contents", foldersController.contents);
router.patch("/:id", authorize("admin", "developer"), foldersController.update);
router.put("/:id", authorize("admin", "developer"), foldersController.update);
router.delete("/:id", authorize("admin"), foldersController.remove);
router.post("/move-project/:projectId", authorize("admin", "developer"), foldersController.moveProject);

module.exports = router;
