let io = null;

function initSocket(server) {
  const { Server } = require("socket.io");

  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    path: process.env.SOCKET_PATH || "/socket.io",
  });

  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;

    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.join("broadcast");

    socket.on("subscribe", (payload = {}) => {
      if (payload.userId) socket.join(`user:${payload.userId}`);
      if (payload.projectId) socket.join(`project:${payload.projectId}`);
      if (payload.clientId) socket.join(`client:${payload.clientId}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, data) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, data);
}

function emitToProject(projectId, event, data) {
  if (!io || !projectId) return;
  io.to(`project:${projectId}`).emit(event, data);
}

function emitBroadcast(event, data) {
  if (!io) return;
  io.emit(event, data);
}

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToProject,
  emitBroadcast,
};
