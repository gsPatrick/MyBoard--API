const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const ragService = require("./rag.service");
const retrievalService = require("../../rag/retrieval.service");

const search = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await ragService.search(req.body.query, req.body.scope || {}, ctx);
  return sendSuccess(res, {
    ...result,
    context_pack: retrievalService.buildContextPack(result),
  });
});

const ingest = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await ragService.ingestWorkspaceDocument(req.body, ctx);
  return sendCreated(res, result);
});

module.exports = { search, ingest };
