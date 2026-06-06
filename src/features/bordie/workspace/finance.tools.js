const financialService = require("../../project-financial/project-financial.service");
const { FINANCIAL_ENTRY_TYPES } = require("../../../config/constants");
const { resolveProject, resolveClient } = require("./resolve");

const TYPE_LABELS = {
  entrada: "Entrada",
  adiantamento: "Adiantamento",
  sprint: "Sprint",
  parcela: "Parcela",
  final: "Final",
  outro: "Outro",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toFinanceEntity(entry) {
  const json = typeof entry.toJSON === "function" ? entry.toJSON() : entry;
  const projectName = json.project?.name || null;
  return {
    type: "finance",
    id: json.id,
    title: json.title,
    subtitle: projectName,
    amount: toAmount(json.amount),
    status: json.entry_type,
    status_label: TYPE_LABELS[json.entry_type] || json.entry_type,
    date: json.entry_date,
    color: "#22c55e",
    icon: "finance",
    open: json.project_id ? { kind: "project", id: json.project_id, name: projectName } : null,
  };
}

const definitions = [
  {
    type: "function",
    function: {
      name: "list_finance",
      description:
        "Lista lançamentos financeiros e soma totais. Use para 'quanto recebi esse mês', 'quanto já recebi do projeto X', 'quanto falta receber do cliente Y'. Pode filtrar por projeto, cliente e período.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string", description: "Nome do projeto (resolve o id)." },
          client_id: { type: "string" },
          client_name: { type: "string", description: "Nome do cliente." },
          from: { type: "string", description: "Data inicial YYYY-MM-DD." },
          to: { type: "string", description: "Data final YYYY-MM-DD." },
          entry_type: { type: "string", enum: FINANCIAL_ENTRY_TYPES },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_finance_entry",
      description:
        "Registra um lançamento financeiro (valor recebido) em um projeto. Use para 'lança R$500 no projeto X', 'recebi 1500 do projeto Y'.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          amount: { type: "number", description: "Valor em reais (obrigatório)." },
          title: { type: "string", description: "Descrição curta do lançamento." },
          entry_type: { type: "string", enum: FINANCIAL_ENTRY_TYPES, description: "Padrão: entrada." },
          entry_date: { type: "string", description: "Data YYYY-MM-DD (padrão: hoje)." },
          description: { type: "string" },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_finance_entry",
      description: "Exclui um lançamento financeiro. Ação destrutiva (pede confirmação).",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          entry_id: { type: "string", description: "Id do lançamento." },
        },
        required: ["entry_id"],
      },
    },
  },
];

const tools = {
  list_finance: {
    kind: "read",
    async run(args = {}, ctx) {
      const query = {};
      let projectName = null;
      let project = null;

      if (args.project_id || args.project_name) {
        project = await resolveProject({ project_id: args.project_id, name: args.project_name }, ctx);
        if (project) {
          query.project_id = project.id;
          projectName = project.name;
        }
      }
      if (!query.project_id && (args.client_id || args.client_name)) {
        const client = await resolveClient({ client_id: args.client_id, name: args.client_name }, ctx);
        if (client) query.client_id = client.id;
      }
      if (args.from) query.from = args.from;
      if (args.to) query.to = args.to;
      if (args.entry_type) query.entry_type = args.entry_type;

      const entries = await financialService.listEntriesForTenant(query, ctx);
      const list = entries || [];
      const entities = list.map(toFinanceEntity).slice(0, 30);
      const total = list.reduce((sum, e) => sum + toAmount(e.amount ?? e.get?.("amount")), 0);

      const summary = {
        total_recebido: total,
        lancamentos: list.length,
        periodo: { from: args.from || null, to: args.to || null },
      };
      if (project) {
        const budget = toAmount(project.budget);
        summary.projeto = projectName;
        summary.orcamento = budget || null;
        if (budget) summary.falta_receber = Math.max(0, budget - total);
      }

      return { summary, entities };
    },
  },

  create_finance_entry: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      const amount = toAmount(args.amount);
      const missing = [];
      if (!project) missing.push("projeto");
      if (!(amount > 0)) missing.push("valor");

      const entryType = FINANCIAL_ENTRY_TYPES.includes(args.entry_type) ? args.entry_type : "entrada";
      const payload = {
        project_id: project?.id || null,
        amount,
        title: args.title?.trim() || `Lançamento ${TYPE_LABELS[entryType]}`,
        entry_type: entryType,
        entry_date: args.entry_date || todayISO(),
        description: args.description || null,
      };

      return {
        action: {
          type: "finance_create",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: missing.length
            ? "Lançar valor"
            : `Lançar R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em "${project.name}"`,
          summary: missing.length
            ? `Faltam dados: ${missing.join(", ")}.`
            : `Vou registrar R$ ${amount.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })} (${TYPE_LABELS[entryType]}) no projeto "${project.name}".`,
          payload,
        },
      };
    },
  },

  delete_finance_entry: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      if (!project || !args.entry_id) {
        return {
          action: {
            type: "finance_delete",
            status: "needs_input",
            missing: ["projeto e lançamento"],
            label: "Excluir lançamento",
            summary: "Diga o projeto e qual lançamento excluir.",
            payload: {},
          },
        };
      }
      return {
        action: {
          type: "finance_delete",
          status: "ready",
          destructive: true,
          label: "Excluir lançamento financeiro",
          summary: `Isto vai excluir um lançamento do projeto "${project.name}".`,
          payload: { project_id: project.id, entry_id: args.entry_id },
        },
      };
    },
  },
};

module.exports = { definitions, tools, toFinanceEntity };
