const demandsService = require("../../project-demands/project-demands.service");
const { DEMAND_STATUSES } = require("../../../config/constants");
const { resolveProject } = require("./resolve");

const STATUS_LABELS = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluída",
  cancelled: "Cancelada",
};

const STATUS_ALIASES = {
  pendente: "pending",
  andamento: "in_progress",
  fazendo: "in_progress",
  concluida: "done",
  concluída: "done",
  concluido: "done",
  feita: "done",
  feito: "done",
  pronta: "done",
  cancelada: "cancelled",
  cancelado: "cancelled",
};

function resolveStatus(status) {
  if (!status) return null;
  const k = String(status).trim().toLowerCase();
  if (DEMAND_STATUSES.includes(k)) return k;
  return STATUS_ALIASES[k] || null;
}

function toDemandEntity(demand) {
  const json = typeof demand.toJSON === "function" ? demand.toJSON() : demand;
  const projectName = json.project?.name || null;
  return {
    type: "demand",
    id: json.id,
    title: json.title,
    subtitle: projectName,
    status: json.status,
    status_label: STATUS_LABELS[json.status] || json.status,
    color: "#f59e0b",
    icon: "demand",
    project_id: json.project_id || null,
    open: json.project_id ? { kind: "project", id: json.project_id, name: projectName } : null,
  };
}

async function findDemand(project, { demand_id, title }, ctx) {
  if (!project) return null;
  const list = await demandsService.listDemands(project.id, {}, ctx);
  if (demand_id) return list.find((d) => d.id === demand_id) || null;
  if (title) {
    const t = String(title).toLowerCase();
    return (
      list.find((d) => d.title?.toLowerCase() === t) ||
      list.find((d) => d.title?.toLowerCase().includes(t)) ||
      null
    );
  }
  return null;
}

const definitions = [
  {
    type: "function",
    function: {
      name: "list_demands",
      description:
        "Lista tarefas/demandas (o que falta fazer) de um projeto ou do workspace. Use para 'o que falta no projeto X', 'minhas tarefas pendentes'.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          status: { type: "string", description: "pendente, em andamento, concluída, cancelada." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_demand",
      description: "Cria uma tarefa/demanda em um projeto. Use para 'adiciona a tarefa Y no projeto X'.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          title: { type: "string", description: "Título da tarefa (obrigatório)." },
          description: { type: "string" },
          status: { type: "string", description: "Status inicial (padrão pendente)." },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_demand",
      description:
        "Edita uma tarefa (status/título). Use para 'marca a tarefa Y como concluída'. Identifique por demand_id ou pelo título dentro do projeto.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          demand_id: { type: "string" },
          title: { type: "string", description: "Título atual para localizar (use new_title para renomear)." },
          new_title: { type: "string" },
          status: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_demand",
      description: "Exclui uma tarefa. Ação destrutiva (pede confirmação).",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          demand_id: { type: "string" },
          title: { type: "string" },
        },
      },
    },
  },
];

const tools = {
  list_demands: {
    kind: "read",
    async run(args = {}, ctx) {
      const status = resolveStatus(args.status);
      let project = null;
      let list = [];

      if (args.project_id || args.project_name) {
        project = await resolveProject({ project_id: args.project_id, name: args.project_name }, ctx);
        if (project) {
          const q = status ? { status } : {};
          list = await demandsService.listDemands(project.id, q, ctx);
        }
      } else {
        const q = status ? { status } : {};
        list = await demandsService.listDemandsForTenant(q, ctx);
      }

      const entities = (list || []).map(toDemandEntity).slice(0, 30);
      return {
        summary: {
          project: project?.name || "todos",
          total: (list || []).length,
          status: status || "todas",
          demands: entities.map((e) => ({ id: e.id, title: e.title, status: e.status })),
        },
        entities,
      };
    },
  },

  create_demand: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      const title = String(args.title || "").trim();
      const missing = [];
      if (!project) missing.push("projeto");
      if (!title) missing.push("título da tarefa");

      return {
        action: {
          type: "demand_create",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: missing.length ? "Criar tarefa" : `Criar tarefa "${title}"`,
          summary: missing.length
            ? `Faltam dados: ${missing.join(", ")}.`
            : `Vou criar a tarefa "${title}" no projeto "${project.name}".`,
          payload: {
            project_id: project?.id || null,
            title,
            description: args.description || null,
            status: resolveStatus(args.status) || undefined,
          },
        },
      };
    },
  },

  update_demand: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      const demand = await findDemand(project, { demand_id: args.demand_id, title: args.title }, ctx);
      if (!project || !demand) {
        return {
          action: {
            type: "demand_update",
            status: "needs_input",
            missing: ["tarefa a editar"],
            label: "Editar tarefa",
            summary: "Não encontrei essa tarefa. Diga o projeto e o título.",
            payload: {},
          },
        };
      }
      const changes = {};
      if (args.new_title) changes.title = String(args.new_title).trim();
      const st = resolveStatus(args.status);
      if (st) changes.status = st;

      return {
        action: {
          type: "demand_update",
          status: Object.keys(changes).length ? "ready" : "needs_input",
          missing: Object.keys(changes).length ? [] : ["o que alterar"],
          label: `Editar tarefa "${demand.title}"`,
          summary: Object.keys(changes).length
            ? `Vou atualizar "${demand.title}"${changes.status ? ` para ${STATUS_LABELS[changes.status]}` : ""}.`
            : `O que alterar na tarefa "${demand.title}"?`,
          payload: { project_id: project.id, demand_id: demand.id, changes },
        },
      };
    },
  },

  delete_demand: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      const demand = await findDemand(project, { demand_id: args.demand_id, title: args.title }, ctx);
      if (!project || !demand) {
        return {
          action: {
            type: "demand_delete",
            status: "needs_input",
            missing: ["tarefa a excluir"],
            label: "Excluir tarefa",
            summary: "Não encontrei essa tarefa.",
            payload: {},
          },
        };
      }
      return {
        action: {
          type: "demand_delete",
          status: "ready",
          destructive: true,
          label: `Excluir tarefa "${demand.title}"`,
          summary: `Isto vai excluir a tarefa "${demand.title}" do projeto "${project.name}".`,
          payload: { project_id: project.id, demand_id: demand.id, title: demand.title },
        },
      };
    },
  },
};

module.exports = { definitions, tools, toDemandEntity };
