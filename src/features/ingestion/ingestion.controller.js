const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const ingestionService = require("./ingestion.service");

const analyze = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await ingestionService.analyze({
    files: req.files || [],
    tenantId: ctx.tenantId,
  });
  return sendSuccess(res, result);
});

const apply = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);

  let proposal = {};
  try {
    proposal = JSON.parse(req.body.proposal || "{}");
  } catch {
    proposal = {};
  }

  const target = {};
  if (req.body.target_project_id) target.project_id = req.body.target_project_id;
  if (req.body.target_client_id) target.client_id = req.body.target_client_id;

  const result = await ingestionService.apply({
    proposal,
    target,
    files: req.files || [],
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    role: ctx.role,
  });

  return sendSuccess(res, result);
});

module.exports = { analyze, apply };
