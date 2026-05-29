const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated } = require("../../utils/response");
const usersService = require("./users.service");

const list = catchAsync(async (req, res) => {
  const users = await usersService.listUsers(req.query);
  return sendSuccess(res, users);
});

const create = catchAsync(async (req, res) => {
  const user = await usersService.createUser(req.body);
  return sendCreated(res, user);
});

const getById = catchAsync(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  return sendSuccess(res, user);
});

module.exports = { list, create, getById };
