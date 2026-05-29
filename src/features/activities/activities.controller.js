const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const activitiesQueryService = require("./activities-query.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const items = await activitiesQueryService.listForUser(req.user.id, req.query, ctx);
  return sendSuccess(res, items);
});

module.exports = { list };
