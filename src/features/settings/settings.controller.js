const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const settingsService = require("./settings.service");

const getSettings = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await settingsService.getWorkspaceSettings(ctx);
  return sendSuccess(res, data);
});

const updateAi = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await settingsService.updateAiSettings(req.body || {}, ctx);
  return sendSuccess(res, data);
});

const updatePrivacy = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await settingsService.updatePrivacySettings(req.body || {}, ctx);
  return sendSuccess(res, data);
});

const testAi = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const data = await settingsService.testAiConnection(ctx);
  return sendSuccess(res, data);
});

module.exports = {
  getSettings,
  updateAi,
  updatePrivacy,
  testAi,
};
