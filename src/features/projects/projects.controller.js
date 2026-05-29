const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const projectsService = require("./projects.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await projectsService.listProjects(req.query, ctx);
  return sendSuccess(res, result.items, 200, result.meta);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const includeDetails = req.query.includeDetails !== "false";
  const project = await projectsService.getProjectById(req.params.id, { includeDetails }, ctx);
  return sendSuccess(res, project);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const project = await projectsService.createProject(req.body, ctx);
  return sendCreated(res, project);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const project = await projectsService.updateProject(req.params.id, req.body, ctx);
  return sendSuccess(res, project);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await projectsService.deleteProject(req.params.id, ctx);
  return sendNoContent(res);
});

module.exports = { list, getById, create, update, remove };
