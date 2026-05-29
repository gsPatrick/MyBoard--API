const { Router } = require("express");
const projectsController = require("./projects.controller");
const projectDetailsRoutes = require("../project-details/project-details.routes");

const router = Router();

router.get("/", projectsController.list);
router.post("/", projectsController.create);
router.get("/:id", projectsController.getById);
router.patch("/:id", projectsController.update);
router.put("/:id", projectsController.update);
router.delete("/:id", projectsController.remove);

router.use("/:projectId/details", projectDetailsRoutes);

module.exports = router;
