const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess, sendCreated, sendNoContent } = require("../../utils/response");
const agendaService = require("./agenda.service");

const list = catchAsync(async (req, res) => {
  const events = await agendaService.listEvents(req.query);
  return sendSuccess(res, events);
});

const getById = catchAsync(async (req, res) => {
  const event = await agendaService.getEventById(req.params.id);
  return sendSuccess(res, event);
});

const create = catchAsync(async (req, res) => {
  const event = await agendaService.createEvent(req.body, req.headers["x-user-id"]);
  return sendCreated(res, event);
});

const update = catchAsync(async (req, res) => {
  const event = await agendaService.updateEvent(req.params.id, req.body);
  return sendSuccess(res, event);
});

const remove = catchAsync(async (req, res) => {
  await agendaService.deleteEvent(req.params.id);
  return sendNoContent(res);
});

module.exports = { list, getById, create, update, remove };
