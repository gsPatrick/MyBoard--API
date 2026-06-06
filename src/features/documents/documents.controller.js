const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const documentsService = require("./documents.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const items = await documentsService.listDocuments(ctx, { category: req.query.category });
  return sendSuccess(res, items);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const doc = await documentsService.createDocument(
    {
      file: req.file,
      title: req.body.title,
      category: req.body.category,
      purpose: req.body.purpose,
      language: req.body.language,
    },
    ctx
  );
  return sendCreated(res, doc);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await documentsService.deleteDocument(req.params.id, ctx);
  return sendSuccess(res, { deleted: true });
});

module.exports = { list, create, remove };
