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
const mediaProcessor = require("../../rag/media-processor.service");
const messageOptimizer = require("../../rag/message-optimizer.service");
const ingestionService = require("../ingestion/ingestion.service");
const aiRuntime = require("../settings/ai-runtime.service");
const notificationsService = require("../notifications/notifications.service");
const parser = require("./whatsapp-export-parser");

const CURATION_PROMPT = `Você recebe um trecho de conversa de WhatsApp (e, quando houver, textos de documentos e transcrições de áudio) entre um prestador e um cliente, sobre um projeto.
Sua tarefa: EXTRAIR e reescrever em tópicos APENAS o que é útil para o negócio e para consultar depois. Inclua quando houver:
- contexto do cliente e do projeto, objetivos e escopo
- decisões, combinados e mudanças
- valores, formas de pagamento e prazos
- problemas, bugs e pedidos de ajuste
- credenciais, acessos, links e repositórios (mantenha os valores literais)
- datas/horários de reunião e responsáveis
- qualquer informação concreta relevante

DESCARTE: saudações, conversa fiada, "ok", "kkk", emojis soltos, figurinhas, mensagens vazias ou sem informação.
Escreva em português, em tópicos curtos e densos, sem inventar nada. Se o trecho não tiver NADA aproveitável, responda exatamente: (vazio)`;

/** Destila o transcript: a IA mantém o importante e descarta as pontas soltas. */
async function curateTranscript({ tenantId, transcript }) {
  if (!transcript.trim()) return "";
  if (!(await aiRuntime.isConfiguredForTenant(tenantId))) return "";

  const WIN = 12000;
  const MAX_WINDOWS = Number(process.env.WHATSAPP_CURATION_MAX_WINDOWS || 12);
  const windows = [];
  for (let i = 0; i < transcript.length && windows.length < MAX_WINDOWS; i += WIN) {
    windows.push(transcript.slice(i, i + WIN));
  }

  const parts = [];
  for (const w of windows) {
    try {
      const completion = await aiRuntime.createChatCompletion(tenantId, {
        messages: [
          { role: "system", content: CURATION_PROMPT },
          { role: "user", content: w },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      });
      const out = String(completion.content || "").trim();
      if (out && !/^\(?\s*vazio\s*\)?\.?$/i.test(out)) parts.push(out);
    } catch {
      /* best-effort por janela */
    }
  }
  return parts.join("\n\n").trim();
}

const MIME_BY_EXT = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  opus: "audio/ogg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  vcf: "text/vcard",
};
function mimeFromName(name = "") {
  const ext = String(name).split(".").pop().toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

const ATTACH_MAX = Number(process.env.WHATSAPP_IMPORT_MAX_ATTACHMENTS || 40);
const ATTACH_MAX_BYTES = Number(process.env.WHATSAPP_IMPORT_ATTACHMENT_MAX_MB || 20) * 1024 * 1024;

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

/** Corpo final da mensagem para RAG: placeholder de mídia + texto extraído/transcrito. */
function fullBody(m) {
  let body = m.contentType !== "text" ? mediaLabel(m) : m.bodyText;
  if (m.extractedText) body = `${body}\n${m.extractedText}`.trim();
  return body;
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

    const body = fullBody(m);
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
    .map((m) => `${m.senderName || "?"}: ${fullBody(m)}`)
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

/**
 * Processa os anexos do zip: salva como MediaFile (para download), extrai texto
 * de documentos/PDF e transcreve áudios, enriquecendo o transcript p/ o RAG.
 */
async function processAttachments({ tenantId, parsed, clientId, projectId }) {
  const entityType = projectId ? "project" : "client";
  const entityId = projectId || clientId;
  if (!entityId || !parsed.attachments?.size) return { saved: 0, transcribed: 0 };

  let processed = 0;
  let saved = 0;
  let transcribed = 0;

  for (const m of parsed.messages) {
    if (!m.attachmentName || processed >= ATTACH_MAX) continue;
    const entry = parsed.attachments.get(m.attachmentName);
    if (!entry) continue;

    let buffer;
    try {
      buffer = await entry.async("nodebuffer");
    } catch {
      continue;
    }
    if (!buffer || !buffer.length || buffer.length > ATTACH_MAX_BYTES) continue;
    processed += 1;

    const mimeType = mimeFromName(m.attachmentName);
    let extracted = "";

    try {
      if (/\.pdf$/i.test(m.attachmentName)) {
        extracted = (await mediaProcessor.extractPdfText(buffer)) || "";
      } else if (/\.(txt|csv|md|json)$/i.test(m.attachmentName)) {
        extracted = buffer.toString("utf8").slice(0, 20000);
      } else if (m.contentType === "audio") {
        extracted = (await mediaProcessor.transcribeAudio(buffer, mimeType, m.attachmentName, tenantId)) || "";
        if (extracted && !/transcrição (indisponível|pendente|disponível)/i.test(extracted)) transcribed += 1;
      }
    } catch {
      /* extração best-effort */
    }

    if (extracted) {
      m.extractedText = extracted;
    }

    // Salva o arquivo para o usuário acessar/baixar (anexo do projeto/cliente).
    try {
      await mediaProcessor.saveBufferAsMedia({
        buffer,
        fileName: m.attachmentName,
        mimeType,
        entityType,
        entityId,
      });
      saved += 1;
    } catch {
      /* não bloqueia a importação */
    }
  }

  return { saved, transcribed };
}

/** Roda a extração estruturada por IA e aplica nos lugares certos (detalhes/demandas/reuniões). */
async function runAiExtraction({ text, clientId, projectId, ctx }) {
  try {
    if (!text || !text.trim()) return null;

    const proposal = await ingestionService.analyzeText({ text, tenantId: ctx.tenantId });
    const target = projectId ? { project_id: projectId } : { client_id: clientId };
    return await ingestionService.apply({
      proposal,
      target,
      files: [],
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      // Importação por cliente não cria projeto (evita duplicar a cada reimport).
      skipProjectCreate: !projectId,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-import] extração IA falhou:", error.message);
    return null;
  }
}

/**
 * Fase 1 (RÁPIDA): cria a conversa em status "processing" e grava as mensagens
 * cruas. Retorna em segundos — o pesado (IA/mídia) roda em segundo plano.
 */
async function createImportConversation({ tenantId, externalThreadId, clientId, projectId, parsed, fileName, name }) {
  if (!parsed.messages.length) {
    throw new AppError("Não encontrei mensagens nesse arquivo de conversa.", 400, "EMPTY_EXPORT");
  }
  const title = (name && name.trim()) || parsed.title;

  return sequelize.transaction(async (t) => {
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
        title,
        participant_label: parsed.isGroup ? title : parsed.senders[0] || null,
        is_group: parsed.isGroup,
        metadata: {
          source: IMPORT_SOURCE,
          status: "processing",
          name: (name && name.trim()) || null,
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
}

async function setImportStatus(conv, patch) {
  try {
    await conv.update({ metadata: { ...(conv.metadata || {}), ...patch } });
  } catch {
    /* ignore */
  }
}

async function notifyImport({ ctx, conv, clientId, projectId, stats, ok }) {
  if (!ctx?.userId) return;
  const entityType = projectId ? "project" : "client";
  const entityId = projectId || clientId;
  const extras = [];
  if (ok && stats?.media?.saved) extras.push(`${stats.media.saved} arquivo(s)`);
  if (ok && stats?.ai?.details) extras.push(`${stats.ai.details} detalhe(s)`);
  if (ok && stats?.ai?.demands) extras.push(`${stats.ai.demands} demanda(s)`);
  try {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      eventType: "whatsapp.import",
      title: ok ? "Importação do WhatsApp concluída" : "Importação do WhatsApp falhou",
      message: ok
        ? `“${conv.title}” organizada${extras.length ? ` • ${extras.join(", ")}` : ""}.`
        : `“${conv.title}” não pôde ser processada.`,
      entityType,
      entityId,
      payload: { conversationId: conv.id },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Fase 2 (SEGUNDO PLANO): anexos (salvar/extrair/transcrever), curadoria por IA,
 * indexação, fatos, extração estruturada e notificação ao concluir.
 */
async function processImport({ conv, parsed, clientId, projectId, ctx }) {
  const tenantId = ctx.tenantId;
  try {
    const media = await processAttachments({ tenantId, parsed, clientId, projectId });

    const transcript = parsed.messages
      .filter((m) => !m.isSystem)
      .map((m) => `${m.senderName || "?"}: ${fullBody(m)}`)
      .join("\n");

    let digest = "";
    if (ctx) digest = await curateTranscript({ tenantId, transcript });

    if (digest) {
      await ingestService.indexConversationContent({ conversation: conv, content: digest });
      try {
        let pass;
        let guard = 0;
        do {
          pass = await messageOptimizer.optimizeConversationStorage(conv.id, { batchSize: 500 });
          guard += 1;
        } while (pass.optimized > 0 && guard < 100);
      } catch {
        /* otimização best-effort */
      }
    } else {
      await ingestService.indexConversationMessages(conv.id);
    }

    if (digest) {
      try {
        await factExtraction.upsertFacts({
          tenantId,
          clientId,
          projectId,
          conversationId: conv.id,
          sourceChannel: "whatsapp",
          text: digest,
        });
      } catch {
        /* best-effort */
      }
    } else {
      await extractFactsBatched({ tenantId, clientId, projectId, conversationId: conv.id, messages: parsed.messages });
    }

    let aiResult = null;
    if (ctx) aiResult = await runAiExtraction({ text: digest || transcript, clientId, projectId, ctx });

    const stats = { media, curated: Boolean(digest), ai: aiResult?.actions || null };
    await setImportStatus(conv, { status: "done", finished_at: new Date().toISOString(), stats });
    await notifyImport({ ctx, conv, clientId, projectId, stats, ok: true });
    return stats;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp-import] processamento em 2º plano falhou:", error.message);
    await setImportStatus(conv, { status: "error", error: String(error.message || "erro").slice(0, 300) });
    await notifyImport({ ctx, conv, clientId, projectId, ok: false });
    return null;
  }
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
    name: conv.metadata?.name || null,
    status: conv.metadata?.status || "done",
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

async function importClient(clientId, file, { confirmSwitch = false, name } = {}, ctx) {
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

  const conv = await createImportConversation({
    tenantId,
    externalThreadId: clientThreadId(clientId),
    clientId,
    projectId: null,
    parsed,
    fileName: file.originalname,
    name,
  });

  // Processamento pesado em segundo plano (não bloqueia a resposta).
  processImport({ conv, parsed, clientId, projectId: null, ctx }).catch(() => {});

  return {
    conversation: presentImport(conv),
    messages: conv.message_count,
    status: "processing",
  };
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

async function importProject(projectId, file, { confirmSwitch = false, name } = {}, ctx) {
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

  const conv = await createImportConversation({
    tenantId,
    externalThreadId: projectThreadId(projectId, parsed.threadKey),
    clientId: project.client_id || null,
    projectId,
    parsed,
    fileName: file.originalname,
    name,
  });

  processImport({ conv, parsed, clientId: project.client_id || null, projectId, ctx }).catch(() => {});

  return {
    conversation: presentImport(conv),
    messages: conv.message_count,
    status: "processing",
  };
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
