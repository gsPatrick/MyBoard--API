const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const tagsService = require("./tags.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const tags = await tagsService.listTags(req.query, ctx);
  return sendSuccess(res, tags);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const tag = await tagsService.createTag(req.body, ctx);
  return sendCreated(res, tag);
});

module.exports = { list, create };
