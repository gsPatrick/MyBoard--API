const aiRuntime = require("../features/settings/ai-runtime.service");

// Para onde cada decisão da IA aponta (prompt + grupos de ferramentas).
const ROUTES = {
  board: {
    intent: "board",
    promptParts: ["core/identity", "core/safety", "modes/board_agent"],
    toolGroups: ["board", "workspace_read"],
  },
  workspace: {
    intent: "chat",
    promptParts: ["core/identity", "core/safety", "modes/chat"],
    toolGroups: ["workspace_read", "workspace_write"],
  },
  whatsapp: {
    intent: "whatsapp_context",
    promptParts: ["core/identity", "core/safety", "modes/chat", "rag/whatsapp_context"],
    toolGroups: ["workspace_read", "rag"],
  },
};

const COMMAND_ROUTE = {
  intent: "command",
  promptParts: ["core/identity", "core/safety", "modes/command"],
  toolGroups: ["navigation", "workspace_read", "board"],
};

const ROUTER_SYSTEM = [
  "Você é o classificador de intenção do assistente Bordie.ia (MyBoard).",
  "Use SEMPRE a função route para decidir para onde mandar a mensagem do usuário.",
  "",
  "Critérios:",
  "- target = \"board\": o usuário quer DESENHAR, criar ou editar algo no quadro/canvas/board/Excalidraw — formas, caixas, setas, diagramas, fluxogramas, organogramas, mapas mentais, wireframes, notas no canvas.",
  "- target = \"workspace\": QUALQUER coisa sobre os DADOS do sistema — projetos, clientes, agenda/compromissos, finanças. Inclui criar/editar/excluir/listar/contar, e criar projeto a partir de um briefing/proposta colado.",
  "- target = \"whatsapp\": a mensagem é sobre conversas/mensagens do WhatsApp do usuário.",
  "",
  "Interprete a INTENÇÃO real, não palavras isoladas. Um texto longo de briefing de projeto que cita \"fluxos\", \"jornada\" ou \"telas\" continua sendo workspace se o pedido é criar/cadastrar um projeto.",
  "Na dúvida entre desenhar e dados, escolha \"workspace\".",
].join("\n");

const ROUTE_TOOL = [
  {
    type: "function",
    function: {
      name: "route",
      description: "Direciona a mensagem do usuário para o agente correto.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["board", "workspace", "whatsapp"],
            description:
              "board = desenhar/editar o quadro/canvas/Excalidraw; workspace = projetos, clientes, agenda e dados do sistema; whatsapp = conversas do WhatsApp.",
          },
        },
        required: ["target"],
      },
    },
  },
];

function parseTarget(completion) {
  // Caminho principal: a IA chamou a função route.
  const call = (completion?.tool_calls || [])[0];
  if (call?.function?.arguments) {
    try {
      const target = JSON.parse(call.function.arguments).target;
      if (ROUTES[target]) return target;
    } catch {
      /* tenta o fallback abaixo */
    }
  }

  // Fallback: alguns modelos respondem em texto em vez de chamar a função.
  // Interpretamos a resposta DA IA (não a mensagem do usuário).
  const content = String(completion?.content || "").toLowerCase();
  if (/\bboard\b|quadro|canvas|excalidraw/.test(content)) return "board";
  if (/whatsapp/.test(content)) return "whatsapp";
  if (/\bworkspace\b|projeto|cliente|agenda/.test(content)) return "workspace";
  return null;
}

/**
 * Classificador de intenção via function calling — a IA decide (sem regex/keywords).
 * Retorna { intent, promptParts, toolGroups }. Cai para "workspace" se a IA não responder.
 */
async function routeIntent({ message = "", mode = "chat", context = {}, tenantId } = {}) {
  if (mode === "command") return COMMAND_ROUTE;

  const activeTab = context.activeTab || context.active_tab || "—";
  // Para a classificação basta o começo da mensagem (a intenção fica no pedido,
  // não no meio de um briefing colado) — mantém a chamada barata mesmo em textos longos.
  const snippet = String(message || "").slice(0, 4000);

  try {
    const completion = await aiRuntime.createChatCompletion(tenantId, {
      messages: [
        { role: "system", content: ROUTER_SYSTEM },
        { role: "user", content: `Aba atual: ${activeTab}\nMensagem do usuário:\n${snippet}` },
      ],
      tools: ROUTE_TOOL,
      temperature: 0,
      max_tokens: 60,
    });

    const target = parseTarget(completion);
    return ROUTES[target] || ROUTES.workspace;
  } catch {
    return ROUTES.workspace;
  }
}

module.exports = { routeIntent };
