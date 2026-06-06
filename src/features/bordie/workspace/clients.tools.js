const clientsService = require("../../clients/clients.service");
const { CLIENT_STATUSES, IMPORTANCE_LEVELS } = require("../../../config/constants");

const STATUS_LABELS = { active: "Ativo", inactive: "Inativo" };

function toClientEntity(client) {
  if (!client) return null;
  const json = typeof client.toJSON === "function" ? client.toJSON() : client;
  return {
    type: "client",
    id: json.id,
    title: json.name,
    subtitle: json.company || json.email || json.phone || null,
    status: json.status,
    status_label: STATUS_LABELS[json.status] || json.status || "—",
    color: "#8b5cf6",
    icon: "client",
    // avatar passado cru para o frontend resolver com getClientAvatarUrl({ avatar }).
    avatar: json.avatar
      ? { public_url: json.avatar.public_url || null, storage_path: json.avatar.storage_path || null }
      : null,
    meta: {
      email: json.email || null,
      phone: json.phone || null,
      company: json.company || null,
      importance_level: json.importance_level || null,
    },
    open: { kind: "client", id: json.id, name: json.name },
  };
}

function toClientDigest(entity) {
  if (!entity) return null;
  return {
    id: entity.id,
    name: entity.title,
    company: entity.meta?.company,
    email: entity.meta?.email,
    status: entity.status,
  };
}

async function resolveClientByIdOrName({ client_id, name }, ctx) {
  if (client_id) {
    return clientsService.getClientById(client_id, ctx);
  }
  if (name) {
    const { items } = await clientsService.listClients(
      { search: name, limit: 5, include_inactive: "true", include_hidden: "true" },
      ctx
    );
    const exact = items.find(
      (c) => c.name?.toLowerCase() === String(name).toLowerCase()
    );
    return exact || items[0] || null;
  }
  return null;
}

const definitions = [
  {
    type: "function",
    function: {
      name: "list_clients",
      description:
        "Lista e conta clientes do workspace. Use para 'quantos clientes tenho', 'meus clientes ativos' ou buscar um cliente. Retorna contagem total e cards.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: CLIENT_STATUSES, description: "active ou inactive." },
          search: { type: "string", description: "Busca por nome, e-mail ou empresa." },
          importance_level: { type: "string", enum: IMPORTANCE_LEVELS },
          limit: { type: "number", description: "Máximo de cards (padrão 20, máx 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client",
      description: "Busca um cliente por id ou nome e retorna os detalhes como card.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          name: { type: "string", description: "Nome do cliente." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Cadastra um novo cliente. Use quando o usuário pedir para criar/adicionar um cliente.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do cliente (obrigatório)." },
          email: { type: "string" },
          company: { type: "string", description: "Empresa." },
          phone: { type: "string" },
          importance_level: { type: "string", enum: IMPORTANCE_LEVELS },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Edita um cliente existente. Identifique por client_id ou name.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          name: { type: "string", description: "Nome atual para localizar (use new_name para renomear)." },
          new_name: { type: "string" },
          email: { type: "string" },
          company: { type: "string" },
          phone: { type: "string" },
          status: { type: "string", enum: CLIENT_STATUSES },
          importance_level: { type: "string", enum: IMPORTANCE_LEVELS },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_client",
      description:
        "Exclui um cliente. Ação destrutiva — pede confirmação. Falha se o cliente tiver projetos vinculados.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
];

const tools = {
  list_clients: {
    kind: "read",
    async run(args = {}, ctx) {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const filters = { limit };
      if (args.status) filters.status = args.status;
      if (args.search) filters.search = args.search;
      if (args.importance_level) filters.importance_level = args.importance_level;

      const { items, meta } = await clientsService.listClients(filters, ctx);
      const entities = items.map(toClientEntity).filter(Boolean);
      return {
        summary: {
          total: meta.total,
          returned: entities.length,
          clients: entities.map(toClientDigest),
        },
        entities,
      };
    },
  },

  get_client: {
    kind: "read",
    async run(args = {}, ctx) {
      const client = await resolveClientByIdOrName(args, ctx);
      if (!client) {
        return { summary: { found: false, message: "Cliente não encontrado." }, entities: [] };
      }
      const entity = toClientEntity(client);
      return { summary: { found: true, client: toClientDigest(entity) }, entities: [entity] };
    },
  },

  create_client: {
    kind: "write",
    async build(args = {}, ctx) {
      const payload = {
        name: String(args.name || "").trim(),
        email: args.email || null,
        company: args.company || null,
        phone: args.phone || null,
        importance_level: args.importance_level || undefined,
        notes: args.notes || null,
      };
      const missing = [];
      if (!payload.name) missing.push("nome do cliente");
      return {
        action: {
          type: "client_create",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: `Cadastrar cliente "${payload.name || "?"}"`,
          summary: missing.length
            ? `Faltam dados: ${missing.join(", ")}.`
            : `Vou cadastrar o cliente "${payload.name}"${payload.company ? ` (${payload.company})` : ""}.`,
          payload,
        },
      };
    },
  },

  update_client: {
    kind: "write",
    async build(args = {}, ctx) {
      const client = await resolveClientByIdOrName(
        { client_id: args.client_id, name: args.name },
        ctx
      );
      if (!client) {
        return {
          action: {
            type: "client_update",
            status: "needs_input",
            missing: ["cliente a editar"],
            label: "Editar cliente",
            summary: "Não encontrei esse cliente. Diga o nome exato ou o id.",
            payload: {},
          },
        };
      }
      const changes = {};
      if (args.new_name) changes.name = String(args.new_name).trim();
      if (args.email !== undefined) changes.email = args.email;
      if (args.company !== undefined) changes.company = args.company;
      if (args.phone !== undefined) changes.phone = args.phone;
      if (args.status) changes.status = args.status;
      if (args.importance_level) changes.importance_level = args.importance_level;

      const entity = toClientEntity(client);
      return {
        action: {
          type: "client_update",
          status: Object.keys(changes).length ? "ready" : "needs_input",
          missing: Object.keys(changes).length ? [] : ["o que alterar"],
          label: `Editar cliente "${client.name}"`,
          summary: Object.keys(changes).length
            ? `Vou atualizar "${client.name}" (${Object.keys(changes).join(", ")}).`
            : `O que você quer alterar em "${client.name}"?`,
          payload: { id: client.id, changes },
          preview_entity: entity,
        },
      };
    },
  },

  delete_client: {
    kind: "write",
    async build(args = {}, ctx) {
      const client = await resolveClientByIdOrName(
        { client_id: args.client_id, name: args.name },
        ctx
      );
      if (!client) {
        return {
          action: {
            type: "client_delete",
            status: "needs_input",
            missing: ["cliente a excluir"],
            label: "Excluir cliente",
            summary: "Não encontrei esse cliente. Confirme o nome exato.",
            payload: {},
          },
        };
      }
      const entity = toClientEntity(client);
      return {
        action: {
          type: "client_delete",
          status: "ready",
          destructive: true,
          label: `Excluir cliente "${client.name}"`,
          summary: `Isto vai excluir o cliente "${client.name}". Não é possível se houver projetos vinculados.`,
          payload: { id: client.id, name: client.name },
          preview_entity: entity,
        },
      };
    },
  },
};

module.exports = { definitions, tools, toClientEntity };
