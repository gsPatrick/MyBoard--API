const fs = require("fs/promises");
const path = require("path");
const boardsService = require("../boards/boards.service");
const boardTools = require("./board-tools.service");
const evolutionClient = require("../../providers/evolution/evolution.client");
const localStorage = require("../../providers/storage/local-storage.provider");
const { MediaFile, WhatsappInstance } = require("../../models");
const AppError = require("../../utils/app-error");

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

  throw new AppError(`Tipo de ação não suportado: ${action.type}`, 400, "UNSUPPORTED_ACTION");
}

module.exports = {
  executeAction,
  executeBoardAction,
  executeWhatsAppMediaAction,
};
