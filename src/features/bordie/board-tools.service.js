const boardsService = require("../boards/boards.service");
const aiRuntime = require("../settings/ai-runtime.service");
const {
  buildElementsFromSpec,
  buildConnections,
  normalizeIncomingElement,
  resolveColors,
} = require("./excalidraw-elements");

// Só permitimos operações destrutivas (limpar tudo / refazer do zero) quando o
// usuário pedir explicitamente. Caso contrário, toda mudança é incremental.
const EXPLICIT_RESET =
  /\b(limpa\w*\s+(tudo|o\s+board|o\s+quadro|a\s+tela)|apag\w*\s+tudo|comec\w*\s+(do\s+)?zero|come[çc]\w*\s+(do\s+)?zero|recome[çc]\w*|refaz\w*\s+(tudo|do\s+zero)|do\s+zero|zera\w*\s+(o\s+)?(board|quadro|tudo)|substitu\w*\s+tudo|deleta\w*\s+tudo|clear\s+(all|everything|board)|reset\w*|start\s+over|wipe)\b/i;

function isExplicitResetRequest(message = "") {
  return EXPLICIT_RESET.test(String(message || ""));
}

function visibleElements(sceneData = {}) {
  const elements = Array.isArray(sceneData.elements) ? sceneData.elements : [];
  return elements.filter((el) => !el.isDeleted);
}

function summarizeScene(sceneData = {}) {
  const visible = visibleElements(sceneData);

  return {
    element_count: visible.length,
    labels: visible
      .map((el) => el.text || el.originalText || el.name || el.type)
      .filter(Boolean)
      .slice(0, 40),
    types: [...new Set(visible.map((el) => el.type))],
    type_counts: visible.reduce((acc, el) => {
      const type = el.type || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}),
    has_content: visible.length > 0,
  };
}

// Caixa envolvente dos elementos visíveis — usada para posicionar novos
// elementos sem sobrepor o que já existe.
function sceneBounds(sceneData = {}) {
  const visible = visibleElements(sceneData).filter(
    (el) => typeof el.x === "number" && typeof el.y === "number"
  );
  if (!visible.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of visible) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 0));
    maxY = Math.max(maxY, el.y + (el.height || 0));
  }
  return { minX, minY, maxX, maxY };
}

// Digest compacto dos elementos visíveis COM ids e posição — é isso que
// permite ao agente editar/mover/conectar o que já está no board.
function sceneElementsDigest(sceneData = {}, limit = 60) {
  return visibleElements(sceneData)
    .filter((el) => el.type !== "text" || !el.containerId) // texto vinculado vai junto do container
    .slice(0, limit)
    .map((el) => {
      const label = el.text || el.originalText || null;
      const boundText =
        !label && Array.isArray(el.boundElements)
          ? (visibleElements(sceneData).find(
              (t) => t.type === "text" && t.containerId === el.id
            )?.text || null)
          : null;
      return {
        id: el.id,
        type: el.type,
        label: label || boundText || undefined,
        x: Math.round(el.x),
        y: Math.round(el.y),
        w: Math.round(el.width || 0),
        h: Math.round(el.height || 0),
        color: el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : undefined,
      };
    });
}

function getBoardToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "board_mutate",
        description:
          "Cria ou altera o board Excalidraw. Use para desenhar fluxos, mapas, notas, diagramas, wireframes, organogramas — tudo que o usuário pedir. Sempre prefira 'specs' + 'connections' a montar elementos crus.",
        parameters: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: [
                "append",
                "add_from_specs",
                "update_elements",
                "delete_ids",
                "replace_all",
                "clear",
              ],
              description:
                "PADRÃO = add_from_specs/append (adiciona SEM apagar o que existe). update_elements=edita/move/recolore por id; delete_ids=remove ids específicos. NÃO use replace_all nem clear a menos que o usuário peça explicitamente para limpar/refazer o board inteiro — caso contrário serão tratados como adição.",
            },
            specs: {
              type: "array",
              description:
                "Specs simplificadas. Cada uma: { id?, kind, x?, y?, width?, height?, label, color, fields? }. kinds: box (etapa), diamond (decisão), ellipse (início/fim), note (post-it), entity|table (tabela de banco / recurso de API / componente — use 'label' como título e 'fields' como array de strings, ex: [\"id: uuid PK\", \"nome: text\", \"created_at: timestamp\"]), text|heading. color aceita nome (blue,green,yellow,red,violet,gray,teal,orange,pink) ou hex. Dê um 'id' aos shapes que serão conectados. Omita x/y para layout automático em grade.",
              items: { type: "object" },
            },
            connections: {
              type: "array",
              description:
                "Setas que ligam shapes: [{ from, to, label? }] onde from/to são os 'id' ou 'label' usados em specs (ou ids já existentes no board). Gera setas com binding que acompanham os shapes.",
              items: { type: "object" },
            },
            updates: {
              type: "array",
              description:
                "Para operation=update_elements: [{ id, x?, y?, width?, height?, label?, color? }]. Edita elementos existentes (mover, redimensionar, renomear, recolorir).",
              items: { type: "object" },
            },
            elements: {
              type: "array",
              description: "Elementos Excalidraw completos/parciais (use só se specs não bastar).",
              items: { type: "object" },
            },
            element_ids_to_delete: {
              type: "array",
              items: { type: "string" },
            },
            app_state: { type: "object" },
            explanation: { type: "string", description: "Resumo curto da mudança." },
          },
          required: ["operation", "explanation"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "board_read_summary",
        description:
          "Lê o conteúdo atual do board (ids, tipos, rótulos e posições) para planejar edições/conexões precisas.",
        parameters: { type: "object", properties: {} },
      },
    },
  ];
}

// Indexa elementos existentes por id e por label normalizado (para resolver conexões).
function indexExistingContainers(sceneData) {
  const byRef = {};
  for (const el of visibleElements(sceneData)) {
    if (el.type === "text" && el.containerId) continue;
    byRef[el.id] = el;
    const label =
      el.text ||
      el.originalText ||
      visibleElements(sceneData).find((t) => t.type === "text" && t.containerId === el.id)?.text;
    if (label) byRef[String(label).toLowerCase().trim()] = el;
  }
  return byRef;
}

function applyUpdates(elements, updates = []) {
  if (!updates.length) return elements;
  const updateById = new Map(updates.filter((u) => u && u.id).map((u) => [u.id, u]));

  return elements.map((el) => {
    const update = updateById.get(el.id);
    if (!update) {
      // Texto vinculado a um container que está sendo movido acompanha o container.
      if (el.type === "text" && el.containerId && updateById.has(el.containerId)) {
        const cu = updateById.get(el.containerId);
        const patch = { ...el };
        if (typeof cu.x === "number") patch.x = cu.x + 12;
        if (typeof cu.y === "number") patch.y = cu.y + (el.height ? el.height / 2 : 0);
        if (typeof cu.label === "string") {
          patch.text = cu.label;
          patch.originalText = cu.label;
        }
        patch.version = (el.version || 1) + 1;
        return patch;
      }
      return el;
    }

    const patch = { ...el };
    if (typeof update.x === "number") patch.x = update.x;
    if (typeof update.y === "number") patch.y = update.y;
    if (typeof update.width === "number") patch.width = update.width;
    if (typeof update.height === "number") patch.height = update.height;
    if (update.color) {
      const colors = resolveColors({ color: update.color });
      patch.backgroundColor = colors.backgroundColor;
      patch.strokeColor = colors.strokeColor;
    }
    // Renomear: se não tem texto vinculado, vira texto próprio.
    if (typeof update.label === "string" && el.type === "text" && !el.containerId) {
      patch.text = update.label;
      patch.originalText = update.label;
    }
    patch.version = (el.version || 1) + 1;
    patch.versionNonce = Math.floor(Math.random() * 2 ** 31);
    return patch;
  });
}

function applySceneMutation(currentScene, mutation = {}) {
  const scene = boardsService.normalizeSceneData(currentScene);
  const operation = mutation.operation || "append";

  if (operation === "clear") {
    return {
      scene_data: { elements: [], appState: scene.appState, files: {} },
      summary: "Board limpo",
    };
  }

  if (operation === "replace_all") {
    const built = buildElementsFromSpec(mutation.specs || []);
    const fromElements = (mutation.elements || []).map(normalizeIncomingElement).filter(Boolean);
    const connections = buildConnections(mutation.connections || [], built.containersByRef);
    const elements = [...built.elements, ...connections, ...fromElements];
    return {
      scene_data: {
        elements,
        appState: { ...scene.appState, ...(mutation.app_state || {}) },
        files: scene.files,
      },
      summary: mutation.explanation || `${elements.length} elementos criados (substituição)`,
    };
  }

  let elements = [...scene.elements];

  if (operation === "update_elements") {
    elements = applyUpdates(elements, mutation.updates || []);
    return {
      scene_data: {
        elements,
        appState: { ...scene.appState, ...(mutation.app_state || {}) },
        files: scene.files,
      },
      summary: mutation.explanation || `${(mutation.updates || []).length} elemento(s) atualizado(s)`,
    };
  }

  if (operation === "delete_ids") {
    const ids = new Set(mutation.element_ids_to_delete || []);
    elements = elements.map((el) => (ids.has(el.id) ? { ...el, isDeleted: true } : el));
    return {
      scene_data: {
        elements,
        appState: { ...scene.appState, ...(mutation.app_state || {}) },
        files: scene.files,
      },
      summary: mutation.explanation || `${ids.size} elemento(s) removido(s)`,
    };
  }

  // append / add_from_specs — adiciona sem apagar, posicionando abaixo do conteúdo
  // existente quando as specs não trazem coordenadas (evita sobreposição).
  const bounds = sceneBounds(scene);
  const origin = bounds ? { x: bounds.minX, y: bounds.maxY + 80 } : { x: 80, y: 80 };

  const built = buildElementsFromSpec(mutation.specs || [], { origin });

  // Conexões podem referenciar shapes recém-criados E elementos já no board.
  const refIndex = { ...indexExistingContainers(scene), ...built.containersByRef };
  const connections = buildConnections(mutation.connections || [], refIndex);

  const incoming = (mutation.elements || []).map(normalizeIncomingElement).filter(Boolean);

  // buildConnections pode anexar a seta ao boundElements de containers já existentes;
  // como `elements` referencia os mesmos objetos de `scene.elements`, isso já reflete aqui.
  elements = [...elements, ...built.elements, ...connections, ...incoming];

  return {
    scene_data: {
      elements,
      appState: { ...scene.appState, ...(mutation.app_state || {}) },
      files: scene.files,
    },
    summary:
      mutation.explanation ||
      `${built.elements.length + connections.length + incoming.length} elemento(s) adicionado(s)`,
  };
}

function buildBoardAction({ boardId, mutation, explanation, proposedScene }) {
  const operation = mutation.operation || "append";
  const actionType =
    operation === "clear"
      ? "board_clear"
      : operation === "replace_all"
        ? "board_replace_all"
        : operation === "delete_ids"
          ? "board_delete_elements"
          : "board_patch_scene";

  return {
    type: actionType,
    status: "ready",
    payload: {
      board_id: boardId,
      mutation,
      proposed_scene: proposedScene,
      explanation: explanation || mutation.explanation || "Atualização do board",
    },
  };
}

async function executeBoardToolCall(toolName, args, { boardId, sceneData, ctx, userMessage }) {
  if (toolName === "board_read_summary") {
    return {
      summary: summarizeScene(sceneData),
      elements: sceneElementsDigest(sceneData),
    };
  }

  if (toolName !== "board_mutate") {
    return { error: `Tool desconhecida: ${toolName}` };
  }

  // Regra dura: nunca limpa/substitui o board inteiro a menos que o usuário peça.
  let downgradedFrom = null;
  if (
    (args.operation === "clear" || args.operation === "replace_all") &&
    !isExplicitResetRequest(userMessage)
  ) {
    downgradedFrom = args.operation;
    // replace_all -> add_from_specs (mantém o existente e adiciona). clear sem
    // specs vira um no-op seguro (nada é apagado).
    args = { ...args, operation: "add_from_specs" };
  }

  const result = applySceneMutation(sceneData, args);
  if (downgradedFrom) {
    result.downgraded_from = downgradedFrom;
  }
  const action = buildBoardAction({
    boardId,
    mutation: args,
    explanation: args.explanation,
    proposedScene: result.scene_data,
  });

  if (ctx?.execute === true && boardId) {
    const updated = await boardsService.updateBoard(boardId, { scene_data: result.scene_data }, ctx);
    return { executed: true, board: updated, summary: result.summary };
  }

  return {
    proposed_scene: result.scene_data,
    summary: result.summary,
    action,
    downgraded_from: downgradedFrom,
  };
}

async function runBoardAgent({ message, boardId, sceneData, history = [], ctx }) {
  const summary = summarizeScene(sceneData);
  const digest = sceneElementsDigest(sceneData);
  const tools = getBoardToolDefinitions();

  const messages = [
    {
      role: "system",
      content: [
        "Você é o agente de board Excalidraw do MyBoard.",
        "Sempre que o usuário pedir algo visual, CHAME a tool board_mutate — não descreva, execute.",
        "",
        "Como desenhar bem:",
        "- Para fluxos/diagramas/organogramas: crie shapes em 'specs' com 'id' e ligue-os em 'connections'. As setas ganham binding e acompanham os shapes.",
        "- Use 'kind': box (etapa), diamond (decisão), ellipse (início/fim), note (post-it), heading/text (título/legenda).",
        "- Dê cores semânticas (color: green=ok, red=risco, yellow=atenção, blue=neutro). Omita x/y para layout automático em grade.",
        "",
        "Editar o que já existe (NÃO recriar do zero):",
        "- Use os ids reais listados abaixo. Para mover/recolorir/renomear use operation=update_elements com 'updates' [{id,...}].",
        "- Para remover, operation=delete_ids. Para acrescentar sem apagar, append/add_from_specs.",
        "- Só use replace_all/clear se o usuário pedir explicitamente para refazer/limpar tudo.",
        "- Em dúvida sobre o conteúdo atual, chame board_read_summary antes.",
        "",
        `Resumo do board: ${JSON.stringify(summary)}`,
        digest.length
          ? `Elementos atuais (id, tipo, rótulo, posição):\n${JSON.stringify(digest, null, 2)}`
          : "O board está vazio.",
      ].join("\n"),
    },
    ...history.slice(-8).map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content,
    })),
    { role: "user", content: message },
  ];

  const tenantId = ctx?.tenantId;
  const completion = await aiRuntime.createChatCompletion(tenantId, {
    messages,
    tools,
    temperature: 0.4,
    max_tokens: 2500,
  });

  const toolCalls = completion.tool_calls || [];
  if (!toolCalls.length) {
    return {
      reply: completion.content || "Posso ajudar a montar o board — descreva o que quer criar.",
      action: null,
    };
  }

  let lastResult = null;
  let action = null;
  let downgraded = false;

  for (const call of toolCalls) {
    const fn = call.function?.name;
    let args = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}");
    } catch {
      args = {};
    }

    lastResult = await executeBoardToolCall(fn, args, {
      boardId,
      sceneData,
      ctx,
      userMessage: message,
    });
    if (lastResult?.downgraded_from) downgraded = true;
    if (lastResult?.action) {
      action = lastResult.action;
      sceneData = lastResult.proposed_scene || sceneData;
    }
    if (lastResult?.executed) {
      sceneData = lastResult.board?.scene_data || sceneData;
    }
  }

  let reply = completion.content || lastResult?.summary || "Alterações preparadas para o board.";
  if (downgraded) {
    // O modelo pediu limpar/substituir sem o usuário ter pedido — mantivemos o
    // conteúdo e apenas adicionamos. Deixamos isso claro na resposta.
    reply = `${reply}\n\n(Mantive o que já estava no board e apenas adicionei os novos elementos. Se quiser recomeçar do zero, peça para "limpar tudo".)`;
  }

  return {
    reply,
    action,
    board_summary: summarizeScene(sceneData),
    tool_result: lastResult,
  };
}

function quickBoardMutations(intent) {
  const text = String(intent || "").toLowerCase();

  if (/nota|sticky|post-it/.test(text)) {
    return buildBoardAction({
      boardId: null,
      mutation: {
        operation: "add_from_specs",
        specs: [{ kind: "note", text: "Nova nota" }],
        explanation: "Adicionar nota",
      },
    });
  }

  if (/limpar|clear|apagar tudo/.test(text)) {
    return buildBoardAction({
      boardId: null,
      mutation: { operation: "clear", explanation: "Limpar board" },
    });
  }

  return null;
}

module.exports = {
  summarizeScene,
  sceneElementsDigest,
  sceneBounds,
  getBoardToolDefinitions,
  applySceneMutation,
  buildBoardAction,
  executeBoardToolCall,
  runBoardAgent,
  quickBoardMutations,
};
