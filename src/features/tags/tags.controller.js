const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const tagsService = require("./tags.service");

const list = catchAsync(async (req, res) => {
  const tags = await tagsService.listTags(req.query);
  return sendSuccess(res, tags);
});

const create = catchAsync(async (req, res) => {
  const tag = await tagsService.createTag(req.body);
  return sendCreated(res, tag);
});

module.exports = { list, create };
