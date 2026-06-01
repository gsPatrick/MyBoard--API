const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const bordieService = require("./bordie.service");

const chat = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await bordieService.runChat({
    message: req.body.message,
    context: req.body.context || {},
    history: req.body.history || [],
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userRole: ctx.role,
  });
  return sendSuccess(res, result);
});

const command = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await bordieService.runCommand({
    prompt: req.body.prompt,
    context: req.body.context || {},
    history: req.body.history || [],
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userRole: ctx.role,
  });
  return sendSuccess(res, result);
});

const execute = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await bordieService.executeConfirmedAction({
    action: req.body.action,
    confirmed: Boolean(req.body.confirmed),
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userRole: ctx.role,
    ctx,
  });
  return sendSuccess(res, result);
});

const policy = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const settings = await bordieService.getPolicySettings({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  return sendSuccess(res, settings);
});

module.exports = { chat, command, execute, policy };
