const { Op } = require("sequelize");
const { PDFParse } = require("pdf-parse");
const JSZip = require("jszip");
const { Client } = require("../../models");
const AppError = require("../../utils/app-error");
const aiRuntime = require("../settings/ai-runtime.service");
const clientsService = require("../clients/clients.service");
const projectsService = require("../projects/projects.service");
const projectDetailsService = require("../project-details/project-details.service");
const projectDemandsService = require("../project-demands/project-demands.service");
const agendaService = require("../agenda/agenda.service");
const mediaService = require("../media/media.service");
const factExtraction = require("../../rag/fact-extraction.service");
const {
  PROJECT_STATUSES,
  PROJECT_ORIGINS,
  PROJECT_PRIORITIES,
  DETAIL_CATEGORIES,
  DEMAND_STATUSES,
} = require("../../config/constants");

const MAX_CHARS = 60000;
const TEXT_ENTRY_REGEX = /\.(txt|md|markdown|csv|json|env|ya?ml|ini|conf|log|sql|html?|xml)$/i;
const SECRET_HINT_REGEX = /senha|password|secret|token|api[_-]?key|chave|access[_-]?key|client[_-]?secret|private[_-]?key|pwd|credencial/i;

// ---------------------------------------------------------------------------
// Extração de texto (txt / pdf / zip)
// ---------------------------------------------------------------------------

async function extractPdf(buffer) {
  // pdf-parse v2: classe PDFParse (a versão antiga era função default).
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return String(result?.text || "")
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ") // remove marcadores de página do pdf-parse v2
      .replace(/\s+/g, " ")
      .trim();
  } catch (error) {
    console.warn("[ingestion] PDF parse falhou:", error.message);
    return "";
  } finally {
    try {
      await parser?.destroy();
    } catch {
      /* ignore */
    }
  }
}

async function extractZip(buffer, budget) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const parts = [];
  let used = 0;

  for (const entry of entries) {
    if (used >= budget) break;
    const name = entry.name;
    if (/(^|\/)(node_modules|\.git)\//i.test(name)) continue;

    let content = "";
    if (/\.pdf$/i.test(name)) {
      const buf = await entry.async("nodebuffer");
      content = await extractPdf(buf);
    } else if (TEXT_ENTRY_REGEX.test(name)) {
      content = await entry.async("string");
    } else {
      continue; // ignora binários/imagens
    }

    content = String(content || "").trim();
    if (!content) continue;

    const slice = content.slice(0, budget - used);
    parts.push(`#### ${name}\n${slice}`);
    used += slice.length;
  }

  return parts.join("\n\n");
}

async function extractTextFromFile(file, budget) {
  const mime = file.mimetype || "";
  const name = (file.originalname || "").toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdf(file.buffer);
  }
  if (mime === "application/zip" || mime === "application/x-zip-compressed" || name.endsWith(".zip")) {
    return extractZip(file.buffer, budget);
  }
  // txt, csv, json, md e afins
  return file.buffer.toString("utf8").slice(0, budget);
}

async function extractTextFromFiles(files = []) {
  const parts = [];
  let used = 0;

  for (const file of files) {
    if (used >= MAX_CHARS) break;
    const text = await extractTextFromFile(file, MAX_CHARS - used).catch((error) => {
      console.warn("[ingestion] extração falhou:", error.message);
      return "";
    });
    const clean = String(text || "").trim();
    if (!clean) continue;
    parts.push(`### Arquivo: ${file.originalname}\n${clean}`);
    used += clean.length;
  }

  return parts.join("\n\n").slice(0, MAX_CHARS);
}

// ---------------------------------------------------------------------------
// Análise por IA → proposta estruturada
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `Você é um extrator de dados de CRM. Recebe o conteúdo bruto de arquivos (txt, pdf, zip) de um projeto/cliente e devolve SOMENTE um objeto JSON válido, sem texto extra, sem markdown.

Schema (use exatamente estas chaves; use null quando não houver informação — NÃO invente dados):
{
  "client": {
    "name": string|null, "email": string|null, "company": string|null,
    "phone": string|null, "cpf": string|null, "cnpj": string|null, "notes": string|null
  } | null,
  "project": {
    "name": string|null, "description": string|null,
    "status": "draft"|"in_progress"|"completed"|"cancelled"|"paused"|null,
    "priority": "low"|"medium"|"high"|"critical"|null,
    "budget": number|null, "due_date": "YYYY-MM-DD"|null,
    "origin": "own"|"99freelas"|"workana"|null
  } | null,
  "details": [
    { "category": "github"|"credentials"|"scope"|"deployment"|"environment"|"documentation"|"links"|"notes"|"custom",
      "label": string, "value": string, "is_secret": boolean }
  ],
  "demands": [
    { "title": string, "description": string|null, "status": "pending"|"in_progress"|"done"|null }
  ],
  "meetings": [
    { "title": string, "datetime": "YYYY-MM-DDTHH:mm"|null, "notes": string|null }
  ],
  "summary": string
}

Regras:
- Extraia TODAS as informações úteis e NÃO esqueça nada relevante: dados do cliente, do projeto, escopo, links, repositórios, deploy, ambiente, stack/tecnologias e CREDENCIAIS (senhas, tokens, api keys, usuários/logins, strings de conexão).
- ORIGEM/plataforma: se o conteúdo vier do 99Freelas defina origin="99freelas"; se for Workana, "workana"; senão "own". Quando houver, capture o LINK do projeto na plataforma e o LINK do chat como details com category="links" (labels "Link do projeto na plataforma" e "Link do chat").
- CLIENTE: coloque CPF em client.cpf e CNPJ em client.cnpj (o cliente pode ter os dois). Observações do cliente vão em client.notes.
- SEPARE bem por category: tecnologias/stack → "environment" (label "Stack" ou "Tecnologias"); URLs e links → "links"; passos/instruções de deploy → "deployment"; escopo/requisitos → "scope"; documentação → "documentation"; o resto → "custom". Não jogue tudo em "custom".
- Marque is_secret=true e category="credentials" para qualquer segredo (senha, token, chave, secret, login com senha, connection string).
- "label" é um rótulo curto legível (ex.: "Senha do banco", "Repositório GitHub", "URL de produção", "Stack"). "value" é o valor literal encontrado.
- DEMANDAS/TAREFAS: quando o conteúdo (especialmente conversas) descrever algo que precisa ser FEITO, ajustes pedidos, bugs, pendências ou próximos passos, gere um item em "demands" com um título curto e acionável e uma descrição. Não invente; só o que estiver no texto.
- REUNIÕES: quando houver combinação de reunião/call/encontro com data/hora, gere um item em "meetings" com título e "datetime" no formato YYYY-MM-DDTHH:mm (use null se a data não estiver clara). Coloque o contexto em "notes".
- Não duplique itens. Responda em português. Retorne apenas o JSON.`;

// Function calling: força a IA a devolver os dados estruturados de forma confiável.
const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_crm_data",
    description:
      "Preenche TODOS os campos possíveis do cliente e do projeto a partir do conteúdo (conversa, documentos, transcrições). Não invente; use null quando não houver.",
    parameters: {
      type: "object",
      properties: {
        client: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            company: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            cpf: { type: ["string", "null"] },
            cnpj: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
        },
        project: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            status: { type: ["string", "null"], enum: ["draft", "in_progress", "completed", "cancelled", "paused", null] },
            priority: { type: ["string", "null"], enum: ["low", "medium", "high", "critical", null] },
            budget: { type: ["number", "null"] },
            due_date: { type: ["string", "null"] },
            origin: { type: ["string", "null"], enum: ["own", "99freelas", "workana", null] },
          },
        },
        details: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: ["github", "credentials", "scope", "deployment", "environment", "documentation", "links", "notes", "custom"],
              },
              label: { type: "string" },
              value: { type: "string" },
              is_secret: { type: "boolean" },
            },
            required: ["label", "value"],
          },
        },
        demands: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: ["string", "null"] },
              status: { type: ["string", "null"], enum: ["pending", "in_progress", "done", null] },
            },
            required: ["title"],
          },
        },
        meetings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              datetime: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
            },
            required: ["title"],
          },
        },
        summary: { type: "string" },
      },
      required: ["details", "demands", "meetings"],
    },
  },
};

function parseJsonLoose(content) {
  if (!content) return null;
  let text = String(content).trim();
  // remove cercas ```json ... ```
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // recorta do primeiro { ao último }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanString(value, max = 2000) {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str || str.toLowerCase() === "null") return null;
  return str.slice(0, max);
}

function normalizeClient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const client = {
    name: cleanString(raw.name, 200),
    email: cleanString(raw.email, 255),
    company: cleanString(raw.company, 200),
    phone: cleanString(raw.phone, 50),
    cpf: cleanString(raw.cpf || raw.document, 20),
    cnpj: cleanString(raw.cnpj, 20),
    notes: cleanString(raw.notes, 4000),
  };
  return Object.values(client).some(Boolean) ? client : null;
}

function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = PROJECT_STATUSES.includes(raw.status) ? raw.status : null;
  const priority = PROJECT_PRIORITIES?.includes?.(raw.priority) ? raw.priority : null;
  const origin = PROJECT_ORIGINS.includes(raw.origin) ? raw.origin : null;
  const budget = raw.budget != null && Number.isFinite(Number(raw.budget)) ? Number(raw.budget) : null;
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date || "") ? raw.due_date : null;

  const project = {
    name: cleanString(raw.name, 200),
    description: cleanString(raw.description, 8000),
    status,
    priority,
    budget,
    due_date: dueDate,
    origin,
  };
  return Object.values(project).some((v) => v !== null) ? project : null;
}

function normalizeDetails(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const details = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = cleanString(item.label, 300);
    const value = cleanString(item.value ?? item.value_text, 4000);
    if (!label || !value) continue;

    const category = DETAIL_CATEGORIES.includes(item.category) ? item.category : "custom";
    const isSecret = item.is_secret === true || category === "credentials" || SECRET_HINT_REGEX.test(label);

    const key = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || `item_${details.length + 1}`;

    if (seen.has(key)) continue;
    seen.add(key);

    details.push({
      category,
      label,
      key,
      value,
      value_type: isSecret ? "secret" : "text",
      is_secret: isSecret,
    });
  }

  return details;
}

function normalizeDemands(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const demands = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const title = cleanString(item.title, 300);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const status = DEMAND_STATUSES.includes(item.status) ? item.status : "pending";
    demands.push({
      title,
      description: cleanString(item.description, 4000),
      status,
    });
    if (demands.length >= 40) break;
  }
  return demands;
}

function normalizeMeetings(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const meetings = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const title = cleanString(item.title, 300);
    if (!title) continue;
    const datetime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(item.datetime || "")
      ? item.datetime.slice(0, 16)
      : null;
    const key = `${title.toLowerCase()}|${datetime || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    meetings.push({ title, datetime, notes: cleanString(item.notes, 2000) });
    if (meetings.length >= 20) break;
  }
  return meetings;
}

function normalizeProposal(raw) {
  const safe = raw && typeof raw === "object" ? raw : {};
  return {
    client: normalizeClient(safe.client),
    project: normalizeProject(safe.project),
    details: normalizeDetails(safe.details),
    demands: normalizeDemands(safe.demands),
    meetings: normalizeMeetings(safe.meetings),
    summary: cleanString(safe.summary, 4000) || "",
  };
}

// Roda a extração estruturada sobre um texto já pronto (reusado pela
// importação de conversas do WhatsApp). Limita o tamanho para não estourar o contexto.
async function analyzeText({ text, tenantId, maxChars = 60000 }) {
  const clean = String(text || "").trim();
  if (!clean) {
    throw new AppError(
      "Não consegui ler texto para analisar.",
      422,
      "NO_TEXT_EXTRACTED"
    );
  }

  if (!(await aiRuntime.isConfiguredForTenant(tenantId))) {
    throw new AppError(
      "IA não configurada. Configure em Configurações → IA para usar a importação inteligente.",
      400,
      "AI_NOT_CONFIGURED"
    );
  }

  try {
    const completion = await aiRuntime.createChatCompletion(tenantId, {
      messages: [
        {
          role: "system",
          content: `${EXTRACTION_SYSTEM_PROMPT}\n\nChame a função extract_crm_data preenchendo o máximo de campos possível.`,
        },
        { role: "user", content: clean.slice(0, maxChars) },
      ],
      tools: [EXTRACT_TOOL],
      temperature: 0.1,
      max_tokens: 2600,
    });

    // Preferência: argumentos da função (function calling). Fallback: JSON no texto.
    let raw = null;
    const call = (completion.tool_calls || []).find((c) => c.function?.name === "extract_crm_data");
    if (call?.function?.arguments) {
      try {
        raw = JSON.parse(call.function.arguments);
      } catch {
        raw = parseJsonLoose(call.function.arguments);
      }
    }
    if (!raw) raw = parseJsonLoose(completion.content);

    return normalizeProposal(raw);
  } catch (error) {
    throw new AppError(`Falha ao analisar com a IA: ${error.message}`, 502, "AI_EXTRACTION_FAILED");
  }
}

async function analyze({ files = [], tenantId }) {
  if (!files.length) {
    throw new AppError("Envie ao menos um arquivo.", 400, "VALIDATION_ERROR");
  }

  const text = await extractTextFromFiles(files);
  if (!text.trim()) {
    throw new AppError(
      "Não consegui ler texto dos arquivos enviados (talvez sejam só imagens ou estejam vazios).",
      422,
      "NO_TEXT_EXTRACTED"
    );
  }

  // Mesmo caminho de function calling usado pela importação do WhatsApp.
  const proposal = await analyzeText({ text, tenantId, maxChars: 120000 });

  return {
    proposal,
    stats: {
      files: files.length,
      chars: text.length,
      details: proposal.details.length,
      has_client: Boolean(proposal.client),
      has_project: Boolean(proposal.project),
    },
  };
}

// ---------------------------------------------------------------------------
// Aplicação (criar / atualizar)
// ---------------------------------------------------------------------------

function clientPayload(client) {
  if (!client) return {};
  const payload = {};
  for (const field of ["name", "email", "company", "phone", "document", "cpf", "cnpj", "notes"]) {
    if (client[field] != null) payload[field] = client[field];
  }
  return payload;
}

function projectPayload(project) {
  if (!project) return {};
  const payload = {};
  for (const field of ["name", "description", "status", "priority", "budget", "due_date", "origin"]) {
    if (project[field] != null) payload[field] = project[field];
  }
  return payload;
}

function isEmptyValue(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

// Mantém só os campos que estão VAZIOS no registro atual (não sobrescreve o existente).
function onlyEmptyFields(payload, current) {
  if (!current) return payload;
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (isEmptyValue(current[k])) out[k] = v;
  }
  return out;
}

async function findExistingClient(tenantId, client) {
  if (!client) return null;
  const or = [];
  if (client.document) or.push({ document: client.document });
  if (client.cpf) or.push({ cpf: client.cpf });
  if (client.cnpj) or.push({ cnpj: client.cnpj });
  if (client.email) or.push({ email: { [Op.iLike]: client.email } });
  if (client.name) or.push({ name: { [Op.iLike]: client.name } });
  if (!or.length) return null;
  return Client.findOne({ where: { tenant_id: tenantId, [Op.or]: or } });
}

async function apply({
  proposal,
  target = {},
  files = [],
  tenantId,
  userId,
  role,
  skipProjectCreate = false,
  fillEmptyOnly = false,
}) {
  const ctx = { tenantId, userId, role };
  const safe = normalizeProposal(proposal);

  let clientId = null;
  let projectId = null;
  const actions = { client: null, project: null, details: 0, demands: 0, meetings: 0, files: 0 };

  if (target.project_id) {
    const project = await projectsService.getProjectById(target.project_id, {}, ctx);
    projectId = project.id;
    clientId = project.client_id;

    let pPayload = projectPayload(safe.project);
    if (fillEmptyOnly) pPayload = onlyEmptyFields(pPayload, project);
    if (Object.keys(pPayload).length) {
      await projectsService.updateProject(projectId, pPayload, ctx);
      actions.project = "updated";
    }
    let cPayload = clientPayload(safe.client);
    if (fillEmptyOnly && clientId) {
      const currentClient = await Client.findByPk(clientId);
      cPayload = onlyEmptyFields(cPayload, currentClient);
    }
    if (Object.keys(cPayload).length) {
      await clientsService.updateClient(clientId, cPayload, ctx);
      actions.client = "updated";
    }
  } else if (target.client_id) {
    const client = await Client.findByPk(target.client_id);
    if (!client || client.tenant_id !== tenantId) {
      throw new AppError("Cliente não encontrado", 404, "CLIENT_NOT_FOUND");
    }
    clientId = client.id;

    let cPayload = clientPayload(safe.client);
    if (fillEmptyOnly) cPayload = onlyEmptyFields(cPayload, client);
    if (Object.keys(cPayload).length) {
      await clientsService.updateClient(clientId, cPayload, ctx);
      actions.client = "updated";
    }
    if (!skipProjectCreate && safe.project?.name) {
      const created = await projectsService.createProject(
        { ...projectPayload(safe.project), client_id: clientId },
        ctx
      );
      projectId = created.id;
      actions.project = "created";
    }
  } else {
    // Fluxo de criação a partir do painel principal.
    const existing = await findExistingClient(tenantId, safe.client);
    if (existing) {
      clientId = existing.id;
      const cPayload = clientPayload(safe.client);
      if (Object.keys(cPayload).length) {
        await clientsService.updateClient(clientId, cPayload, ctx);
      }
      actions.client = "updated";
    } else if (safe.client?.name) {
      const created = await clientsService.createClient(clientPayload(safe.client), ctx);
      clientId = created.id;
      actions.client = "created";
    } else {
      throw new AppError(
        "Não foi possível identificar um cliente nos arquivos. Revise os dados antes de aplicar.",
        422,
        "NO_CLIENT_IN_PROPOSAL"
      );
    }

    if (safe.project?.name) {
      const created = await projectsService.createProject(
        { ...projectPayload(safe.project), client_id: clientId },
        ctx
      );
      projectId = created.id;
      actions.project = "created";
    }
  }

  // Detalhes/credenciais (somente quando há projeto — ProjectDetail pertence a projeto)
  if (projectId && safe.details.length) {
    // Modo não-sobrescrever: não toca em detalhes que já existem (mesma key/label).
    let existingKeys = new Set();
    let existingLabels = new Set();
    if (fillEmptyOnly) {
      try {
        const existing = await projectDetailsService.listDetails(projectId, {}, ctx);
        const arr = Array.isArray(existing) ? existing : existing?.items || [];
        existingKeys = new Set(arr.map((d) => String(d.key || "").toLowerCase()));
        existingLabels = new Set(arr.map((d) => String(d.label || "").trim().toLowerCase()));
      } catch {
        /* segue sem dedup */
      }
    }
    for (const detail of safe.details) {
      if (
        fillEmptyOnly &&
        (existingKeys.has(String(detail.key || "").toLowerCase()) ||
          existingLabels.has(String(detail.label || "").trim().toLowerCase()))
      ) {
        continue; // já existe → mantém o que está
      }
      try {
        await projectDetailsService.upsertDetailByKey(projectId, detail, ctx);
        existingKeys.add(String(detail.key || "").toLowerCase());
        existingLabels.add(String(detail.label || "").trim().toLowerCase());
        actions.details += 1;
      } catch (error) {
        console.warn("[ingestion] detalhe falhou:", error.message);
      }
    }
  }

  // Demandas/tarefas extraídas (pertencem a projeto) — dedup por título p/ reimport.
  if (projectId && safe.demands?.length) {
    let existingTitles = new Set();
    try {
      const existing = await projectDemandsService.listDemands(projectId, {}, ctx);
      const arr = Array.isArray(existing) ? existing : existing?.items || [];
      existingTitles = new Set(arr.map((d) => String(d.title || "").trim().toLowerCase()));
    } catch {
      /* segue sem dedup */
    }
    for (const demand of safe.demands) {
      const key = demand.title.trim().toLowerCase();
      if (existingTitles.has(key)) continue;
      try {
        await projectDemandsService.createDemand(projectId, demand, ctx);
        existingTitles.add(key);
        actions.demands += 1;
      } catch (error) {
        console.warn("[ingestion] demanda falhou:", error.message);
      }
    }
  }

  // Reuniões com data viram eventos na agenda
  if (safe.meetings?.length) {
    for (const meeting of safe.meetings) {
      if (!meeting.datetime) continue;
      try {
        await agendaService.createEvent(
          {
            title: meeting.title,
            starts_at: meeting.datetime,
            description: meeting.notes || null,
            project_id: projectId || null,
            client_id: clientId || null,
          },
          ctx
        );
        actions.meetings += 1;
      } catch (error) {
        console.warn("[ingestion] reunião falhou:", error.message);
      }
    }
  }

  // Anexa os arquivos originais à entidade resultante.
  const attachType = projectId ? "project" : "client";
  const attachId = projectId || clientId;
  if (attachId) {
    for (const file of files) {
      try {
        await mediaService.uploadFile({ file, entityType: attachType, entityId: attachId, kind: "attachment", ctx });
        actions.files += 1;
      } catch (error) {
        console.warn("[ingestion] anexo falhou:", error.message);
      }
    }
  }

  // Alimenta os fatos do RAG (regex, sem custo de LLM).
  try {
    const sourceText = await extractTextFromFiles(files);
    if (sourceText && (clientId || projectId)) {
      await factExtraction.upsertFacts({
        tenantId,
        clientId,
        projectId,
        sourceChannel: "upload",
        text: sourceText,
        skipLlm: true,
      });
    }
  } catch (error) {
    console.warn("[ingestion] facts falhou:", error.message);
  }

  return { client_id: clientId, project_id: projectId, actions };
}

module.exports = {
  analyze,
  analyzeText,
  apply,
  extractTextFromFile,
  extractTextFromFiles,
  normalizeProposal,
};
