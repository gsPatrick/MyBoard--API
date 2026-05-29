const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const clientsService = require("./clients.service");

const list = catchAsync(async (req, res) => {
  const result = await clientsService.listClients(req.query);
  return sendSuccess(res, result.items, 200, result.meta);
});

const getById = catchAsync(async (req, res) => {
  const client = await clientsService.getClientById(req.params.id);
  return sendSuccess(res, client);
});

const create = catchAsync(async (req, res) => {
  const client = await clientsService.createClient(req.body, req.headers["x-user-id"]);
  return sendCreated(res, client);
});

const update = catchAsync(async (req, res) => {
  const client = await clientsService.updateClient(req.params.id, req.body);
  return sendSuccess(res, client);
});

const remove = catchAsync(async (req, res) => {
  await clientsService.deleteClient(req.params.id);
  return sendNoContent(res);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
