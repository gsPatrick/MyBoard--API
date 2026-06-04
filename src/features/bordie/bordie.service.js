const promptLoader = require("../../ai/prompt-loader");
const intentRouter = require("../../ai/intent-router");
const aiRuntime = require("../settings/ai-runtime.service");
const retrievalService = require("../../rag/retrieval.service");
const bordieTools = require("./bordie-tools.service");
const boardTools = require("./board-tools.service");
const boardsService = require("../boards/boards.service");
const policyEngine = require("./policy-engine.service");
const actionExecutor = require("./action-executor.service");

function buildScopeFromContext(context = {}) {
  return {
    client_id: context.client?.id || context.client_id || null,
    project_id: context.project?.id || context.project_id || null,
    channels: context.include_whatsapp === false ? ["workspace", "in_app", "manual"] : null,
  };
}

function normalizeContext(context = {}) {
  const activeTab = context.activeTab || context.active_tab || null;
  return {
    ...context,
    activeTab,
    active_tab: activeTab,
  };
}

function formatScreenContext(context = {}) {
  const lines = [
    `Aba ativa: ${context.activeTabLabel || context.activeTab || context.active_tab || "desconhecida"}`,
  ];

  if (context.client?.name) {
    lines.push(`Cliente selecionado: ${context.client.name} (id: ${context.client.id})`);
  }

  if (context.project?.name) {
    lines.push(`Projeto selecionado: ${context.project.name} (id: ${context.project.id})`);
  }

  if (context.board?.name || context.board?.id) {
    const summary = context.board.summary || {};
    lines.push(`Board aberto: "${context.board.name || context.board.id}"`);
    if (summary.element_count != null) {
      lines.push(`Elementos visíveis no canvas: ${summary.element_count}`);
    }
    if (summary.labels?.length) {
      lines.push(`Conteúdo detectado: ${summary.labels.join(", ")}`);
    }
    if (summary.type_counts && Object.keys(summary.type_counts).length) {
      lines.push(`Tipos de elementos: ${JSON.stringify(summary.type_counts)}`);
    }
    if (summary.has_content === false || summary.element_count === 0) {
      lines.push(
        "O snapshot do canvas indica board vazio. Se o usuário vê elementos na tela, diga que pode haver alterações não sincronizadas e peça para salvar o board."
      );
    }
  }

  if (context.policy_mode) {
    lines.push(`Política de ações: ${context.policy_mode}`);
  }

  return lines.join("\n");
}

function countVisibleElements(sceneData = {}) {
  return (Array.isArray(sceneData?.elements) ? sceneData.elements : []).filter((el) => !el.isDeleted)
    .length;
}

async function resolveBoardSceneContext(context = {}, serviceCtx = null) {
  const boardId = context.board?.id || context.board_id;
  if (!boardId) {
    return { boardId: null, sceneData: null, summary: null };
  }

  let sceneData = context.board?.scene_data;
  let boardName = context.board?.name || "Board";

  if (!countVisibleElements(sceneData) && serviceCtx) {
    try {
      const board = await boardsService.getBoardById(boardId, serviceCtx);
      if (board) {
        boardName = board.name || boardName;
        if (countVisibleElements(board.scene_data)) {
          sceneData = board.scene_data;
        }
      }
    } catch (error) {
      console.warn("[bordie] fallback load board:", error.message);
    }
  }

  sceneData = sceneData || { elements: [], appState: {}, files: {} };
  const summary = boardTools.summarizeScene(sceneData);

  return { boardId, boardName, sceneData, summary };
}

async function enrichContextWithBoard(context = {}, serviceCtx = null) {
  const normalized = normalizeContext(context);
  const resolved = await resolveBoardSceneContext(normalized, serviceCtx);

  if (!resolved.boardId) return normalized;

  return {
    ...normalized,
    board_id: resolved.boardId,
    board: {
      ...(normalized.board || {}),
      id: resolved.boardId,
      name: resolved.boardName,
      scene_data: resolved.sceneData,
      summary: resolved.summary,
    },
  };
}

async function buildRagContext(query, context, tenantId) {
  if (!query?.trim()) {
    return { contextPack: "", rag: null, intel: null };
  }

  try {
    const scope = buildScopeFromContext(context);
    const [rag, intel] = await Promise.all([
      retrievalService.searchKnowledge({
        tenantId,
        query,
        scope,
        limit: 14,
      }),
      bordieTools.gatherStructuredIntel({ tenantId, query, context }),
    ]);

    const intelPack = bordieTools.formatIntelContext(intel);
    const ragPack = retrievalService.buildContextPack(rag);
    const contextPack = [intelPack, ragPack].filter(Boolean).join("\n\n");

    return { contextPack, rag, intel };
  } catch (error) {
    console.warn("[bordie] RAG indisponível:", error.message);
    return { contextPack: "", rag: null, intel: null };
  }
}

async function resolveActionCandidates({ message, context, intel, boardResult, tenantId }) {
  const candidates = [];

  if (intel?.needs?.wantsContract && intel?.contract) {
    candidates.push(
      await bordieTools.buildWhatsAppMediaAction({
        tenantId,
        context,
        contractAsset: intel.contract,
      })
    );
  }

  if (boardResult?.action) {
    const boardId = context.board?.id || context.board_id;
    if (boardId && boardResult.action.payload) {
      boardResult.action.payload.board_id = boardId;
    }
    candidates.push(boardResult.action);
  }

  return candidates.filter(Boolean);
}

async function applyPolicyToCandidates(candidates, { tenantId, userId, userRole }) {
  const policy = await policyEngine.loadPolicy({ tenantId, userId });
  const actions = [];

  for (const candidate of candidates) {
    const evaluation = policyEngine.evaluateAction(candidate, policy, { userRole });
    const action = policyEngine.applyPolicyToAction(candidate, evaluation);
    if (action) actions.push({ action, evaluation, policy_mode: policy.mode });
  }

  return { actions, policy };
}

async function runBoardFlow({ message, context, history, tenantId, ctx }) {
  const boardId = context.board?.id || context.board_id;
  const sceneData = context.board?.scene_data || context.board_scene || {
    elements: [],
    appState: {},
    files: {},
  };

  if (!boardId) {
    return {
      reply: "Abra um board para eu criar ou editar elementos visuais.",
      action: null,
      boardResult: null,
    };
  }

  try {
    return await boardTools.runBoardAgent({
      message,
      boardId,
      sceneData,
      history,
      ctx: { ...ctx, execute: false },
    });
  } catch (error) {
    console.warn("[bordie] board agent falhou:", error.message);
    return {
      reply: null,
      action: null,
      boardResult: null,
    };
  }
}

async function runChat({
  message,
  context = {},
  history = [],
  mode = "chat",
  tenantId,
  userId,
  userRole,
}) {
  const serviceCtx = { tenantId, userId };
  const normalizedContext = await enrichContextWithBoard(context, serviceCtx);
  const intent = intentRouter.detectIntent({ message, mode, context: normalizedContext });
  const systemPrompt = promptLoader.composeSystemPrompt(intent.promptParts);
  const { contextPack, rag, intel } = await buildRagContext(message, normalizedContext, tenantId);

  let boardResult = null;
  if (intent.intent === "board") {
    boardResult = await runBoardFlow({
      message,
      context: normalizedContext,
      history,
      tenantId,
      ctx: serviceCtx,
    });
  }

  const boardSnapshot = boardTools.summarizeScene(normalizedContext.board?.scene_data);
  const hasBoard = Boolean(normalizedContext.board?.id);

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Contexto da tela do usuário:\n${formatScreenContext(normalizedContext)}`,
    },
  ];

  if (hasBoard && boardSnapshot) {
    messages.push({
      role: "system",
      content: `Snapshot atual do board (use isto — não invente elementos):\n${JSON.stringify(
        {
          board_id: normalizedContext.board.id,
          board_name: normalizedContext.board.name,
          ...boardSnapshot,
        },
        null,
        2
      )}`,
    });
  }

  if (contextPack) {
    messages.push({
      role: "system",
      content: `Contexto recuperado (RAG + fatos + mídia):\n${contextPack}`,
    });
  }

  if (boardResult?.board_summary) {
    messages.push({
      role: "system",
      content: `Resumo do board:\n${JSON.stringify(boardResult.board_summary, null, 2)}`,
    });
  }

  for (const item of history.slice(-12)) {
    if (!item?.content) continue;
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content,
    });
  }

  messages.push({ role: "user", content: message });

  let reply = boardResult?.reply || "";
  if (!reply) {
    try {
      const completion = await aiRuntime.createChatCompletion(tenantId, {
        messages,
        temperature: mode === "command" ? 0.2 : 0.35,
        max_tokens: 1400,
      });
      reply = completion.content;
    } catch (error) {
      console.warn("[bordie] chat completion falhou:", error.message);
      reply = `Não consegui chamar a IA: ${error.message}. Verifique Configurações → IA.`;
    }
  }

  const candidates = await resolveActionCandidates({
    message,
    context: normalizedContext,
    intel,
    boardResult,
    tenantId,
  });

  const { actions, policy } = await applyPolicyToCandidates(candidates, {
    tenantId,
    userId,
    userRole,
  });

  const primaryAction = actions[0]?.action || null;

  return {
    reply,
    intent: intent.intent,
    rag_stats: rag?.stats || null,
    facts_found: intel?.facts?.length || 0,
    action: primaryAction,
    actions: actions.map((item) => item.action),
    policy_mode: policy.mode,
    offline: !(await aiRuntime.isConfiguredForTenant(tenantId)),
  };
}

async function runCommand({ prompt, context = {}, history = [], tenantId, userId, userRole }) {
  const result = await runChat({
    message: prompt,
    context,
    history,
    mode: "command",
    tenantId,
    userId,
    userRole,
  });

  return {
    message: result.reply,
    action: result.action,
    actions: result.actions,
    intent: result.intent,
    rag_stats: result.rag_stats,
    facts_found: result.facts_found,
    policy_mode: result.policy_mode,
    offline: result.offline,
  };
}

async function executeConfirmedAction({ action, confirmed, tenantId, userId, userRole, ctx }) {
  if (!action?.type) {
    throw new Error("Ação inválida");
  }

  const policy = await policyEngine.loadPolicy({ tenantId, userId });
  const evaluation = policyEngine.evaluateAction(action, policy, { userRole });

  if (!evaluation.allowed) {
    return { ok: false, reason: evaluation.reason };
  }

  if (evaluation.requires_confirmation && !confirmed) {
    return {
      ok: false,
      requires_confirmation: true,
      reason: evaluation.reason,
      action,
    };
  }

  const serviceCtx = {
    tenantId,
    userId,
    ...ctx,
  };

  const result = await actionExecutor.executeAction(action, serviceCtx);
  return { ok: true, result, action };
}

async function getPolicySettings({ tenantId, userId }) {
  return policyEngine.loadPolicy({ tenantId, userId });
}

module.exports = {
  runChat,
  runCommand,
  executeConfirmedAction,
  getPolicySettings,
};
