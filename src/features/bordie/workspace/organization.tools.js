const foldersService = require("../../folders/folders.service");
const tagsService = require("../../tags/tags.service");
const { resolveProject, resolveClient } = require("./resolve");

function toFolderEntity(folder) {
  const json = typeof folder.toJSON === "function" ? folder.toJSON() : folder;
  return {
    type: "folder",
    id: json.id,
    title: json.name,
    subtitle: null,
    color: json.color || "#8b5cf6",
    icon: "folder",
  };
}

function toTagEntity(tag) {
  const json = typeof tag.toJSON === "function" ? tag.toJSON() : tag;
  return {
    type: "tag",
    id: json.id,
    title: json.name,
    color: json.color || "#6366f1",
    icon: "tag",
  };
}

const definitions = [
  {
    type: "function",
    function: {
      name: "list_folders",
      description: "Lista as pastas do workspace. Use para 'quais pastas eu tenho'.",
      parameters: {
        type: "object",
        properties: { client_id: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Cria uma pasta no workspace.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome da pasta (obrigatório)." },
          color: { type: "string", description: "Cor hex (opcional)." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_project_to_folder",
      description: "Move um projeto para uma pasta (ou para a raiz). Use para 'move o projeto X pra pasta Y'.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          folder_name: { type: "string", description: "Nome da pasta de destino (ou 'raiz' para tirar da pasta)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tags",
      description: "Lista as tags disponíveis.",
      parameters: {
        type: "object",
        properties: { scope: { type: "string", enum: ["client", "project", "both"] } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tag_to_project",
      description:
        "Marca um projeto com uma tag (cria a tag se não existir). Use para 'marca o projeto X como urgente'.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_name: { type: "string" },
          tag_name: { type: "string", description: "Nome da tag (ex.: Urgente, VIP)." },
        },
        required: ["tag_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tag_to_client",
      description: "Marca um cliente com uma tag (cria se não existir). Use para 'marca o cliente X como VIP'.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          client_name: { type: "string" },
          tag_name: { type: "string" },
        },
        required: ["tag_name"],
      },
    },
  },
];

const tools = {
  list_folders: {
    kind: "read",
    async run(args = {}, ctx) {
      const query = {};
      if (args.client_id) query.client_id = args.client_id;
      const folders = await foldersService.listFolders(query, ctx);
      const entities = (folders || []).map(toFolderEntity);
      return {
        summary: { total: entities.length, folders: entities.map((e) => e.title) },
        entities,
      };
    },
  },

  list_tags: {
    kind: "read",
    async run(args = {}, ctx) {
      const query = {};
      if (args.scope) query.scope = args.scope;
      const tags = await tagsService.listTags(query, ctx);
      const entities = (tags || []).map(toTagEntity);
      return { summary: { total: entities.length, tags: entities.map((e) => e.title) }, entities };
    },
  },

  create_folder: {
    kind: "write",
    async build(args = {}) {
      const name = String(args.name || "").trim();
      return {
        action: {
          type: "folder_create",
          status: name ? "ready" : "needs_input",
          missing: name ? [] : ["nome da pasta"],
          label: name ? `Criar pasta "${name}"` : "Criar pasta",
          summary: name ? `Vou criar a pasta "${name}".` : "Qual o nome da pasta?",
          payload: { name, color: args.color || undefined },
        },
      };
    },
  },

  move_project_to_folder: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      if (!project) {
        return {
          action: {
            type: "project_move_folder",
            status: "needs_input",
            missing: ["projeto"],
            label: "Mover projeto",
            summary: "Qual projeto você quer mover?",
            payload: {},
          },
        };
      }

      const folderName = String(args.folder_name || "").trim();
      const toRoot = !folderName || /^(raiz|root|nenhuma|nenhum)$/i.test(folderName);
      let folder = null;
      if (!toRoot) {
        const folders = await foldersService.listFolders({}, ctx);
        const t = folderName.toLowerCase();
        folder =
          folders.find((f) => f.name?.toLowerCase() === t) ||
          folders.find((f) => f.name?.toLowerCase().includes(t)) ||
          null;
        if (!folder) {
          return {
            action: {
              type: "project_move_folder",
              status: "needs_input",
              missing: ["pasta de destino"],
              label: `Mover "${project.name}"`,
              summary: `Não encontrei a pasta "${folderName}". Quer que eu crie?`,
              payload: { project_id: project.id },
            },
          };
        }
      }

      return {
        action: {
          type: "project_move_folder",
          status: "ready",
          label: `Mover "${project.name}"`,
          summary: toRoot
            ? `Vou tirar "${project.name}" da pasta (mover para a raiz).`
            : `Vou mover "${project.name}" para a pasta "${folder.name}".`,
          payload: { project_id: project.id, folder_id: toRoot ? null : folder.id },
        },
      };
    },
  },

  add_tag_to_project: {
    kind: "write",
    async build(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      const tagName = String(args.tag_name || "").trim();
      const missing = [];
      if (!project) missing.push("projeto");
      if (!tagName) missing.push("tag");
      return {
        action: {
          type: "project_tag",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: missing.length ? "Marcar projeto" : `Marcar "${project.name}" como "${tagName}"`,
          summary: missing.length
            ? `Faltam dados: ${missing.join(", ")}.`
            : `Vou marcar o projeto "${project.name}" com a tag "${tagName}".`,
          payload: { project_id: project?.id || null, tag_name: tagName },
        },
      };
    },
  },

  add_tag_to_client: {
    kind: "write",
    async build(args = {}, ctx) {
      const client = await resolveClient({ client_id: args.client_id, name: args.client_name }, ctx);
      const tagName = String(args.tag_name || "").trim();
      const missing = [];
      if (!client) missing.push("cliente");
      if (!tagName) missing.push("tag");
      return {
        action: {
          type: "client_tag",
          status: missing.length ? "needs_input" : "ready",
          missing,
          label: missing.length ? "Marcar cliente" : `Marcar "${client.name}" como "${tagName}"`,
          summary: missing.length
            ? `Faltam dados: ${missing.join(", ")}.`
            : `Vou marcar o cliente "${client.name}" com a tag "${tagName}".`,
          payload: { client_id: client?.id || null, tag_name: tagName },
        },
      };
    },
  },
};

module.exports = { definitions, tools, toFolderEntity, toTagEntity };
