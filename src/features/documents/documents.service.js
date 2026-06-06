const mediaService = require("../media/media.service");
const AppError = require("../../utils/app-error");

// "Minhas informações": biblioteca pessoal do usuário (currículo, contratos,
// arquivos genéricos). Reaproveita o storage de mídia — sem tabela nova:
// MediaFile com entity_type="user", entity_id=userId, kind="attachment" e
// metadata.scope="library".
const DOC_SCOPE = "library";
const CATEGORIES = ["cv", "contract", "other"];

function isLibraryDoc(media) {
  return media?.metadata?.scope === DOC_SCOPE;
}

function toDocument(media) {
  const json = typeof media.toJSON === "function" ? media.toJSON() : media;
  const meta = json.metadata || {};
  return {
    id: json.id,
    title: meta.title || json.original_name,
    original_name: json.original_name,
    category: meta.category || "other",
    purpose: meta.purpose || null,
    language: meta.language || null,
    mime_type: json.mime_type,
    size_bytes: json.size_bytes,
    created_at: json.created_at || json.createdAt || null,
  };
}

async function createDocument({ file, title, category, purpose, language }, ctx) {
  if (!ctx?.userId) {
    throw new AppError("Usuário não identificado", 401, "UNAUTHENTICATED");
  }
  if (!file) {
    throw new AppError("Arquivo é obrigatório", 400, "VALIDATION_ERROR");
  }

  const media = await mediaService.uploadFile({
    file,
    entityType: "user",
    entityId: ctx.userId,
    kind: "attachment",
    ctx,
  });

  const cat = CATEGORIES.includes(category) ? category : "other";
  await media.update({
    metadata: {
      scope: DOC_SCOPE,
      category: cat,
      title: (title || media.original_name || "").toString().slice(0, 200) || media.original_name,
      purpose: purpose ? String(purpose).slice(0, 500) : null,
      language: language ? String(language).slice(0, 40) : null,
    },
  });

  return toDocument(media);
}

async function listDocuments(ctx, { category } = {}) {
  if (!ctx?.userId) return [];
  const items = await mediaService.listMedia("user", ctx.userId, { kind: "attachment" }, ctx);
  let docs = (items || []).filter(isLibraryDoc).map(toDocument);
  if (category && CATEGORIES.includes(category)) {
    docs = docs.filter((d) => d.category === category);
  }
  return docs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function deleteDocument(id, ctx) {
  // deleteMedia já valida acesso/tenant.
  return mediaService.deleteMedia(id, ctx);
}

module.exports = {
  CATEGORIES,
  createDocument,
  listDocuments,
  deleteDocument,
  toDocument,
};
