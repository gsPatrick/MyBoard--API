const projectDetailsService = require("../../project-details/project-details.service");
const { resolveProject } = require("./resolve");

const KEY_LABELS = {
  host: "Host / IP",
  ip: "IP",
  url: "URL",
  endpoint: "Endpoint",
  username: "Usuário",
  user: "Usuário",
  login: "Login",
  password: "Senha",
  senha: "Senha",
  port: "Porta",
  porta: "Porta",
  database: "Banco",
  db: "Banco",
  token: "Token",
  api_key: "API Key",
  apikey: "API Key",
  secret: "Secret",
  email: "E-mail",
  notes: "Notas",
  obs: "Observações",
};

const SECRET_KEY = /pass|senha|token|secret|key|pwd|credencial/i;

function labelForKey(key) {
  const k = String(key).toLowerCase();
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  return k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");
}

// Transforma o `value` de um detail em campos copiáveis (cada chave vira um campo).
function valueToFields(value, fallbackLabel) {
  if (value == null || value === "") return [];
  let v = value;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        v = JSON.parse(s);
      } catch {
        /* mantém string */
      }
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v)
      .filter(([k, val]) => k !== "kind" && val !== "" && val != null)
      .map(([k, val]) => ({
        label: labelForKey(k),
        value: String(val),
        secret: SECRET_KEY.test(k),
      }));
  }
  return [{ label: fallbackLabel || "Valor", value: String(v), secret: false }];
}

function toDetailEntity(detail) {
  const kind = detail.metadata?.kind || null;
  return {
    type: "detail",
    id: detail.id,
    title: detail.label,
    subtitle: detail.category || null,
    category: detail.category || "custom",
    kind,
    icon: "detail",
    fields: valueToFields(detail.value, detail.label),
  };
}

function matchesQuery(detail, query) {
  if (!query) return true;
  const q = String(query).toLowerCase();
  const hay = [
    detail.label,
    detail.key,
    detail.category,
    detail.metadata?.kind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (hay.includes(q)) return true;
  // também procura nas chaves/valores não-secretos
  const fields = valueToFields(detail.value, detail.label);
  return fields.some((f) => !f.secret && `${f.label} ${f.value}`.toLowerCase().includes(q));
}

const definitions = [
  {
    type: "function",
    function: {
      name: "get_project_details",
      description:
        "Retorna QUALQUER informação/dado guardado de um projeto: credenciais (VPS, FTP, banco, e-mail, API), links, repositório (GitHub), deploy, ambiente, escopo, documentação, notas, descrição e campos personalizados. Use sempre que o usuário pedir 'me passa os dados de X', 'qual o acesso/link/senha de Y', 'o que tenho guardado no projeto Z'. Passe em 'query' o que ele pediu (ex.: 'vps', 'banco', 'github') — se não bater com nada, traz tudo. Revela os valores (inclusive senhas) para o usuário copiar.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Id do projeto." },
          project_name: { type: "string", description: "Nome do projeto (se não souber o id)." },
          query: {
            type: "string",
            description:
              "O que procurar, ex.: 'vps', 'banco', 'github', 'ftp', 'api'. Omita para trazer todos os dados.",
          },
          category: {
            type: "string",
            description:
              "Filtrar por categoria: credentials, github, deployment, environment, links, documentation, scope, notes, custom.",
          },
        },
      },
    },
  },
];

const tools = {
  get_project_details: {
    kind: "read",
    async run(args = {}, ctx) {
      const project = await resolveProject(
        { project_id: args.project_id, name: args.project_name },
        ctx
      );
      if (!project) {
        return {
          summary: { found: false, message: "Diga de qual projeto você quer os dados." },
          entities: [],
        };
      }

      const query = { revealSecrets: "true" };
      if (args.category) query.category = args.category;

      let details = [];
      try {
        details = await projectDetailsService.listDetails(project.id, query, ctx);
      } catch (error) {
        return {
          summary: { error: error.message || "Falha ao ler os dados do projeto." },
          entities: [],
        };
      }

      let all = Array.isArray(details) ? [...details] : [];

      // A descrição do projeto também é "informação guardada" — entra como um detalhe.
      if (project.description && (!args.category || args.category === "notes")) {
        all.push({
          id: "__description",
          label: "Descrição",
          category: "notes",
          value: project.description,
          metadata: {},
        });
      }

      // Filtro como RANKING, não exclusão: se a busca não casar com nada, traz tudo
      // (a IA decide o que é relevante — nunca esconde informação).
      let selected = all;
      if (args.query) {
        const matched = all.filter((d) => matchesQuery(d, args.query));
        selected = matched.length ? matched : all;
      }

      const entities = selected.map(toDetailEntity);

      return {
        summary: {
          project: project.name,
          query: args.query || "todos",
          mostrando: entities.length,
          // inventário completo do que existe, para a IA saber o que mais há guardado
          disponivel: all.map((d) => ({
            label: d.label,
            category: d.category,
            kind: d.metadata?.kind || null,
          })),
          note:
            "A interface mostra os valores com botão de copiar. No texto, NÃO repita senhas/segredos — apenas diga o que trouxe e ofereça mais se houver outros dados em 'disponivel'.",
        },
        entities,
      };
    },
  },
};

module.exports = { definitions, tools, toDetailEntity };
