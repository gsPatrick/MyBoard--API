function sendSuccess(res, data, statusCode = 200, meta = null) {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
}

function sendCreated(res, data) {
  return sendSuccess(res, data, 201);
}

function sendNoContent(res) {
  return res.status(204).send();
}

module.exports = {
  sendSuccess,
  sendCreated,
  sendNoContent,
};
