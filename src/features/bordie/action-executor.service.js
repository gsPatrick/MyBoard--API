const fs = require("fs/promises");
const path = require("path");
const boardsService = require("../boards/boards.service");
const boardTools = require("./board-tools.service");
const projectsService = require("../projects/projects.service");
const clientsService = require("../clients/clients.service");
const agendaService = require("../agenda/agenda.service");
const financialService = require("../project-financial/project-financial.service");
const demandsService = require("../project-demands/project-demands.service");
const foldersService = require("../folders/folders.service");
const tagsService = require("../tags/tags.service");
const workspaceTools = require("./workspace");

// Encontra uma tag pelo nome (case-insensitive) ou cria uma nova.
async function findOrCreateTag(tagName, scope, ctx) {
  const tags = await tagsService.listTags({}, ctx);
  const found = tags.find((t) => t.name?.toLowerCase() === String(tagName).toLowerCase());
  if (found) return found;
  return tagsService.createTag({ name: tagName, scope: scope || "both" }, ctx);
}
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

  // ---- Financeiro ----
  async finance_create(payload, ctx) {
    const { project_id, ...entry } = payload;
    const created = await financialService.createEntry(project_id, entry, ctx);
    return {
      entity: workspaceTools.toFinanceEntity(created),
      message: `Lançamento de R$ ${Number(created.amount).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      })} registrado.`,
    };
  },
  async finance_delete(payload, ctx) {
    await financialService.deleteEntry(payload.project_id, payload.entry_id, ctx);
    return { entity: null, message: "Lançamento financeiro excluído." };
  },

  // ---- Demandas / tarefas ----
  async demand_create(payload, ctx) {
    const { project_id, ...demand } = payload;
    const created = await demandsService.createDemand(project_id, demand, ctx);
    return { entity: workspaceTools.toDemandEntity(created), message: `Tarefa "${created.title}" criada.` };
  },
  async demand_update(payload, ctx) {
    const updated = await demandsService.updateDemand(
      payload.project_id,
      payload.demand_id,
      payload.changes || {},
      ctx
    );
    return { entity: workspaceTools.toDemandEntity(updated), message: `Tarefa "${updated.title}" atualizada.` };
  },
  async demand_delete(payload, ctx) {
    await demandsService.deleteDemand(payload.project_id, payload.demand_id, ctx);
    return { entity: null, message: `Tarefa "${payload.title || ""}" excluída.` };
  },

  // ---- Pastas ----
  async folder_create(payload, ctx) {
    const folder = await foldersService.createFolder(payload, ctx);
    return { entity: workspaceTools.toFolderEntity(folder), message: `Pasta "${folder.name}" criada.` };
  },
  async project_move_folder(payload, ctx) {
    const project = await foldersService.moveProjectToFolder(payload.project_id, payload.folder_id, ctx);
    return { entity: workspaceTools.toProjectEntity(project), message: "Projeto movido." };
  },

  // ---- Tags ----
  async project_tag(payload, ctx) {
    const tag = await findOrCreateTag(payload.tag_name, "project", ctx);
    const project = await projectsService.getProjectById(payload.project_id, { includeDetails: false }, ctx);
    const current = (project.tags || []).map((t) => t.id);
    const tagIds = Array.from(new Set([...current, tag.id]));
    await tagsService.syncProjectTags(payload.project_id, tagIds, ctx);
    const reloaded = await projectsService.getProjectById(payload.project_id, { includeDetails: false }, ctx);
    return {
      entity: workspaceTools.toProjectEntity(reloaded),
      message: `Projeto marcado como "${tag.name}".`,
    };
  },
  async client_tag(payload, ctx) {
    const tag = await findOrCreateTag(payload.tag_name, "client", ctx);
    const client = await clientsService.getClientById(payload.client_id, ctx);
    const current = (client.tags || []).map((t) => t.id);
    const tagIds = Array.from(new Set([...current, tag.id]));
    await tagsService.syncClientTags(payload.client_id, tagIds, ctx);
    const reloaded = await clientsService.getClientById(payload.client_id, ctx);
    return {
      entity: workspaceTools.toClientEntity(reloaded),
      message: `Cliente marcado como "${tag.name}".`,
    };
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
