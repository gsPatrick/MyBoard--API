const { Router } = require("express");
const authRoutes = require("../features/auth/auth.routes");
const adminRoutes = require("../features/admin/admin.routes");
const clientsRoutes = require("../features/clients/clients.routes");
const projectsRoutes = require("../features/projects/projects.routes");
const foldersRoutes = require("../features/folders/folders.routes");
const tagsRoutes = require("../features/tags/tags.routes");
const mediaRoutes = require("../features/media/media.routes");
const agendaRoutes = require("../features/agenda/agenda.routes");
const notificationsRoutes = require("../features/notifications/notifications.routes");
const activitiesRoutes = require("../features/activities/activities.routes");
const usersRoutes = require("../features/users/users.routes");
const { APP_TIMEZONE } = require("../config/constants");

const router = Router();

router.get("/ping", (_req, res) => {
  res.json({
    success: true,
    data: {
      message: "pong",
      version: "v1",
      saas: true,
      timezone: APP_TIMEZONE,
      timestamp: new Date().toISOString(),
    },
  });
});

router.use("/v1/auth", authRoutes);
router.use("/v1/admin", adminRoutes);
router.use("/v1/clients", clientsRoutes);
router.use("/v1/projects", projectsRoutes);
router.use("/v1/folders", foldersRoutes);
router.use("/v1/tags", tagsRoutes);
router.use("/v1/media", mediaRoutes);
router.use("/v1/agenda", agendaRoutes);
router.use("/v1/notifications", notificationsRoutes);
router.use("/v1/activities", activitiesRoutes);
router.use("/v1/users", usersRoutes);

module.exports = router;
