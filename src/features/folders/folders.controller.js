const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const foldersService = require("./folders.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const folders = await foldersService.listFolders(req.query, ctx);
  return sendSuccess(res, folders);
});

const tree = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const treeData = await foldersService.getWorkspaceTree(req.query, ctx);
  return sendSuccess(res, treeData);
});

const contents = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await foldersService.getFolderContents(req.params.id, req.query, ctx);
  return sendSuccess(res, data);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const folder = await foldersService.createFolder(req.body, ctx);
  return sendCreated(res, folder);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const folder = await foldersService.updateFolder(req.params.id, req.body, ctx);
  return sendSuccess(res, folder);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await foldersService.deleteFolder(req.params.id, ctx);
  return sendNoContent(res);
});

const moveProject = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const project = await foldersService.moveProjectToFolder(
    req.params.projectId,
    req.body.folder_id,
    ctx
  );
  return sendSuccess(res, project);
});

module.exports = { list, tree, contents, create, update, remove, moveProject };
