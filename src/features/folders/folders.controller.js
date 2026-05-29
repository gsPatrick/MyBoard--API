const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const foldersService = require("./folders.service");

const list = catchAsync(async (req, res) => {
  const folders = await foldersService.listFolders(req.query);
  return sendSuccess(res, folders);
});

const tree = catchAsync(async (req, res) => {
  const treeData = await foldersService.getWorkspaceTree(req.query);
  return sendSuccess(res, treeData);
});

const contents = catchAsync(async (req, res) => {
  const data = await foldersService.getFolderContents(req.params.id, req.query);
  return sendSuccess(res, data);
});

const create = catchAsync(async (req, res) => {
  const folder = await foldersService.createFolder(req.body, req.body.notify_user_id || req.headers["x-user-id"]);
  return sendCreated(res, folder);
});

const update = catchAsync(async (req, res) => {
  const folder = await foldersService.updateFolder(req.params.id, req.body);
  return sendSuccess(res, folder);
});

const remove = catchAsync(async (req, res) => {
  await foldersService.deleteFolder(req.params.id);
  return sendNoContent(res);
});

const moveProject = catchAsync(async (req, res) => {
  const project = await foldersService.moveProjectToFolder(
    req.params.projectId,
    req.body.folder_id,
    req.headers["x-user-id"]
  );
  return sendSuccess(res, project);
});

module.exports = { list, tree, contents, create, update, remove, moveProject };
