const projectsService = require("../../projects/projects.service");
const agendaService = require("../../agenda/agenda.service");
const demandsService = require("../../project-demands/project-demands.service");
const { toProjectEntity } = require("./projects.tools");
const { toAgendaEntity } = require("./agenda.tools");
const { toDemandEntity } = require("./demands.tools");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const definitions = [
  {
    type: "function",
    function: {
      name: "workspace_overview",
      description:
        "Visão geral proativa do dia: compromissos de hoje, projetos atrasados e tarefas pendentes. Use para 'o que preciso saber hoje?', 'resumo do dia', 'tenho algo atrasado?'.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const tools = {
  workspace_overview: {
    kind: "read",
    async run(_args = {}, ctx) {
      const today = todayISO();

      const [todayEvents, activeProjects, pendingDemands] = await Promise.all([
        agendaService
          .listEvents({ from: `${today}T00:00`, to: `${today}T23:59`, status: "scheduled" }, ctx)
          .catch(() => []),
        projectsService
          .listProjects({ status: "in_progress", has_deadline: "true", limit: 100 }, ctx)
          .then((r) => r.items)
          .catch(() => []),
        demandsService.listDemandsForTenant({ status: "pending" }, ctx).catch(() => []),
      ]);

      const overdue = (activeProjects || []).filter(
        (p) => p.due_date && String(p.due_date).slice(0, 10) < today
      );

      const eventEntities = (todayEvents || []).map(toAgendaEntity);
      const overdueEntities = overdue.map(toProjectEntity);

      const entities = [...eventEntities, ...overdueEntities];

      return {
        summary: {
          data: today,
          eventos_hoje: eventEntities.length,
          projetos_atrasados: overdueEntities.length,
          tarefas_pendentes: (pendingDemands || []).length,
          note:
            "Os cards já aparecem na interface. Resuma em 1-2 frases o que é mais urgente e ofereça ajuda (reagendar, concluir tarefa, etc.).",
        },
        entities,
      };
    },
  },
};

module.exports = { definitions, tools };
