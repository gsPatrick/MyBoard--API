const { Router } = require("express");
const projectDetailsController = require("./project-details.controller");

const router = Router({ mergeParams: true });

router.get("/", projectDetailsController.list);
router.post("/", projectDetailsController.create);
router.get("/:detailId", projectDetailsController.getById);
router.patch("/:detailId", projectDetailsController.update);
router.put("/:detailId", projectDetailsController.update);
router.delete("/:detailId", projectDetailsController.remove);

module.exports = router;
