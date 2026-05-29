const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const projectDetailsService = require("./project-details.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);

  if (req.query.grouped === "true") {
    const grouped = await projectDetailsService.getDetailsGroupedByCategory(
      req.params.projectId,
      req.query,
      ctx
    );
    return sendSuccess(res, grouped);
  }

  const details = await projectDetailsService.listDetails(req.params.projectId, req.query, ctx);
  return sendSuccess(res, details);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const detail = await projectDetailsService.getDetailById(
    req.params.projectId,
    req.params.detailId,
    { revealSecrets: req.query.revealSecrets === "true" },
    ctx
  );
  return sendSuccess(res, detail);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const detail = await projectDetailsService.createDetail(req.params.projectId, req.body, ctx);
  return sendCreated(res, detail);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const detail = await projectDetailsService.updateDetail(
    req.params.projectId,
    req.params.detailId,
    req.body,
    ctx
  );
  return sendSuccess(res, detail);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await projectDetailsService.deleteDetail(req.params.projectId, req.params.detailId, ctx);
  return sendNoContent(res);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
