const { Router } = require("express");
const authorize = require("../../middlewares/authorize");
const projectDetailsController = require("./project-details.controller");

const router = Router({ mergeParams: true });

router.get("/", projectDetailsController.list);
router.post("/", authorize("admin", "developer"), projectDetailsController.create);
router.get("/:detailId", projectDetailsController.getById);
router.patch("/:detailId", authorize("admin", "developer"), projectDetailsController.update);
router.put("/:detailId", authorize("admin", "developer"), projectDetailsController.update);
router.delete("/:detailId", authorize("admin"), projectDetailsController.remove);

module.exports = router;
