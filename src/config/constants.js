module.exports = {
  APP_TIMEZONE: process.env.APP_TIMEZONE || "America/Sao_Paulo",

  CLIENT_STATUSES: ["active", "inactive"],
  IMPORTANCE_LEVELS: ["normal", "important", "high", "critical", "vip"],
  TAG_SCOPES: ["client", "project", "both"],

  PROJECT_STATUSES: ["draft", "in_progress", "completed", "cancelled", "paused"],
  PROJECT_STATUS_LABELS: {
    draft: "Rascunho",
    in_progress: "Em andamento",
    completed: "Concluído",
    cancelled: "Cancelado",
    paused: "Pausado",
  },
  PROJECT_PRIORITIES: ["low", "medium", "high", "critical"],

  DETAIL_CATEGORIES: [
    "github",
    "credentials",
    "scope",
    "deployment",
    "environment",
    "documentation",
    "links",
    "notes",
    "custom",
  ],
  DETAIL_VALUE_TYPES: ["text", "json", "url", "markdown", "secret"],

  MEDIA_ENTITY_TYPES: ["client", "project", "user", "project_detail", "agenda_event", "folder"],
  MEDIA_KINDS: ["avatar", "cover", "attachment", "thumbnail"],
  STORAGE_DISKS: ["local", "s3"],

  USER_ROLES: ["admin", "developer", "viewer"],

  AGENDA_STATUSES: ["scheduled", "completed", "cancelled"],

  NOTIFICATION_EVENTS: {
    CLIENT_CREATED: "client.created",
    CLIENT_UPDATED: "client.updated",
    PROJECT_CREATED: "project.created",
    PROJECT_MOVED: "project.moved",
    PROJECT_UPDATED: "project.updated",
    FOLDER_CREATED: "folder.created",
    MEDIA_UPLOADED: "media.uploaded",
    AGENDA_CREATED: "agenda.created",
    AGENDA_REMINDER: "agenda.reminder",
  },

  ALLOWED_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/markdown",
    "application/zip",
  ],
};
