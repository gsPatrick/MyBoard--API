const promptLoader = require("../../ai/prompt-loader");
const intentRouter = require("../../ai/intent-router");
const openRouterClient = require("../../providers/openrouter/openrouter.client");
const retrievalService = require("../../rag/retrieval.service");
const bordieTools = require("./bordie-tools.service");
const boardTools = require("./board-tools.service");
const policyEngine = require("./policy-engine.service");
const actionExecutor = require("./action-executor.service");
const settingsService = require("../settings/settings.service");

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

async function buildRagContext(query, context, tenantId) {
  if (!query?.trim()) {
    return { contextPack: "", rag: null, intel: null };
  }

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

  return boardTools.runBoardAgent({
    message,
    boardId,
    sceneData,
    history,
    ctx: { ...ctx, execute: false },
  });
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
  const normalizedContext = normalizeContext(context);
  const intent = intentRouter.detectIntent({ message, mode, context: normalizedContext });
  const systemPrompt = promptLoader.composeSystemPrompt(intent.promptParts);
  const { contextPack, rag, intel } = await buildRagContext(message, normalizedContext, tenantId);

  let boardResult = null;
  if (intent.intent === "board" || normalizedContext.activeTab === "board") {
    boardResult = await runBoardFlow({
      message,
      context: normalizedContext,
      history,
      tenantId,
      ctx: { tenantId, userId },
    });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Contexto estruturado:\n${JSON.stringify(normalizedContext, null, 2)}`,
    },
  ];

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
    const ai = await settingsService.resolveAiCredentials(tenantId);
    const completion = await openRouterClient.createChatCompletion({
      messages,
      temperature: mode === "command" ? 0.2 : 0.35,
      max_tokens: 1400,
      apiKey: ai.apiKey,
      baseUrl: ai.baseUrl,
      model: ai.chatModel,
      apiFormat: ai.apiFormat,
    });
    reply = completion.content;
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
    offline: !openRouterClient.isConfigured(),
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
