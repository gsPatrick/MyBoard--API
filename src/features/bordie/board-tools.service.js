const boardsService = require("../boards/boards.service");
const openRouterClient = require("../../providers/openrouter/openrouter.client");
const {
  buildElementsFromSpec,
  normalizeIncomingElement,
  createStickyNote,
} = require("./excalidraw-elements");

function summarizeScene(sceneData = {}) {
  const elements = Array.isArray(sceneData.elements) ? sceneData.elements : [];
  const visible = elements.filter((el) => !el.isDeleted);

  return {
    element_count: visible.length,
    labels: visible
      .map((el) => el.text || el.originalText || el.name || el.type)
      .filter(Boolean)
      .slice(0, 40),
    types: [...new Set(visible.map((el) => el.type))],
  };
}

function getBoardToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "board_mutate",
        description:
          "Cria ou altera o board Excalidraw. Use para desenhar fluxos, mapas, notas, diagramas, wireframes — tudo que o usuário pedir.",
        parameters: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: ["append", "replace_all", "clear", "delete_ids", "add_from_specs"],
              description:
                "append=adiciona elementos; replace_all=substitui tudo; clear=limpa; delete_ids=remove ids; add_from_specs=cria a partir de specs simples",
            },
            elements: {
              type: "array",
              description: "Elementos Excalidraw completos ou parciais (serão normalizados)",
              items: { type: "object" },
            },
            specs: {
              type: "array",
              description:
                "Specs simplificadas: { kind: box|text|arrow|note|heading, x, y, width, height, label, text, color }",
              items: { type: "object" },
            },
            element_ids_to_delete: {
              type: "array",
              items: { type: "string" },
            },
            app_state: { type: "object" },
            explanation: { type: "string" },
          },
          required: ["operation", "explanation"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "board_read_summary",
        description: "Resume o conteúdo atual do board para planejar edições",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
  ];
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
    const fromSpecs = buildElementsFromSpec(mutation.specs || []);
    const fromElements = (mutation.elements || [])
      .map(normalizeIncomingElement)
      .filter(Boolean);
    const elements = [...fromSpecs, ...fromElements];
    return {
      scene_data: {
        elements,
        appState: { ...scene.appState, ...(mutation.app_state || {}) },
        files: scene.files,
      },
      summary: `${elements.length} elementos criados (replace_all)`,
    };
  }

  let elements = [...scene.elements];

  if (operation === "delete_ids") {
    const ids = new Set(mutation.element_ids_to_delete || []);
    elements = elements.map((el) => (ids.has(el.id) ? { ...el, isDeleted: true } : el));
  }

  if (operation === "add_from_specs") {
    elements = [...elements, ...buildElementsFromSpec(mutation.specs || [])];
  }

  if (operation === "append" || operation === "add_from_specs") {
    const incoming = (mutation.elements || [])
      .map(normalizeIncomingElement)
      .filter(Boolean);
    if (incoming.length) {
      elements = [...elements, ...incoming];
    }
    if (operation === "append" && mutation.specs?.length) {
      elements = [...elements, ...buildElementsFromSpec(mutation.specs)];
    }
  }

  return {
    scene_data: {
      elements,
      appState: { ...scene.appState, ...(mutation.app_state || {}) },
      files: scene.files,
    },
    summary: mutation.explanation || "Board atualizado",
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

async function executeBoardToolCall(toolName, args, { boardId, sceneData, ctx }) {
  if (toolName === "board_read_summary") {
    return summarizeScene(sceneData);
  }

  if (toolName !== "board_mutate") {
    return { error: `Tool desconhecida: ${toolName}` };
  }

  const result = applySceneMutation(sceneData, args);
  const action = buildBoardAction({
    boardId,
    mutation: args,
    explanation: args.explanation,
    proposedScene: result.scene_data,
  });

  if (ctx?.execute === true && boardId) {
    const updated = await boardsService.updateBoard(
      boardId,
      { scene_data: result.scene_data },
      ctx
    );
    return { executed: true, board: updated, summary: result.summary };
  }

  return {
    proposed_scene: result.scene_data,
    summary: result.summary,
    action,
  };
}

async function runBoardAgent({ message, boardId, sceneData, history = [], ctx }) {
  const summary = summarizeScene(sceneData);
  const tools = getBoardToolDefinitions();

  const messages = [
    {
      role: "system",
      content: [
        "Você é agente de board Excalidraw no MyBoard.",
        "Crie livremente tudo que o usuário pedir: fluxos, mapas mentais, wireframes, notas, diagramas, listas visuais.",
        "Use board_mutate com specs simples ou elements completos.",
        "Prefira add_from_specs ou append para não apagar trabalho existente, salvo se o usuário pedir limpar/substituir.",
        `Board atual: ${JSON.stringify(summary)}`,
      ].join("\n"),
    },
    ...history.slice(-8).map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content,
    })),
    { role: "user", content: message },
  ];

  const completion = await openRouterClient.createChatCompletion({
    messages,
    tools,
    temperature: 0.35,
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

  for (const call of toolCalls) {
    const fn = call.function?.name;
    let args = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}");
    } catch {
      args = {};
    }

    lastResult = await executeBoardToolCall(fn, args, { boardId, sceneData, ctx });
    if (lastResult?.action) {
      action = lastResult.action;
      sceneData = lastResult.proposed_scene || sceneData;
    }
    if (lastResult?.executed) {
      sceneData = lastResult.board?.scene_data || sceneData;
    }
  }

  return {
    reply:
      completion.content ||
      lastResult?.summary ||
      "Alterações preparadas para o board.",
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
  getBoardToolDefinitions,
  applySceneMutation,
  buildBoardAction,
  executeBoardToolCall,
  runBoardAgent,
  quickBoardMutations,
};
