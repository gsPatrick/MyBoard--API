const { Router } = require("express");
const { requireAuth } = require("../../middlewares/require-auth");
const authorize = require("../../middlewares/authorize");
const projectsController = require("./projects.controller");
const projectDetailsRoutes = require("../project-details/project-details.routes");
const projectDemandsRoutes = require("../project-demands/project-demands.routes");

const router = Router();

router.use(...requireAuth);

router.get("/", projectsController.list);
router.post("/", authorize("admin", "developer"), projectsController.create);
router.get("/:id", projectsController.getById);
router.patch("/:id", authorize("admin", "developer"), projectsController.update);
router.put("/:id", authorize("admin", "developer"), projectsController.update);
router.delete("/:id", authorize("admin"), projectsController.remove);

router.use("/:projectId/details", projectDetailsRoutes);
router.use("/:projectId/demands", projectDemandsRoutes);

module.exports = router;
