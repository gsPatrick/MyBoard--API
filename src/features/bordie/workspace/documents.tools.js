const documentsService = require("../../documents/documents.service");

const CATEGORY_LABELS = { cv: "Currículo", contract: "Contrato", other: "Arquivo" };

const CATEGORY_ALIASES = {
  curriculo: "cv",
  currículo: "cv",
  cv: "cv",
  resume: "cv",
  contrato: "contract",
  contratos: "contract",
  contract: "contract",
};

function resolveCategory(value) {
  if (!value) return null;
  const k = String(value).trim().toLowerCase();
  return CATEGORY_ALIASES[k] || (["cv", "contract", "other"].includes(k) ? k : null);
}

function toDocumentEntity(doc) {
  return {
    type: "document",
    id: doc.id,
    title: doc.title,
    subtitle: [CATEGORY_LABELS[doc.category] || "Arquivo", doc.language]
      .filter(Boolean)
      .join(" · "),
    category: doc.category,
    language: doc.language || null,
    purpose: doc.purpose || null,
    mime_type: doc.mime_type || null,
    icon: "document",
    media_id: doc.id,
  };
}

function matches(doc, query) {
  if (!query) return true;
  const q = String(query).toLowerCase();
  return [doc.title, doc.purpose, doc.language, CATEGORY_LABELS[doc.category]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

const definitions = [
  {
    type: "function",
    function: {
      name: "get_my_documents",
      description:
        "Retorna os documentos pessoais do usuário guardados em 'Minhas informações': currículo (com idioma), contratos (modelo de contrato para fechar projetos) e outros arquivos. Use quando pedirem 'meu currículo', 'me passa o currículo em inglês', 'meu contrato padrão', 'meus documentos'. A interface mostra com botões de abrir e baixar.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filtrar: cv (currículo), contract (contrato) ou other." },
          query: { type: "string", description: "Busca por título/idioma (ex.: 'inglês', 'NDA')." },
        },
      },
    },
  },
];

const tools = {
  get_my_documents: {
    kind: "read",
    async run(args = {}, ctx) {
      const category = resolveCategory(args.category);
      const docs = await documentsService.listDocuments(ctx, category ? { category } : {});
      const filtered = docs.filter((d) => matches(d, args.query));
      const entities = filtered.map(toDocumentEntity);
      return {
        summary: {
          total: entities.length,
          category: category || "todos",
          documents: entities.map((e) => ({ title: e.title, category: e.category, language: e.language })),
          note: "A interface mostra cada documento com botão de abrir/baixar. No texto, só diga o que encontrou.",
        },
        entities,
      };
    },
  },
};

module.exports = { definitions, tools, toDocumentEntity };
