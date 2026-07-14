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
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

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

async function resetUserByEmail(email) {
  const { User } = sequelize.models;
  const user = await User.findOne({ where: { email } });
  if (!user) {
    console.log(`[reset-script] Usuário ${email} não encontrado.`);
    return;
  }
  const tenantId = user.tenant_id;
  const userId = user.id;
  console.log(`[reset-script] Encontrado usuário ${email} (ID: ${userId}) no Tenant: ${tenantId}. Iniciando reset...`);

  // Deleta registros vinculados por user_id
  const userModels = ['UserSession', 'UserActivity', 'UserPasskey', 'Notification', 'PasswordResetToken'];
  for (const mName of userModels) {
    if (sequelize.models[mName]) {
      const count = await sequelize.models[mName].destroy({ where: { user_id: userId } });
      console.log(`[reset-script] Deletados ${count} registros de ${mName}.`);
    }
  }

  if (tenantId) {
    const clients = await sequelize.models.Client.findAll({ where: { tenant_id: tenantId } });
    const clientIds = clients.map(c => c.id);
    const projects = await sequelize.models.Project.findAll({ where: { tenant_id: tenantId } });
    const projectIds = projects.map(p => p.id);

    console.log(`[reset-script] O tenant possui ${clientIds.length} clientes e ${projectIds.length} projetos.`);

    if (projectIds.length) {
      if (sequelize.models.ProjectWhatsappLink) {
        await sequelize.models.ProjectWhatsappLink.destroy({ where: { project_id: projectIds } });
      }
      if (sequelize.models.ProjectFinancialEntry) {
        await sequelize.models.ProjectFinancialEntry.destroy({ where: { project_id: projectIds } });
      }
      if (sequelize.models.ProjectDemand) {
        await sequelize.models.ProjectDemand.destroy({ where: { project_id: projectIds } });
      }
      if (sequelize.models.ProjectDetail) {
        await sequelize.models.ProjectDetail.destroy({ where: { project_id: projectIds } });
      }
      if (sequelize.models.ProjectTag) {
        await sequelize.models.ProjectTag.destroy({ where: { project_id: projectIds } });
      }
    }

    if (clientIds.length) {
      if (sequelize.models.ClientWhatsappLink) {
        await sequelize.models.ClientWhatsappLink.destroy({ where: { client_id: clientIds } });
      }
      if (sequelize.models.ClientTag) {
        await sequelize.models.ClientTag.destroy({ where: { client_id: clientIds } });
      }
    }

    const tenantModels = [
      'AgendaEvent',
      'Board',
      'WorkspaceFolder',
      'AssistantChatMessage',
      'AssistantChat',
      'RagChunk',
      'RagFact',
      'RagMessageAsset',
      'RagMessage',
      'RagConversation',
      'RagSummary',
      'WhatsappInstance',
      'MediaFile',
      'Tag',
      'Project',
      'Client'
    ];

    for (const mName of tenantModels) {
      if (sequelize.models[mName]) {
        const count = await sequelize.models[mName].destroy({ where: { tenant_id: tenantId } });
        console.log(`[reset-script] Deletados ${count} registros de ${mName}.`);
      }
    }
  }

  await user.update({
    avatar_media_id: null,
    onboarding: {
      status: "pending",
      step: 0,
      version: 1,
      completed_at: null
    }
  });

  console.log(`[reset-script] Usuário ${email} resetado com sucesso!`);
}

async function start() {
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL conectado.");

    // Executa o script de reset de conta solicitado
    try {
      await resetUserByEmail("patricksiqueira.developer@gmail.com");
    } catch (err) {
      console.error("[reset-script] Falha ao resetar conta:", err.message);
    }

    initSocket(server);
    console.log("Socket.io inicializado (notificações em tempo real).");

    const whatsappService = require("./src/features/whatsapp/whatsapp.service");
    whatsappService
      .syncWhatsappInstancesOnStartup()
      .then(({ synced, total } = {}) => {
        if (total > 0) {
          console.log(`WhatsApp: ${synced}/${total} instância(s) sincronizada(s) com a Evolution.`);
        }
      })
      .catch((error) => {
        console.warn("WhatsApp: falha ao sincronizar instâncias na inicialização:", error.message);
      });

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
