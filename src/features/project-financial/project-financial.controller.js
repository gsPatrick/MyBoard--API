const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const projectFinancialService = require("./project-financial.service");

const listForProject = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const entries = await projectFinancialService.listProjectEntries(req.params.projectId, ctx);
  return sendSuccess(res, entries);
});

const listForTenant = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const entries = await projectFinancialService.listEntriesForTenant(req.query, ctx);
  return sendSuccess(res, entries);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const entry = await projectFinancialService.getEntryById(
    req.params.projectId,
    req.params.entryId,
    ctx
  );
  return sendSuccess(res, entry);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const entry = await projectFinancialService.createEntry(
    req.params.projectId,
    req.body,
    ctx
  );
  return sendCreated(res, entry);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const entry = await projectFinancialService.updateEntry(
    req.params.projectId,
    req.params.entryId,
    req.body,
    ctx
  );
  return sendSuccess(res, entry);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await projectFinancialService.deleteEntry(
    req.params.projectId,
    req.params.entryId,
    ctx
  );
  return sendNoContent(res);
});

module.exports = {
  listForProject,
  listForTenant,
  getById,
  create,
  update,
  remove,
};
