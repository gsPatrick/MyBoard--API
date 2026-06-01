function detectIntent({ message = "", mode = "chat", context = {} }) {
  const text = String(message || "").toLowerCase();
  const activeTab = context.activeTab || context.active_tab || null;

  if (mode === "command") {
    return {
      intent: "command",
      promptParts: ["core/identity", "core/safety", "modes/command"],
      toolGroups: ["navigation", "workspace_read", "board"],
    };
  }

  if (activeTab === "board" || /board|quadro|canvas|desenhar|fluxo|diagrama|wireframe|mapa mental/.test(text)) {
    return {
      intent: "board",
      promptParts: ["core/identity", "core/safety", "modes/board_agent"],
      toolGroups: ["board", "workspace_read"],
    };
  }

  if (/whatsapp|zap|grupo|mensagem|conversa|cliente disse/.test(text)) {
    return {
      intent: "whatsapp_context",
      promptParts: ["core/identity", "core/safety", "modes/chat", "rag/whatsapp_context"],
      toolGroups: ["workspace_read", "rag"],
    };
  }

  return {
    intent: "chat",
    promptParts: ["core/identity", "core/safety", "modes/chat"],
    toolGroups: ["workspace_read", "rag"],
  };
}

module.exports = { detectIntent };
