const agendaService = require("../../agenda/agenda.service");
const { AGENDA_STATUSES } = require("../../../config/constants");

const STATUS_LABELS = {
  scheduled: "Agendado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function toAgendaEntity(event) {
  if (!event) return null;
  const json = typeof event.toJSON === "function" ? event.toJSON() : event;
  const when = json.starts_at_display?.localFormatted || json.starts_at || null;
  return {
    type: "agenda",
    id: json.id,
    title: json.title,
    subtitle: when,
    status: json.status,
    status_label: STATUS_LABELS[json.status] || json.status || "—",
    color: "#0ea5e9",
    icon: "agenda",
    meta: {
      starts_at: json.starts_at_display?.local || json.starts_at || null,
      starts_at_label: when,
      ends_at: json.ends_at_display?.local || json.ends_at || null,
      all_day: Boolean(json.all_day),
      client: json.client?.name || null,
      project: json.project?.name || null,
    },
    open: { kind: "agenda", id: json.id, name: json.title },
  };
}

function toAgendaDigest(entity) {
  if (!entity) return null;
  return {
    id: entity.id,
    title: entity.title,
    when: entity.meta?.starts_at_label,
    status: entity.status,
    client: entity.meta?.client,
    project: entity.meta?.project,
  };
}

async function resolveEventByIdOrTitle({ event_id, title }, ctx) {
  if (event_id) {
    return agendaService.getEventById(event_id, ctx);
  }
  if (title) {
    // Janela ampla para localizar por título (listEvents filtra por intervalo de datas).
    const events = await agendaService.listEvents(
      { from: "2000-01-01T00:00", to: "2100-01-01T00:00" },
      ctx
    );
    const exact = events.find((e) => e.title?.toLowerCase() === String(title).toLowerCase());
    return exact || events.find((e) => e.title?.toLowerCase().includes(String(title).toLowerCase())) || null;
  }
  return null;
}

const definitions = [
  {
    type: "function",
    function: {
      name: "list_agenda",
      description:
        "Lista eventos/compromissos da agenda. Por padrão lista o mês atual; passe 'from' e 'to' (YYYY-MM-DD) para outro período (ex.: próximos 30 dias). Retorna os eventos como cards.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Data inicial YYYY-MM-DD (ou ISO)." },
          to: { type: "string", description: "Data final YYYY-MM-DD (ou ISO)." },
          status: { type: "string", enum: AGENDA_STATUSES },
          client_id: { type: "string" },
          project_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_agenda_event",
      description:
        "Cria um evento/compromisso na agenda. Requer título e data/hora de início (starts_at). Não permite datas passadas.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título do evento (obrigatório)." },
          starts_at: {
            type: "string",
            description: "Início no formato ISO local, ex.: 2026-06-10T14:00 (obrigatório).",
          },
          ends_at: { type: "string", description: "Fim (ISO local), opcional." },
          all_day: { type: "boolean", description: "Evento de dia inteiro." },
          description: { type: "string" },
          client_id: { type: "string" },
          project_id: { type: "string" },
          reminder_minutes_before: { type: "number", description: "Lembrete X minutos antes." },
        },
        required: ["title", "starts_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_agenda_event",
      description: "Edita um evento da agenda. Identifique por event_id ou title.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          title: { type: "string", description: "Título atual para localizar (use new_title para renomear)." },
          new_title: { type: "string" },
          starts_at: { type: "string" },
          ends_at: { type: "string" },
          status: { type: "string", enum: AGENDA_STATUSES },
          description: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_agenda_event",
      description: "Exclui um evento da agenda. Ação destrutiva — pede confirmação. Identifique por event_id ou title.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          title: { type: "string" },
        },
      },
    },
  },
];

const tools = {
  list_agenda: {
    kind: "read",
    async run(args = {}, ctx) {
      const query = {};
      if (args.from) query.from = args.from;
      if (args.to) query.to = args.to;
      if (args.status) query.status = args.status;
      if (args.client_id) query.client_id = args.client_id;
      if (args.project_id) query.project_id = args.project_id;

      const events = await agendaService.listEvents(query, ctx);
      const entities = events.map(toAgendaEntity).filter(Boolean).slice(0, 50);
      return {
        summary: {
          total: events.length,
          returned: entities.length,
          period: { from: args.from || "início do mês", to: args.to || "fim do mês" },
          events: entities.map(toAgendaDigest),
        },
        entities,
      };
    },
  },

  create_agenda_event: {
    kind: "write",
    async build(args = {}, ctx) {
      const payload = {
        title: String(args.title || "").trim(),
        starts_at: args.starts_at || null,
        ends_at: args.ends_at || null,
        all_day: args.all_day ?? false,
        description: args.description || null,
        client_id: args.client_id || null,
        project_id: args.project_id || null,
        reminder_minutes_before: args.reminder_minutes_before ?? null,
      };
      const missing = [];
      if (!payload.title) missing.push("título");
      if (!payload.starts_at) missing.push("data/hora de início");
      return {
        action: {
          type: "agenda_create",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: `Agendar "${payload.title || "?"}"`,
          summary: missing.length
            ? `Faltam dados para o evento: ${missing.join(", ")}.`
            : `Vou criar o evento "${payload.title}"${payload.starts_at ? ` em ${payload.starts_at}` : ""}.`,
          payload,
        },
      };
    },
  },

  update_agenda_event: {
    kind: "write",
    async build(args = {}, ctx) {
      const event = await resolveEventByIdOrTitle(
        { event_id: args.event_id, title: args.title },
        ctx
      );
      if (!event) {
        return {
          action: {
            type: "agenda_update",
            status: "needs_input",
            missing: ["evento a editar"],
            label: "Editar evento",
            summary: "Não encontrei esse evento na agenda.",
            payload: {},
          },
        };
      }
      const changes = {};
      if (args.new_title) changes.title = String(args.new_title).trim();
      if (args.starts_at) changes.starts_at = args.starts_at;
      if (args.ends_at !== undefined) changes.ends_at = args.ends_at;
      if (args.status) changes.status = args.status;
      if (args.description !== undefined) changes.description = args.description;

      const entity = toAgendaEntity(event);
      return {
        action: {
          type: "agenda_update",
          status: Object.keys(changes).length ? "ready" : "needs_input",
          missing: Object.keys(changes).length ? [] : ["o que alterar"],
          label: `Editar evento "${event.title}"`,
          summary: Object.keys(changes).length
            ? `Vou atualizar "${event.title}" (${Object.keys(changes).join(", ")}).`
            : `O que você quer alterar no evento "${event.title}"?`,
          payload: { id: event.id, changes },
          preview_entity: entity,
        },
      };
    },
  },

  delete_agenda_event: {
    kind: "write",
    async build(args = {}, ctx) {
      const event = await resolveEventByIdOrTitle(
        { event_id: args.event_id, title: args.title },
        ctx
      );
      if (!event) {
        return {
          action: {
            type: "agenda_delete",
            status: "needs_input",
            missing: ["evento a excluir"],
            label: "Excluir evento",
            summary: "Não encontrei esse evento na agenda.",
            payload: {},
          },
        };
      }
      const entity = toAgendaEntity(event);
      return {
        action: {
          type: "agenda_delete",
          status: "ready",
          destructive: true,
          label: `Excluir evento "${event.title}"`,
          summary: `Isto vai excluir o evento "${event.title}"${
            entity.subtitle ? ` (${entity.subtitle})` : ""
          }.`,
          payload: { id: event.id, title: event.title },
          preview_entity: entity,
        },
      };
    },
  },
};

module.exports = { definitions, tools, toAgendaEntity };
