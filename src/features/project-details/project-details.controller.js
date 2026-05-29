const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const projectDetailsService = require("./project-details.service");

const list = catchAsync(async (req, res) => {
  if (req.query.grouped === "true") {
    const grouped = await projectDetailsService.getDetailsGroupedByCategory(
      req.params.projectId,
      req.query
    );
    return sendSuccess(res, grouped);
  }

  const details = await projectDetailsService.listDetails(req.params.projectId, req.query);
  return sendSuccess(res, details);
});

const getById = catchAsync(async (req, res) => {
  const detail = await projectDetailsService.getDetailById(
    req.params.projectId,
    req.params.detailId,
    { revealSecrets: req.query.revealSecrets === "true" }
  );
  return sendSuccess(res, detail);
});

const create = catchAsync(async (req, res) => {
  const detail = await projectDetailsService.createDetail(req.params.projectId, req.body);
  return sendCreated(res, detail);
});

const update = catchAsync(async (req, res) => {
  const detail = await projectDetailsService.updateDetail(
    req.params.projectId,
    req.params.detailId,
    req.body
  );
  return sendSuccess(res, detail);
});

const remove = catchAsync(async (req, res) => {
  await projectDetailsService.deleteDetail(req.params.projectId, req.params.detailId);
  return sendNoContent(res);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
