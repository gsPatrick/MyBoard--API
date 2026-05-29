const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const agendaService = require("./agenda.service");

const list = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const events = await agendaService.listEvents(req.query, ctx);
  return sendSuccess(res, events);
});

const getById = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const event = await agendaService.getEventById(req.params.id, ctx);
  return sendSuccess(res, event);
});

const create = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const event = await agendaService.createEvent(req.body, ctx);
  return sendCreated(res, event);
});

const update = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const event = await agendaService.updateEvent(req.params.id, req.body, ctx);
  return sendSuccess(res, event);
});

const remove = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  await agendaService.deleteEvent(req.params.id, ctx);
  return sendNoContent(res);
});

module.exports = { list, getById, create, update, remove };
