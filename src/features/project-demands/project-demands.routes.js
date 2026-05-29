const { Router } = require("express");
const authorize = require("../../middlewares/authorize");
const projectDemandsController = require("./project-demands.controller");

const router = Router({ mergeParams: true });

router.get("/", projectDemandsController.list);
router.post("/", authorize("admin", "developer"), projectDemandsController.create);
router.get("/:demandId", projectDemandsController.getById);
router.patch("/:demandId", authorize("admin", "developer"), projectDemandsController.update);
router.put("/:demandId", authorize("admin", "developer"), projectDemandsController.update);
router.delete("/:demandId", authorize("admin", "developer"), projectDemandsController.remove);

module.exports = router;
