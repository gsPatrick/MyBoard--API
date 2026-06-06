const fs = require("fs/promises");
const path = require("path");
const boardsService = require("../boards/boards.service");
const boardTools = require("./board-tools.service");
const projectsService = require("../projects/projects.service");
const clientsService = require("../clients/clients.service");
const agendaService = require("../agenda/agenda.service");
const workspaceTools = require("./workspace");
const evolutionClient = require("../../providers/evolution/evolution.client");
const localStorage = require("../../providers/storage/local-storage.provider");
const { MediaFile, WhatsappInstance } = require("../../models");
const AppError = require("../../utils/app-error");

// Executores das ações de workspace (projeto/cliente/agenda) disparadas pelo Bordie.
// Cada handler chama o service de domínio com o ctx e devolve a entidade resultante
// (para o frontend renderizar o card de confirmação/sucesso).
const WORKSPACE_ACTIONS = {
  async project_create(payload, ctx) {
    const project = await projectsService.createProject(payload, ctx);
    return { entity: workspaceTools.toProjectEntity(project), message: `Projeto "${project.name}" criado.` };
  },
  async project_update(payload, ctx) {
    const project = await projectsService.updateProject(payload.id, payload.changes || {}, ctx);
    return { entity: workspaceTools.toProjectEntity(project), message: `Projeto "${project.name}" atualizado.` };
  },
  async project_delete(payload, ctx) {
    await projectsService.deleteProject(payload.id, ctx);
    return { entity: null, message: `Projeto "${payload.name || ""}" excluído.` };
  },
  async client_create(payload, ctx) {
    const client = await clientsService.createClient(payload, ctx);
    return { entity: workspaceTools.toClientEntity(client), message: `Cliente "${client.name}" cadastrado.` };
  },
  async client_update(payload, ctx) {
    const client = await clientsService.updateClient(payload.id, payload.changes || {}, ctx);
    return { entity: workspaceTools.toClientEntity(client), message: `Cliente "${client.name}" atualizado.` };
  },
  async client_delete(payload, ctx) {
    await clientsService.deleteClient(payload.id, ctx);
    return { entity: null, message: `Cliente "${payload.name || ""}" excluído.` };
  },
  async agenda_create(payload, ctx) {
    const event = await agendaService.createEvent(payload, ctx);
    return { entity: workspaceTools.toAgendaEntity(event), message: `Evento "${event.title}" agendado.` };
  },
  async agenda_update(payload, ctx) {
    const event = await agendaService.updateEvent(payload.id, payload.changes || {}, ctx);
    return { entity: workspaceTools.toAgendaEntity(event), message: `Evento "${event.title}" atualizado.` };
  },
  async agenda_delete(payload, ctx) {
    await agendaService.deleteEvent(payload.id, ctx);
    return { entity: null, message: `Evento "${payload.title || ""}" excluído.` };
  },
};

async function executeBoardAction(action, ctx) {
  const boardId = action.payload?.board_id;
  if (!boardId) {
    throw new AppError("board_id é obrigatório", 400, "VALIDATION_ERROR");
  }

  const board = await boardsService.getBoardById(boardId, ctx);
  const mutation = action.payload?.mutation;
  if (!mutation) {
    throw new AppError("mutation é obrigatória", 400, "VALIDATION_ERROR");
  }

  const result = boardTools.applySceneMutation(board.scene_data, mutation);
  const updated = await boardsService.updateBoard(boardId, { scene_data: result.scene_data }, ctx);

  return {
    type: action.type,
    board_id: boardId,
    summary: result.summary,
    board: updated,
  };
}

async function executeWhatsAppMediaAction(action, ctx) {
  const payload = action.payload || {};
  const instanceName = payload.instance_name;
  const remoteJid = payload.remote_jid;
  const mediaFileId = payload.media_file_id;

  if (!instanceName || !remoteJid || !mediaFileId) {
    throw new AppError("Payload incompleto para envio WhatsApp", 400, "VALIDATION_ERROR");
  }

  const instance = await WhatsappInstance.findOne({
    where: { tenant_id: ctx.tenantId, instance_name: instanceName, is_active: true },
  });
  if (!instance) {
    throw new AppError("Instância WhatsApp não encontrada", 404, "WHATSAPP_INSTANCE_NOT_FOUND");
  }

  const media = await MediaFile.findByPk(mediaFileId);
  if (!media) {
    throw new AppError("Arquivo não encontrado", 404, "MEDIA_NOT_FOUND");
  }

  const absolutePath = localStorage.resolveAbsolutePath(media.storage_path);
  const buffer = await fs.readFile(absolutePath);
  const base64 = buffer.toString("base64");

  const mediatype = media.mime_type?.startsWith("image/")
    ? "image"
    : media.mime_type?.startsWith("video/")
      ? "video"
      : media.mime_type?.startsWith("audio/")
        ? "audio"
        : "document";

  const response = await evolutionClient.sendMedia(
    instanceName,
    {
      number: remoteJid.replace(/@.+$/, ""),
      mediatype,
      mimetype: media.mime_type,
      caption: payload.caption || media.original_name,
      fileName: media.original_name,
      media: base64,
    },
    instance.evolution_base_url
  );

  return {
    type: action.type,
    remote_jid: remoteJid,
    media_file_id: mediaFileId,
    evolution_response: response,
  };
}

async function executeAction(action, ctx) {
  if (!action?.type) {
    throw new AppError("Ação inválida", 400, "VALIDATION_ERROR");
  }

  if (action.type.startsWith("board_")) {
    return executeBoardAction(action, ctx);
  }

  if (action.type === "send_whatsapp_media") {
    return executeWhatsAppMediaAction(action, ctx);
  }

  const workspaceHandler = WORKSPACE_ACTIONS[action.type];
  if (workspaceHandler) {
    const result = await workspaceHandler(action.payload || {}, ctx);
    return { type: action.type, ...result };
  }

  throw new AppError(`Tipo de ação não suportado: ${action.type}`, 400, "UNSUPPORTED_ACTION");
}

module.exports = {
  executeAction,
  executeBoardAction,
  executeWhatsAppMediaAction,
};
