const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const projectDemandsService = require("./project-demands.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const demands = await projectDemandsService.listDemands(req.params.projectId, req.query, ctx);
  return sendSuccess(res, demands);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const demand = await projectDemandsService.getDemandById(
    req.params.projectId,
    req.params.demandId,
    ctx
  );
  return sendSuccess(res, demand);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const demand = await projectDemandsService.createDemand(req.params.projectId, req.body, ctx);
  return sendCreated(res, demand);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const demand = await projectDemandsService.updateDemand(
    req.params.projectId,
    req.params.demandId,
    req.body,
    ctx
  );
  return sendSuccess(res, demand);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await projectDemandsService.deleteDemand(req.params.projectId, req.params.demandId, ctx);
  return sendNoContent(res);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
