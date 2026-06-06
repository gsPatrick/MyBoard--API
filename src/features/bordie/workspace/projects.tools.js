const projectsService = require("../../projects/projects.service");
const clientsService = require("../../clients/clients.service");
const { PROJECT_STATUSES, PROJECT_PRIORITIES } = require("../../../config/constants");

const STATUS_LABELS = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  paused: "Pausado",
};

const STATUS_ALIASES = {
  ativo: "in_progress",
  ativos: "in_progress",
  active: "in_progress",
  andamento: "in_progress",
  arquivado: "completed",
  archived: "completed",
  concluido: "completed",
  concluído: "completed",
  finalizado: "completed",
  pausado: "paused",
  cancelado: "cancelled",
  rascunho: "draft",
};

function resolveStatusFilter(status) {
  if (!status) return null;
  const key = String(status).trim().toLowerCase();
  if (PROJECT_STATUSES.includes(key)) return key;
  return STATUS_ALIASES[key] || null;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

// Transforma um projeto (model JSON) num "entity" leve que o frontend renderiza como card.
function toProjectEntity(project) {
  if (!project) return null;
  const json = typeof project.toJSON === "function" ? project.toJSON() : project;
  return {
    type: "project",
    id: json.id,
    title: json.name,
    subtitle: json.client?.name || json.client?.company || null,
    status: json.status,
    status_label: statusLabel(json.status),
    color: json.color || "#3b82f6",
    icon: "project",
    // Avatar do cliente dono — passado cru para o frontend resolver com resolveMediaUrl.
    client_avatar: json.client?.avatar
      ? {
          public_url: json.client.avatar.public_url || null,
          storage_path: json.client.avatar.storage_path || null,
        }
      : null,
    meta: {
      priority: json.priority || null,
      due_date: json.due_date || null,
      has_deadline: Boolean(json.has_deadline),
      budget: json.budget != null ? Number(json.budget) : null,
      folder: json.folder?.name || null,
      client_id: json.client_id || null,
      client_name: json.client?.name || null,
    },
    open: { kind: "project", id: json.id, name: json.name },
  };
}

// Representação mínima passada de volta ao modelo (texto), sem inflar tokens.
function toProjectDigest(entity) {
  if (!entity) return null;
  return {
    id: entity.id,
    name: entity.title,
    client: entity.subtitle,
    status: entity.status,
    priority: entity.meta?.priority,
    due_date: entity.meta?.due_date,
  };
}

async function resolveProjectByIdOrName({ project_id, name }, ctx) {
  if (project_id) {
    return projectsService.getProjectById(project_id, { includeDetails: false }, ctx);
  }
  if (name) {
    const { items } = await projectsService.listProjects(
      { search: name, limit: 5, include_inactive: "true", include_hidden: "true" },
      ctx
    );
    const exact = items.find((p) => p.name?.toLowerCase() === String(name).toLowerCase());
    return exact || items[0] || null;
  }
  return null;
}

const definitions = [
  {
    type: "function",
    function: {
      name: "list_projects",
      description:
        "Lista e conta projetos do workspace. Use para perguntas como 'quantos projetos ativos tenho', 'meus projetos do cliente X' ou 'projetos atrasados'. Retorna a contagem total e os projetos como cards.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Filtro de status. Aceita: ativo/in_progress, concluido/completed, pausado/paused, cancelado/cancelled, rascunho/draft. Omita para todos.",
          },
          client_id: { type: "string", description: "Filtrar por cliente (id)." },
          search: { type: "string", description: "Busca por nome/descrição do projeto." },
          priority: {
            type: "string",
            enum: PROJECT_PRIORITIES,
            description: "Filtrar por prioridade.",
          },
          limit: { type: "number", description: "Máximo de cards a retornar (padrão 20, máx 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project",
      description:
        "Busca um projeto específico por id ou nome e retorna os detalhes como card.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Id do projeto." },
          name: { type: "string", description: "Nome do projeto (se não souber o id)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Cria um novo projeto. Requer um cliente (client_id ou client_name). Use quando o usuário pedir para criar/abrir um projeto.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do projeto (obrigatório)." },
          client_id: { type: "string", description: "Id do cliente dono do projeto." },
          client_name: {
            type: "string",
            description: "Nome do cliente (se não souber o id; será resolvido).",
          },
          description: { type: "string", description: "Descrição do projeto." },
          status: { type: "string", description: "Status inicial (padrão em andamento)." },
          priority: { type: "string", enum: PROJECT_PRIORITIES },
          due_date: { type: "string", description: "Prazo (YYYY-MM-DD). Se enviado, vira deadline." },
          budget: { type: "number", description: "Orçamento em reais." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project",
      description:
        "Edita um projeto existente (nome, status, prioridade, prazo, descrição, orçamento). Identifique por project_id ou name.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          name: { type: "string", description: "Nome atual para localizar OU novo nome (use new_name para renomear)." },
          new_name: { type: "string", description: "Novo nome do projeto." },
          status: { type: "string" },
          priority: { type: "string", enum: PROJECT_PRIORITIES },
          description: { type: "string" },
          due_date: { type: "string", description: "Novo prazo (YYYY-MM-DD)." },
          budget: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_project",
      description:
        "Exclui um projeto. Ação destrutiva — sempre pede confirmação. Identifique por project_id ou name.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          name: { type: "string", description: "Nome do projeto a excluir." },
        },
      },
    },
  },
];

const tools = {
  list_projects: {
    kind: "read",
    async run(args = {}, ctx) {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const filters = { limit, include_hidden: "false" };
      const status = resolveStatusFilter(args.status);
      if (status) filters.status = status;
      if (args.client_id) filters.client_id = args.client_id;
      if (args.search) filters.search = args.search;
      if (args.priority) filters.priority = args.priority;

      const { items, meta } = await projectsService.listProjects(filters, ctx);
      const entities = items.map(toProjectEntity).filter(Boolean);

      return {
        summary: {
          total: meta.total,
          returned: entities.length,
          status_filter: status || "todos",
          projects: entities.map(toProjectDigest),
        },
        entities,
      };
    },
  },

  get_project: {
    kind: "read",
    async run(args = {}, ctx) {
      const project = await resolveProjectByIdOrName(args, ctx);
      if (!project) {
        return { summary: { found: false, message: "Projeto não encontrado." }, entities: [] };
      }
      const entity = toProjectEntity(project);
      return { summary: { found: true, project: toProjectDigest(entity) }, entities: [entity] };
    },
  },

  create_project: {
    kind: "write",
    async build(args = {}, ctx) {
      let clientId = args.client_id || null;
      let clientName = args.client_name || null;

      if (!clientId && clientName) {
        const { items } = await clientsService.listClients({ search: clientName, limit: 5 }, ctx);
        const match =
          items.find((c) => c.name?.toLowerCase() === clientName.toLowerCase()) || items[0];
        if (match) {
          clientId = match.id;
          clientName = match.name;
        }
      }

      const payload = {
        name: String(args.name || "").trim(),
        client_id: clientId,
        description: args.description || null,
        status: resolveStatusFilter(args.status) || undefined,
        priority: args.priority || undefined,
        budget: args.budget != null ? args.budget : undefined,
      };
      if (args.due_date) {
        payload.has_deadline = true;
        payload.due_date = args.due_date;
      }

      const missing = [];
      if (!payload.name) missing.push("nome do projeto");
      if (!payload.client_id) missing.push("cliente");

      return {
        action: {
          type: "project_create",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: `Criar projeto "${payload.name || "?"}"${clientName ? ` para ${clientName}` : ""}`,
          summary: missing.length
            ? `Faltam dados para criar o projeto: ${missing.join(", ")}.`
            : `Vou criar o projeto "${payload.name}"${clientName ? ` para o cliente ${clientName}` : ""}.`,
          payload,
        },
      };
    },
  },

  update_project: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProjectByIdOrName(
        { project_id: args.project_id, name: args.name },
        ctx
      );
      if (!project) {
        return {
          action: {
            type: "project_update",
            status: "needs_input",
            missing: ["projeto a editar"],
            label: "Editar projeto",
            summary: "Não encontrei o projeto que você quer editar. Diga o nome exato ou o id.",
            payload: {},
          },
        };
      }

      const changes = {};
      if (args.new_name) changes.name = String(args.new_name).trim();
      if (args.status) {
        const st = resolveStatusFilter(args.status);
        if (st) changes.status = st;
      }
      if (args.priority) changes.priority = args.priority;
      if (args.description !== undefined) changes.description = args.description;
      if (args.budget !== undefined) changes.budget = args.budget;
      if (args.due_date) {
        changes.has_deadline = true;
        changes.due_date = args.due_date;
      }

      const entity = toProjectEntity(project);
      return {
        action: {
          type: "project_update",
          status: Object.keys(changes).length ? "ready" : "needs_input",
          missing: Object.keys(changes).length ? [] : ["o que alterar"],
          label: `Editar projeto "${project.name}"`,
          summary: Object.keys(changes).length
            ? `Vou atualizar "${project.name}" (${Object.keys(changes).join(", ")}).`
            : `O que você quer alterar em "${project.name}"?`,
          payload: { id: project.id, changes },
          preview_entity: entity,
        },
      };
    },
  },

  delete_project: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProjectByIdOrName(
        { project_id: args.project_id, name: args.name },
        ctx
      );
      if (!project) {
        return {
          action: {
            type: "project_delete",
            status: "needs_input",
            missing: ["projeto a excluir"],
            label: "Excluir projeto",
            summary: "Não encontrei esse projeto. Confirme o nome exato.",
            payload: {},
          },
        };
      }
      const entity = toProjectEntity(project);
      return {
        action: {
          type: "project_delete",
          status: "ready",
          destructive: true,
          label: `Excluir projeto "${project.name}"`,
          summary: `Isto vai excluir permanentemente o projeto "${project.name}"${
            entity.subtitle ? ` (cliente ${entity.subtitle})` : ""
          }.`,
          payload: { id: project.id, name: project.name },
          preview_entity: entity,
        },
      };
    },
  },
};

module.exports = { definitions, tools, toProjectEntity, statusLabel };
