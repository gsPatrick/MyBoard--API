const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const boardsService = require("./boards.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const boards = await boardsService.listBoards(req.query, ctx);
  return sendSuccess(res, boards);
});

const defaultBoard = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const board = await boardsService.getOrCreateDefaultBoard(ctx);
  return sendSuccess(res, board);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const board = await boardsService.getBoardById(req.params.id, ctx);
  return sendSuccess(res, board);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const board = await boardsService.createBoard(req.body, ctx);
  return sendCreated(res, board);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const board = await boardsService.updateBoard(req.params.id, req.body, ctx);
  return sendSuccess(res, board);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await boardsService.deleteBoard(req.params.id, ctx);
  return sendNoContent(res);
});

module.exports = { list, defaultBoard, getById, create, update, remove };
