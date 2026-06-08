const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { PDFParse } = require("pdf-parse");
const { RagMessageAsset, MediaFile } = require("../models");
const localStorage = require("../providers/storage/local-storage.provider");
const { estimateTokens } = require("./token-estimate");
const aiRuntime = require("../features/settings/ai-runtime.service");

const CONTRACT_NAME_REGEX = /contrato|contract|proposta|acordo|termo/i;

function isContractFile(name = "", mime = "") {
  const n = String(name).toLowerCase();
  const m = String(mime).toLowerCase();
  return CONTRACT_NAME_REGEX.test(n) || (m.includes("pdf") && CONTRACT_NAME_REGEX.test(n));
}

function extractMediaFromEvolutionMessage(raw = {}) {
  const message = raw.message || raw;
  const types = [
    ["documentMessage", "document"],
    ["audioMessage", "audio"],
    ["imageMessage", "image"],
    ["videoMessage", "video"],
  ];

  for (const [key, assetType] of types) {
    const payload = message[key];
    if (!payload) continue;

    return {
      assetType,
      fileName: payload.fileName || payload.title || `${assetType}-${Date.now()}`,
      mimeType: payload.mimetype || payload.mimeType || guessMime(assetType),
      url: payload.url || null,
      base64: payload.base64 || raw.base64 || null,
      caption: payload.caption || null,
      seconds: payload.seconds || null,
    };
  }

  return null;
}

function guessMime(assetType) {
  if (assetType === "document") return "application/pdf";
  if (assetType === "audio") return "audio/ogg";
  if (assetType === "image") return "image/jpeg";
  if (assetType === "video") return "video/mp4";
  return "application/octet-stream";
}

async function downloadBuffer({ url, base64 }) {
  if (base64) {
    const cleaned = String(base64).replace(/^data:[^;]+;base64,/, "");
    return Buffer.from(cleaned, "base64");
  }

  if (!url) return null;

  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) {
    throw new Error(`Download falhou: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractPdfText(buffer) {
  // pdf-parse v2: classe PDFParse (a versão antiga era função default).
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return String(result?.text || "")
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (error) {
    console.warn("[RAG] PDF parse falhou:", error.message);
    return null;
  } finally {
    try {
      await parser?.destroy();
    } catch {
      /* ignore */
    }
  }
}

async function transcribeAudio(buffer, mimeType, fileName, tenantId) {
  if (!tenantId || !(await aiRuntime.isConfiguredForTenant(tenantId))) {
    return `[Áudio: ${fileName || "sem nome"} — transcrição indisponível]`;
  }

  const ai = await aiRuntime.getCredentials(tenantId);
  if (ai.apiFormat !== "openai") {
    return `[Áudio: ${fileName || "sem nome"} — transcrição disponível apenas com provedor OpenAI-compatível]`;
  }

  try {
    const base64 = buffer.toString("base64");
    const response = await aiRuntime.createChatCompletion(tenantId, {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcreva este áudio em português. Retorne apenas a transcrição literal, sem comentários.",
            },
            {
              type: "input_audio",
              input_audio: { data: base64, format: mimeType?.includes("mp3") ? "mp3" : "wav" },
            },
          ],
        },
      ],
      model: ai.chatModel,
      temperature: 0,
      max_tokens: 1200,
    });

    return String(response.content || "").trim() || null;
  } catch (error) {
    console.warn("[RAG] transcrição áudio falhou:", error.message);
    return `[Áudio recebido — transcrição pendente: ${fileName || "arquivo"}]`;
  }
}

async function saveBufferAsMedia({ buffer, fileName, mimeType, entityType, entityId, category = "conversa" }) {
  const ext = path.extname(fileName) || "";
  const storedName = `${randomUUID()}${ext}`;
  const relativePath = path.join(entityType, entityId, storedName);
  const absolutePath = path.join(localStorage.UPLOAD_ROOT, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const publicUrl = process.env.UPLOAD_PUBLIC_BASE_URL
    ? `${process.env.UPLOAD_PUBLIC_BASE_URL.replace(/\/$/, "")}/${relativePath.replace(/\\/g, "/")}`
    : null;

  return MediaFile.create({
    entity_type: entityType,
    entity_id: entityId,
    kind: "attachment",
    original_name: fileName,
    stored_name: storedName,
    mime_type: mimeType,
    size_bytes: buffer.length,
    storage_disk: "local",
    storage_path: relativePath.replace(/\\/g, "/"),
    public_url: publicUrl,
    metadata: { source: "whatsapp_rag", category },
  });
}

async function processMessageMedia({
  tenantId,
  message,
  conversation,
  rawPayload,
  evolutionClient,
  instanceName,
}) {
  const descriptor = extractMediaFromEvolutionMessage(rawPayload);
  if (!descriptor) return null;

  const existing = await RagMessageAsset.findOne({ where: { message_id: message.id } });
  if (existing) return existing;

  let buffer = await downloadBuffer(descriptor).catch(() => null);

  if (!buffer && evolutionClient && instanceName && descriptor.url) {
    try {
      buffer = await evolutionClient.downloadMedia(instanceName, {
        message: rawPayload,
      });
    } catch (error) {
      console.warn("[RAG] Evolution media download falhou:", error.message);
    }
  }

  if (!buffer) {
    const fallbackText = descriptor.caption || `[${descriptor.assetType}: ${descriptor.fileName}]`;
    return RagMessageAsset.create({
      tenant_id: tenantId,
      message_id: message.id,
      conversation_id: conversation.id,
      client_id: conversation.client_id,
      project_id: conversation.project_id,
      asset_type: descriptor.assetType,
      original_name: descriptor.fileName,
      mime_type: descriptor.mimeType,
      extracted_text: fallbackText,
      token_estimate: estimateTokens(fallbackText),
      is_contract: isContractFile(descriptor.fileName, descriptor.mimeType),
      metadata: { download_pending: true },
    });
  }

  let extractedText = descriptor.caption || "";
  const entityType = conversation.project_id ? "project" : conversation.client_id ? "client" : "project";
  const entityId = conversation.project_id || conversation.client_id || conversation.id;

  if (descriptor.mimeType?.includes("pdf") || descriptor.fileName?.toLowerCase().endsWith(".pdf")) {
    const pdfText = await extractPdfText(buffer);
    if (pdfText) {
      extractedText = `${extractedText}\n\n${pdfText}`.trim();
    }
  } else if (descriptor.assetType === "audio") {
    const transcription = await transcribeAudio(buffer, descriptor.mimeType, descriptor.fileName, tenantId);
    extractedText = transcription || extractedText;
    buffer = null;
  } else if (descriptor.assetType === "image" && (await aiRuntime.isConfiguredForTenant(tenantId))) {
    extractedText =
      extractedText ||
      `[Imagem: ${descriptor.fileName}${descriptor.caption ? ` — ${descriptor.caption}` : ""}]`;
  }

  let mediaFile = null;
  if (buffer && buffer.length > 0) {
    mediaFile = await saveBufferAsMedia({
      buffer,
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      entityType,
      entityId,
    });
  }

  const isContract = isContractFile(descriptor.fileName, descriptor.mimeType);

  const asset = await RagMessageAsset.create({
    tenant_id: tenantId,
    message_id: message.id,
    conversation_id: conversation.id,
    client_id: conversation.client_id,
    project_id: conversation.project_id,
    media_file_id: mediaFile?.id || null,
    asset_type: descriptor.assetType,
    original_name: descriptor.fileName,
    mime_type: descriptor.mimeType,
    extracted_text: extractedText || null,
    token_estimate: estimateTokens(extractedText),
    is_contract: isContract,
    metadata: {
      has_file: Boolean(mediaFile),
      caption: descriptor.caption || null,
    },
  });

  return asset;
}

module.exports = {
  extractMediaFromEvolutionMessage,
  processMessageMedia,
  isContractFile,
  // helpers reutilizados pela importação de conversas exportadas
  extractPdfText,
  transcribeAudio,
  saveBufferAsMedia,
};
