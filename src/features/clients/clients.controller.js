const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const clientsService = require("./clients.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const result = await clientsService.listClients(req.query, ctx);
  return sendSuccess(res, result.items, 200, result.meta);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const client = await clientsService.getClientById(req.params.id, ctx);
  return sendSuccess(res, client);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const client = await clientsService.createClient(req.body, ctx);
  return sendCreated(res, client);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const client = await clientsService.updateClient(req.params.id, req.body, ctx);
  return sendSuccess(res, client);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await clientsService.deleteClient(req.params.id, ctx);
  return sendNoContent(res);
});

module.exports = { list, getById, create, update, remove };
