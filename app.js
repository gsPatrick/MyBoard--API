require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const apiRouter = require("./src/routes");
const errorHandler = require("./src/middlewares/error-handler");
const { sequelize } = require("./src/models");
const { initSocket } = require("./src/providers/realtime/socket.provider");
const { UPLOAD_ROOT } = require("./src/providers/storage/local-storage.provider");
const { APP_TIMEZONE } = require("./src/config/constants");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const API_PREFIX = process.env.APP_API_PREFIX || "/api";

process.env.TZ = APP_TIMEZONE;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(UPLOAD_ROOT));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timezone: APP_TIMEZONE,
    timestamp: new Date().toISOString(),
  });
});

app.use(API_PREFIX, apiRouter);

app.use((_req, _res, next) => {
  const AppError = require("./src/utils/app-error");
  next(new AppError("Rota não encontrada", 404, "NOT_FOUND"));
});

app.use(errorHandler);

async function start() {
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL conectado.");

    initSocket(server);
    console.log("Socket.io inicializado (notificações em tempo real).");

    server.listen(PORT, () => {
      console.log(`API: http://localhost:${PORT}${API_PREFIX}`);
      console.log(`Uploads: http://localhost:${PORT}/uploads`);
      console.log(`Timezone: ${APP_TIMEZONE}`);
    });
  } catch (error) {
    console.error("Falha ao iniciar a API:", error.message);
    process.exit(1);
  }
}

start();

module.exports = app;
