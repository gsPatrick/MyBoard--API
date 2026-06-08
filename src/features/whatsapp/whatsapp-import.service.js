const { Op } = require("sequelize");
const {
  sequelize,
  RagConversation,
  RagMessage,
  RagChunk,
  RagFact,
  RagSummary,
  RagMessageAsset,
  ClientWhatsappLink,
  ProjectWhatsappLink,
  Client,
  Project,
} = require("../../models");
const AppError = require("../../utils/app-error");
const { assertResourceTenant } = require("../../utils/request-context");
const { estimateTokens } = require("../../rag/token-estimate");
const { hashContent } = require("../../rag/content-hash");
const factExtraction = require("../../rag/fact-extraction.service");
const ingestService = require("../../rag/ingest.service");
const parser = require("./whatsapp-export-parser");

const IMPORT_SOURCE = "import";

// content_type precisa caber no ENUM do RagMessage.
const ALLOWED_CONTENT_TYPES = new Set([
  "text",
  "audio",
  "image",
  "video",
  "document",
  "location",
  "reaction",
  "other",
]);
function safeContentType(type) {
  return ALLOWED_CONTENT_TYPES.has(type) ? type : "other";
}

function clientThreadId(clientId) {
  return `import:client:${clientId}`;
}
function projectThreadPrefix(projectId) {
  return `import:project:${projectId}:`;
}
function projectThreadId(projectId, threadKey) {
  return `${projectThreadPrefix(projectId)}${threadKey}`;
}

function mediaLabel(m) {
  const name = m.attachmentName ? ` ${m.attachmentName}` : "";
  switch (m.contentType) {
    case "image":
      return `[imagem${name}]`;
    case "video":
      return `[vídeo${name}]`;
    case "audio":
      return `[áudio${name}]`;
    case "document":
      return `[documento${name}]`;
    case "location":
      return "[localização]";
    case "contact":
      return `[contato${name}]`;
    default:
      return `[mídia${name}]`;
  }
}

/** Apaga uma conversa e todos os registros RAG derivados dela. */
async function wipeConversation(conversationId, transaction) {
  const where = { conversation_id: conversationId };
  await RagChunk.destroy({ where, transaction });
  await RagMessageAsset.destroy({ where, transaction });
  await RagMessage.destroy({ where, transaction });
  await RagSummary.destroy({ where, transaction });
  await RagFact.destroy({ where, transaction });
  await RagConversation.destroy({ where: { id: conversationId }, transaction });
}

async function wipeImportsForClient(tenantId, clientId, transaction) {
  const convs = await RagConversation.findAll({
    where: { tenant_id: tenantId, external_thread_id: clientThreadId(clientId) },
    transaction,
  });
  for (const c of convs) await wipeConversation(c.id, transaction);
  return convs.length;
}

async function wipeImportsForProject(tenantId, projectId, transaction) {
  const convs = await RagConversation.findAll({
    where: { tenant_id: tenantId, external_thread_id: { [Op.like]: `${projectThreadPrefix(projectId)}%` } },
    transaction,
  });
  for (const c of convs) await wipeConversation(c.id, transaction);
  return convs.length;
}

/** Apaga dados de tempo-real (links + conversas vivas) de um cliente. */
async function wipeLiveForClient(tenantId, clientId, transaction) {
  await ClientWhatsappLink.destroy({ where: { tenant_id: tenantId, client_id: clientId }, transaction });
  const convs = await RagConversation.findAll({
    where: {
      tenant_id: tenantId,
      client_id: clientId,
      external_thread_id: { [Op.notLike]: "import:%" },
    },
    transaction,
  });
  for (const c of convs) await wipeConversation(c.id, transaction);
  return convs.length;
}

async function wipeLiveForProject(tenantId, projectId, transaction) {
  await ProjectWhatsappLink.destroy({ where: { tenant_id: tenantId, project_id: projectId }, transaction });
  const convs = await RagConversation.findAll({
    where: {
      tenant_id: tenantId,
      project_id: projectId,
      external_thread_id: { [Op.notLike]: "import:%" },
    },
    transaction,
  });
  for (const c of convs) await wipeConversation(c.id, transaction);
  return convs.length;
}

/** Transforma mensagens do parser em linhas de RagMessage. */
function buildMessageRows(tenantId, conversationId, messages) {
  let lastDate = null;
  let totalTokens = 0;
  const rows = [];
  let idx = 0;

  for (const m of messages) {
    if (m.isSystem) continue;
    const sentAt = m.sentAt || lastDate || new Date();
    lastDate = sentAt;

    let body = m.contentType !== "text" ? mediaLabel(m) : m.bodyText;
    const normalized = String(body || "").replace(/\s+/g, " ").trim();
    if (!normalized) continue;

    idx += 1;
    const tokens = estimateTokens(normalized);
    totalTokens += tokens;

    rows.push({
      tenant_id: tenantId,
      conversation_id: conversationId,
      external_message_id: `imp:${idx}:${hashContent(`${idx}:${normalized}`).slice(0, 16)}`,
      direction: "inbound",
      sender_id: null,
      sender_name: m.senderName || null,
      content_type: safeContentType(m.contentType || "text"),
      body_text: body,
      body_normalized: normalized,
      token_estimate: tokens,
      content_hash: hashContent(normalized),
      sent_at: sentAt,
      raw_payload: {},
      metadata: { source: IMPORT_SOURCE, attachment: m.attachmentName || null },
    });
  }

  return { rows, totalTokens, lastDate };
}

/** Extração de fatos em janelas (limita chamadas de LLM para zips grandes). */
async function extractFactsBatched({ tenantId, clientId, projectId, conversationId, messages }) {
  const text = messages
    .filter((m) => !m.isSystem)
    .map((m) => `${m.senderName || "?"}: ${m.contentType !== "text" ? mediaLabel(m) : m.bodyText}`)
    .join("\n");
  if (!text.trim()) return;

  const WIN = 8000;
  const MAX = 6;
  const windows = [];
  for (let i = 0; i < text.length; i += WIN) windows.push(text.slice(i, i + WIN));
  const step = Math.max(1, Math.floor(windows.length / MAX));
  const sample = windows.filter((_, i) => i % step === 0).slice(0, MAX);

  for (const w of sample) {
    try {
      await factExtraction.upsertFacts({
        tenantId,
        clientId,
        projectId,
        conversationId,
        sourceChannel: "whatsapp",
        text: w,
      });
    } catch {
      /* best-effort */
    }
  }
}

/** Cria a conversa importada (substituindo a anterior de mesma chave) e indexa o RAG. */
async function ingestExport({ tenantId, externalThreadId, clientId, projectId, parsed, fileName }) {
  if (!parsed.messages.length) {
    throw new AppError("Não encontrei mensagens nesse arquivo de conversa.", 400, "EMPTY_EXPORT");
  }

  const conv = await sequelize.transaction(async (t) => {
    const existing = await RagConversation.findOne({
      where: { tenant_id: tenantId, external_thread_id: externalThreadId },
      transaction: t,
    });
    if (existing) await wipeConversation(existing.id, t);

    const conversation = await RagConversation.create(
      {
        tenant_id: tenantId,
        channel: "whatsapp",
        external_thread_id: externalThreadId,
        client_id: clientId,
        project_id: projectId,
        title: parsed.title,
        participant_label: parsed.isGroup ? parsed.title : parsed.senders[0] || null,
        is_group: parsed.isGroup,
        metadata: {
          source: IMPORT_SOURCE,
          file_name: fileName || null,
          imported_at: new Date().toISOString(),
          thread_key: parsed.threadKey,
          participants: parsed.senders.slice(0, 30),
        },
      },
      { transaction: t }
    );

    const { rows, totalTokens, lastDate } = buildMessageRows(tenantId, conversation.id, parsed.messages);
    if (rows.length) {
      await RagMessage.bulkCreate(rows, { transaction: t });
    }
    await conversation.update(
      { message_count: rows.length, token_estimate: totalTokens, last_message_at: lastDate },
      { transaction: t }
    );

    return conversation;
  });

  // Indexação/embeddings e fatos fora da transação (operações pesadas/idempotentes).
  await ingestService.indexConversationMessages(conv.id);
  await extractFactsBatched({
    tenantId,
    clientId,
    projectId,
    conversationId: conv.id,
    messages: parsed.messages,
  });

  return conv;
}

async function loadClient(tenantId, clientId, ctx) {
  const client = await Client.findByPk(clientId);
  assertResourceTenant(client, ctx, "CLIENT_NOT_FOUND");
  return client;
}
async function loadProject(tenantId, projectId, ctx) {
  const project = await Project.findByPk(projectId);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  return project;
}

async function clientLiveCount(tenantId, clientId) {
  const [links, liveConv] = await Promise.all([
    ClientWhatsappLink.count({ where: { tenant_id: tenantId, client_id: clientId } }),
    RagConversation.count({
      where: { tenant_id: tenantId, client_id: clientId, external_thread_id: { [Op.notLike]: "import:%" } },
    }),
  ]);
  return links + liveConv;
}
async function projectLiveCount(tenantId, projectId) {
  const [links, liveConv] = await Promise.all([
    ProjectWhatsappLink.count({ where: { tenant_id: tenantId, project_id: projectId } }),
    RagConversation.count({
      where: { tenant_id: tenantId, project_id: projectId, external_thread_id: { [Op.notLike]: "import:%" } },
    }),
  ]);
  return links + liveConv;
}

function presentImport(conv) {
  return {
    id: conv.id,
    title: conv.title,
    is_group: conv.is_group,
    message_count: conv.message_count,
    last_message_at: conv.last_message_at,
    file_name: conv.metadata?.file_name || null,
    imported_at: conv.metadata?.imported_at || conv.created_at,
    participants: conv.metadata?.participants || [],
  };
}

/* ---------------- CLIENTE ---------------- */

async function getClientMode(clientId, ctx) {
  const tenantId = ctx.tenantId;
  await loadClient(tenantId, clientId, ctx);
  const imports = await RagConversation.findAll({
    where: { tenant_id: tenantId, external_thread_id: clientThreadId(clientId) },
    order: [["created_at", "DESC"]],
  });
  const liveCount = await clientLiveCount(tenantId, clientId);
  const mode = imports.length ? "import" : liveCount ? "live" : null;
  return { mode, live_count: liveCount, imports: imports.map(presentImport) };
}

async function importClient(clientId, file, { confirmSwitch = false } = {}, ctx) {
  const tenantId = ctx.tenantId;
  await loadClient(tenantId, clientId, ctx);

  const live = await clientLiveCount(tenantId, clientId);
  if (live > 0 && !confirmSwitch) {
    throw new AppError(
      "Este cliente está conectado em tempo real. Importar vai apagar a conexão atual.",
      409,
      "SWITCH_TO_IMPORT_REQUIRED"
    );
  }

  const parsed = await parser.parseExport(file.buffer, file.originalname);

  if (live > 0 && confirmSwitch) {
    await sequelize.transaction((t) => wipeLiveForClient(tenantId, clientId, t));
  }

  const conv = await ingestExport({
    tenantId,
    externalThreadId: clientThreadId(clientId),
    clientId,
    projectId: null,
    parsed,
    fileName: file.originalname,
  });

  return { conversation: presentImport(conv), messages: conv.message_count };
}

async function removeClientImport(clientId, conversationId, ctx) {
  const tenantId = ctx.tenantId;
  await loadClient(tenantId, clientId, ctx);
  const conv = await RagConversation.findOne({
    where: { id: conversationId, tenant_id: tenantId, external_thread_id: clientThreadId(clientId) },
  });
  if (!conv) throw new AppError("Importação não encontrada", 404, "IMPORT_NOT_FOUND");
  await sequelize.transaction((t) => wipeConversation(conv.id, t));
  return { message: "Conversa importada removida." };
}

async function switchClientToLive(clientId, ctx) {
  const tenantId = ctx.tenantId;
  await loadClient(tenantId, clientId, ctx);
  const removed = await sequelize.transaction((t) => wipeImportsForClient(tenantId, clientId, t));
  return { message: "Pronto para conectar em tempo real.", removed };
}

/* ---------------- PROJETO ---------------- */

async function getProjectMode(projectId, ctx) {
  const tenantId = ctx.tenantId;
  await loadProject(tenantId, projectId, ctx);
  const imports = await RagConversation.findAll({
    where: { tenant_id: tenantId, external_thread_id: { [Op.like]: `${projectThreadPrefix(projectId)}%` } },
    order: [["created_at", "DESC"]],
  });
  const liveCount = await projectLiveCount(tenantId, projectId);
  const mode = imports.length ? "import" : liveCount ? "live" : null;
  return { mode, live_count: liveCount, imports: imports.map(presentImport) };
}

async function importProject(projectId, file, { confirmSwitch = false } = {}, ctx) {
  const tenantId = ctx.tenantId;
  const project = await loadProject(tenantId, projectId, ctx);

  const live = await projectLiveCount(tenantId, projectId);
  if (live > 0 && !confirmSwitch) {
    throw new AppError(
      "Este projeto está conectado em tempo real. Importar vai apagar a conexão atual.",
      409,
      "SWITCH_TO_IMPORT_REQUIRED"
    );
  }

  const parsed = await parser.parseExport(file.buffer, file.originalname);

  if (live > 0 && confirmSwitch) {
    await sequelize.transaction((t) => wipeLiveForProject(tenantId, projectId, t));
  }

  const conv = await ingestExport({
    tenantId,
    externalThreadId: projectThreadId(projectId, parsed.threadKey),
    clientId: project.client_id || null,
    projectId,
    parsed,
    fileName: file.originalname,
  });

  return { conversation: presentImport(conv), messages: conv.message_count };
}

async function removeProjectImport(projectId, conversationId, ctx) {
  const tenantId = ctx.tenantId;
  await loadProject(tenantId, projectId, ctx);
  const conv = await RagConversation.findOne({
    where: {
      id: conversationId,
      tenant_id: tenantId,
      external_thread_id: { [Op.like]: `${projectThreadPrefix(projectId)}%` },
    },
  });
  if (!conv) throw new AppError("Importação não encontrada", 404, "IMPORT_NOT_FOUND");
  await sequelize.transaction((t) => wipeConversation(conv.id, t));
  return { message: "Conversa importada removida." };
}

async function switchProjectToLive(projectId, ctx) {
  const tenantId = ctx.tenantId;
  await loadProject(tenantId, projectId, ctx);
  const removed = await sequelize.transaction((t) => wipeImportsForProject(tenantId, projectId, t));
  return { message: "Pronto para conectar em tempo real.", removed };
}

module.exports = {
  getClientMode,
  importClient,
  removeClientImport,
  switchClientToLive,
  getProjectMode,
  importProject,
  removeProjectImport,
  switchProjectToLive,
};
