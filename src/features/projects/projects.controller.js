const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const projectsService = require("./projects.service");

const list = catchAsync(async (req, res) => {
  const result = await projectsService.listProjects(req.query);
  return sendSuccess(res, result.items, 200, result.meta);
});

const getById = catchAsync(async (req, res) => {
  const includeDetails = req.query.includeDetails !== "false";
  const project = await projectsService.getProjectById(req.params.id, { includeDetails });
  return sendSuccess(res, project);
});

const create = catchAsync(async (req, res) => {
  const project = await projectsService.createProject(req.body, req.headers["x-user-id"]);
  return sendCreated(res, project);
});

const update = catchAsync(async (req, res) => {
  const project = await projectsService.updateProject(req.params.id, req.body, req.headers["x-user-id"]);
  return sendSuccess(res, project);
});

const remove = catchAsync(async (req, res) => {
  await projectsService.deleteProject(req.params.id);
  return sendNoContent(res);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
