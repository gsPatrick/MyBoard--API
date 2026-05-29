const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated } = require("../../utils/response");
const authService = require("./auth.service");

const register = catchAsync(async (req, res) => {
  const result = await authService.register(req.body);
  return sendCreated(res, result);
});

const login = catchAsync(async (req, res) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, result);
});

const me = catchAsync(async (req, res) => {
  const result = await authService.me(req.user.id);
  return sendSuccess(res, result);
});

const forgotPassword = catchAsync(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return sendSuccess(res, result);
});

const resetPassword = catchAsync(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  return sendSuccess(res, result);
});

const changePassword = catchAsync(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body);
  return sendSuccess(res, result);
});

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
};
