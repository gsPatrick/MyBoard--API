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

  const mentionsWhatsapp = /whatsapp|zap|grupo|mensagem|conversa|cliente disse/.test(text);

  // Palavras que indicam claramente intenção de manipular o board.
  const boardKeywords =
    /board|quadro|canvas|desenh|fluxo|fluxograma|diagrama|wireframe|mapa mental|mindmap|organograma|jornada|kanban|nota|sticky|post-?it|caixa|retângulo|retangulo|seta|conect|limpar|apagar/;

  // Verbos de criação/edição que, quando o usuário já está no board, quase sempre
  // se referem ao canvas mesmo sem citar "board" explicitamente.
  const boardVerbs =
    /\b(cria|criar|crie|faz|faça|fazer|monta|montar|monte|adiciona|adicionar|adicione|coloca|colocar|coloque|escreve|escrever|escreva|gera|gerar|gere|desenha|desenhar|desenhe|melhora|melhorar|melhore|ajusta|ajustar|ajuste|organiza|organizar|organize|reorganiza|move|mover|mova|renomeia|renomear|edita|editar|edite|altera|alterar|altere|remove|remover|remova|deleta|deletar|delete|liga|ligar|ligue|avalia|avaliar|analis|revis|resum)/;

  const onBoardTab = activeTab === "board" || activeTab === "quadro";

  if (boardKeywords.test(text) || (onBoardTab && !mentionsWhatsapp && boardVerbs.test(text))) {
    return {
      intent: "board",
      promptParts: ["core/identity", "core/safety", "modes/board_agent"],
      toolGroups: ["board", "workspace_read"],
    };
  }

  if (mentionsWhatsapp) {
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
