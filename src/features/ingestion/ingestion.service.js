const { Op } = require("sequelize");
const { PDFParse } = require("pdf-parse");
const JSZip = require("jszip");
const { Client } = require("../../models");
const AppError = require("../../utils/app-error");
const aiRuntime = require("../settings/ai-runtime.service");
const clientsService = require("../clients/clients.service");
const projectsService = require("../projects/projects.service");
const projectDetailsService = require("../project-details/project-details.service");
const mediaService = require("../media/media.service");
const factExtraction = require("../../rag/fact-extraction.service");
const {
  PROJECT_STATUSES,
  PROJECT_ORIGINS,
  PROJECT_PRIORITIES,
  DETAIL_CATEGORIES,
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
    return String(result?.text || "").replace(/\s+/g, " ").trim();
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
  "summary": string
}

Regras:
- Extraia TODAS as informações úteis e NÃO esqueça nada relevante: dados do cliente, do projeto, escopo, links, repositórios, deploy, ambiente, stack/tecnologias e CREDENCIAIS (senhas, tokens, api keys, usuários/logins, strings de conexão).
- ORIGEM/plataforma: se o conteúdo vier do 99Freelas defina origin="99freelas"; se for Workana, "workana"; senão "own". Quando houver, capture o LINK do projeto na plataforma e o LINK do chat como details com category="links" (labels "Link do projeto na plataforma" e "Link do chat").
- CLIENTE: coloque CPF em client.cpf e CNPJ em client.cnpj (o cliente pode ter os dois). Observações do cliente vão em client.notes.
- SEPARE bem por category: tecnologias/stack → "environment" (label "Stack" ou "Tecnologias"); URLs e links → "links"; passos/instruções de deploy → "deployment"; escopo/requisitos → "scope"; documentação → "documentation"; o resto → "custom". Não jogue tudo em "custom".
- Marque is_secret=true e category="credentials" para qualquer segredo (senha, token, chave, secret, login com senha, connection string).
- "label" é um rótulo curto legível (ex.: "Senha do banco", "Repositório GitHub", "URL de produção", "Stack"). "value" é o valor literal encontrado.
- Não duplique itens. Responda em português. Retorne apenas o JSON.`;

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

function normalizeProposal(raw) {
  const safe = raw && typeof raw === "object" ? raw : {};
  return {
    client: normalizeClient(safe.client),
    project: normalizeProject(safe.project),
    details: normalizeDetails(safe.details),
    summary: cleanString(safe.summary, 4000) || "",
  };
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

  if (!(await aiRuntime.isConfiguredForTenant(tenantId))) {
    throw new AppError(
      "IA não configurada. Configure em Configurações → IA para usar a importação inteligente.",
      400,
      "AI_NOT_CONFIGURED"
    );
  }

  let proposal;
  try {
    const completion = await aiRuntime.createChatCompletion(tenantId, {
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 2200,
    });
    proposal = normalizeProposal(parseJsonLoose(completion.content));
  } catch (error) {
    throw new AppError(`Falha ao analisar com a IA: ${error.message}`, 502, "AI_EXTRACTION_FAILED");
  }

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

async function apply({ proposal, target = {}, files = [], tenantId, userId, role }) {
  const ctx = { tenantId, userId, role };
  const safe = normalizeProposal(proposal);

  let clientId = null;
  let projectId = null;
  const actions = { client: null, project: null, details: 0, files: 0 };

  if (target.project_id) {
    const project = await projectsService.getProjectById(target.project_id, {}, ctx);
    projectId = project.id;
    clientId = project.client_id;

    const pPayload = projectPayload(safe.project);
    if (Object.keys(pPayload).length) {
      await projectsService.updateProject(projectId, pPayload, ctx);
      actions.project = "updated";
    }
    const cPayload = clientPayload(safe.client);
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

    const cPayload = clientPayload(safe.client);
    if (Object.keys(cPayload).length) {
      await clientsService.updateClient(clientId, cPayload, ctx);
      actions.client = "updated";
    }
    if (safe.project?.name) {
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
    for (const detail of safe.details) {
      try {
        await projectDetailsService.upsertDetailByKey(projectId, detail, ctx);
        actions.details += 1;
      } catch (error) {
        console.warn("[ingestion] detalhe falhou:", error.message);
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
  apply,
  extractTextFromFiles,
  normalizeProposal,
};
