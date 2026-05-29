const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const usersService = require("./users.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const users = await usersService.listUsers(req.query, ctx);
  return sendSuccess(res, users);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const user = await usersService.createUser(req.body, ctx);
  return sendCreated(res, user);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const user = await usersService.getUserById(req.params.id, ctx);
  return sendSuccess(res, user);
});

module.exports = { list, create, getById };
