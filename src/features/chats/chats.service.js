const { Op } = require("sequelize");
const {
  sequelize,
  AssistantChat,
  AssistantChatMessage,
  Project,
  Client,
  ProjectDetail,
} = require("../../models");
const AppError = require("../../utils/app-error");
const aiRuntime = require("../settings/ai-runtime.service");
const ingestionService = require("../ingestion/ingestion.service");
const retrievalService = require("../../rag/retrieval.service");
const { estimateTokens } = require("../../rag/token-estimate");

const HISTORY_LIMIT = 24;
const DEFAULT_SYSTEM = `Você é o Bordie, assistente de desenvolvimento do MyBoard. Ajude o usuário a planejar e desenvolver o projeto: arquitetura, código, decisões técnicas, dúvidas e organização. Seja direto, técnico e prático. Quando tiver o contexto do projeto, use-o; não invente o que não estiver no contexto.`;

/* ----------------------------- helpers ----------------------------- */

function bufferFromDataUrl(dataUrl) {
  const marker = "base64,";
  const idx = String(dataUrl || "").indexOf(marker);
  if (idx === -1) return null;
  try {
    return Buffer.from(dataUrl.slice(idx + marker.length), "base64");
  } catch {
    return null;
  }
}

// Imagens vão multimodais; demais tipos (pdf/doc/txt) são extraídos para texto.
async function processAttachments(attachments = []) {
  const images = [];
  const textBlocks = [];
  for (const a of attachments) {
    if (!a?.data) continue;
    if ((a.mime || "").startsWith("image/")) {
      images.push(a);
      continue;
    }
    const name = a.name || "arquivo";
    const buffer = bufferFromDataUrl(a.data);
    if (!buffer) continue;
    let text = "";
    try {
      text = await ingestionService.extractTextFromFile(
        { originalname: name, mimetype: a.mime || "application/octet-stream", buffer },
        60000
      );
    } catch {
      /* best-effort */
    }
    text = (text || "").trim();
    if (text) textBlocks.push(`Conteúdo do arquivo "${name}":\n${text}`);
    else textBlocks.push(`O arquivo "${name}" foi anexado, mas não consegui extrair texto dele.`);
  }
  return { images, textBlocks };
}

// Contexto do projeto: cabeçalho + detalhes não-secretos + trechos do RAG.
async function buildProjectContext(tenantId, projectId, query) {
  const parts = [];
  try {
    const project = await Project.findByPk(projectId, {
      include: [{ model: Client, as: "client", required: false }],
    });
    if (project && project.tenant_id === tenantId) {
      const header = [
        `Projeto: ${project.name}`,
        project.client?.name ? `Cliente: ${project.client.name}` : null,
        project.status ? `Status: ${project.status}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      parts.push(header);
      if (project.description) parts.push(`Descrição: ${project.description}`);

      const details = await ProjectDetail.findAll({
        where: { project_id: projectId, is_secret: false },
        order: [["category", "ASC"]],
        limit: 60,
      });
      if (details.length) {
        const lines = details
          .map((d) => `- [${d.category}] ${d.label}: ${d.value_text || ""}`.trim())
          .filter(Boolean);
        if (lines.length) parts.push(`Detalhes do projeto:\n${lines.join("\n")}`);
      }
    }
  } catch {
    /* segue sem cabeçalho */
  }

  try {
    const rag = await retrievalService.searchKnowledge({
      tenantId,
      query: query || "contexto do projeto",
      scope: { project_id: projectId },
      limit: 12,
    });
    const pack = retrievalService.buildContextPack(rag);
    if (pack) parts.push(pack);
  } catch {
    /* RAG opcional */
  }

  return parts.join("\n\n").slice(0, 30000);
}

/* ----------------------------- CRUD ----------------------------- */

function presentChat(chat) {
  return {
    id: chat.id,
    title: chat.title || "Nova conversa",
    project_id: chat.project_id || null,
    system_instructions: chat.system_instructions || "",
    model: chat.model || null,
    settings: chat.settings || {},
    message_count: chat.message_count,
    last_message_at: chat.last_message_at,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
  };
}

function presentMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: (m.attachments || []).map((a) => ({
      name: a.name || null,
      mime: a.mime || null,
      // nunca devolve o base64 de volta — só metadados para exibir
    })),
    token_estimate: m.token_estimate,
    created_at: m.created_at,
  };
}

async function assertProjectInTenant(tenantId, projectId) {
  if (!projectId) return;
  const project = await Project.findByPk(projectId);
  if (!project || project.tenant_id !== tenantId) {
    throw new AppError("Projeto não encontrado", 404, "PROJECT_NOT_FOUND");
  }
}

async function loadOwnedChat(ctx, chatId) {
  const chat = await AssistantChat.findOne({
    where: { id: chatId, tenant_id: ctx.tenantId, user_id: ctx.userId },
  });
  if (!chat) throw new AppError("Conversa não encontrada", 404, "CHAT_NOT_FOUND");
  return chat;
}

async function listChats(ctx, { projectId } = {}) {
  const where = { tenant_id: ctx.tenantId, user_id: ctx.userId };
  if (projectId === "none") where.project_id = { [Op.is]: null };
  else if (projectId) where.project_id = projectId;

  const chats = await AssistantChat.findAll({
    where,
    order: sequelize.literal("COALESCE(last_message_at, created_at) DESC"),
  });
  return chats.map(presentChat);
}

async function createChat(ctx, payload = {}) {
  await assertProjectInTenant(ctx.tenantId, payload.project_id || null);
  const chat = await AssistantChat.create({
    tenant_id: ctx.tenantId,
    user_id: ctx.userId,
    project_id: payload.project_id || null,
    title: payload.title?.trim() || "Nova conversa",
    system_instructions: payload.system_instructions || null,
    model: payload.model || null,
    settings: {
      use_project_context: payload.settings?.use_project_context !== false,
      function_calling: Boolean(payload.settings?.function_calling),
      ...(payload.settings || {}),
    },
  });
  return presentChat(chat);
}

async function getChat(ctx, chatId) {
  const chat = await loadOwnedChat(ctx, chatId);
  return presentChat(chat);
}

async function updateChat(ctx, chatId, payload = {}) {
  const chat = await loadOwnedChat(ctx, chatId);

  if (payload.project_id !== undefined) {
    await assertProjectInTenant(ctx.tenantId, payload.project_id || null);
    chat.project_id = payload.project_id || null;
  }
  if (payload.title !== undefined) chat.title = payload.title?.trim() || "Nova conversa";
  if (payload.system_instructions !== undefined) {
    chat.system_instructions = payload.system_instructions || null;
  }
  if (payload.model !== undefined) chat.model = payload.model || null;
  if (payload.settings !== undefined && payload.settings && typeof payload.settings === "object") {
    chat.settings = { ...(chat.settings || {}), ...payload.settings };
  }

  await chat.save();
  return presentChat(chat);
}

async function deleteChat(ctx, chatId) {
  const chat = await loadOwnedChat(ctx, chatId);
  await chat.destroy(); // mensagens caem por ON DELETE CASCADE
  return { message: "Conversa removida." };
}

async function listMessages(ctx, chatId, { limit = 200 } = {}) {
  await loadOwnedChat(ctx, chatId);
  const rows = await AssistantChatMessage.findAll({
    where: { chat_id: chatId },
    order: [["created_at", "ASC"]],
    limit: Math.min(Number(limit) || 200, 500),
  });
  return rows.map(presentMessage);
}

/* ----------------------------- envio ----------------------------- */

async function sendMessage(ctx, chatId, { content, attachments = [] } = {}) {
  const chat = await loadOwnedChat(ctx, chatId);
  const text = String(content || "").trim();
  if (!text && !attachments.length) {
    throw new AppError("Mensagem vazia.", 400, "EMPTY_MESSAGE");
  }

  if (!(await aiRuntime.isConfiguredForTenant(ctx.tenantId))) {
    throw new AppError(
      "IA não configurada. Configure em Configurações → IA.",
      400,
      "AI_NOT_CONFIGURED"
    );
  }

  // 1) Histórico anterior (antes de gravar a nova mensagem).
  const history = await AssistantChatMessage.findAll({
    where: { chat_id: chatId },
    order: [["created_at", "DESC"]],
    limit: HISTORY_LIMIT,
  });
  history.reverse();

  // 2) Processa anexos e grava a mensagem do usuário.
  const { images, textBlocks } = await processAttachments(attachments);
  const userContent = textBlocks.length
    ? `${text || "Analise o(s) arquivo(s) anexado(s)."}\n\n${textBlocks.join("\n\n")}`
    : text;

  const userMessage = await AssistantChatMessage.create({
    tenant_id: ctx.tenantId,
    chat_id: chatId,
    role: "user",
    content: text,
    attachments: attachments.map((a) => ({ name: a.name || null, mime: a.mime || null })),
    token_estimate: estimateTokens(userContent),
  });

  // 3) Monta o prompt: system (instruções + contexto do projeto) + histórico + usuário.
  const systemParts = [chat.system_instructions?.trim() || DEFAULT_SYSTEM];
  const useContext = chat.settings?.use_project_context !== false;
  if (useContext && chat.project_id) {
    const projectContext = await buildProjectContext(ctx.tenantId, chat.project_id, text);
    if (projectContext) systemParts.push(`# Contexto do projeto\n${projectContext}`);
  }

  const messages = [{ role: "system", content: systemParts.join("\n\n") }];
  for (const m of history) {
    if (!m.content) continue;
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }

  if (images.length) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userContent || "Analise as imagens anexadas." },
        ...images.map((img) => ({ type: "image_url", image_url: { url: img.data } })),
      ],
    });
  } else {
    messages.push({ role: "user", content: userContent });
  }

  // 4) Chama a IA (modelo do chat, se definido).
  let replyText = "";
  try {
    const completion = await aiRuntime.createChatCompletion(ctx.tenantId, {
      messages,
      model: chat.model || undefined,
      temperature: 0.4,
      max_tokens: 2400,
    });
    replyText = String(completion.content || "").trim();
  } catch (error) {
    console.error("[chats] IA falhou:", error.message);
    throw new AppError(`Não consegui chamar a IA: ${error.message}`, 502, "AI_FAILED");
  }

  if (!replyText) replyText = "(sem resposta do modelo)";

  // 5) Grava a resposta e atualiza o chat.
  const assistantMessage = await AssistantChatMessage.create({
    tenant_id: ctx.tenantId,
    chat_id: chatId,
    role: "assistant",
    content: replyText,
    token_estimate: estimateTokens(replyText),
  });

  await chat.update({
    message_count: chat.message_count + 2,
    last_message_at: new Date(),
    // dá um título automático a partir da 1ª mensagem, se ainda for "Nova conversa".
    title:
      chat.title && chat.title !== "Nova conversa"
        ? chat.title
        : (text || "Conversa").slice(0, 60),
  });

  return {
    user: presentMessage(userMessage),
    reply: presentMessage(assistantMessage),
    chat: presentChat(chat),
  };
}

module.exports = {
  listChats,
  createChat,
  getChat,
  updateChat,
  deleteChat,
  listMessages,
  sendMessage,
};
