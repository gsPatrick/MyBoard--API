function detectIntent({ message = "", mode = "chat", context = {} }) {
  const text = String(message || "").toLowerCase();
  const activeTab = context.activeTab || context.active_tab || null;
  const onBoardTab = activeTab === "board" || activeTab === "quadro";

  if (mode === "command") {
    return {
      intent: "command",
      promptParts: ["core/identity", "core/safety", "modes/command"],
      toolGroups: ["navigation", "workspace_read", "board"],
    };
  }

  const mentionsWhatsapp = /whatsapp|zap|grupo|mensagem|conversa|cliente disse/.test(text);

  // Substantivos que nomeiam EXPLICITAMENTE a ferramenta de desenho.
  // (Note: "fluxo" sozinho NÃO entra aqui — aparece muito em descrições de projeto.)
  const drawingNoun =
    /\b(board|quadro|canvas|excalidraw|fluxograma|diagrama|wireframe|mapa mental|mind ?map|organograma|kanban)\b/.test(
      text
    );

  // Verbos típicos de desenho/canvas.
  const drawingVerb = /\b(desenh\w*|rabisc\w*|sticky|post-?it)\b/.test(text);

  // Intenção clara de mexer em DADOS (projeto/cliente/agenda) — substantivo + verbo.
  const workspaceNoun =
    /\b(projetos?|clientes?|agenda|eventos?|compromissos?|reuni[õo]es?|or[çc]amentos?)\b/.test(text);
  const workspaceVerb =
    /\b(cria|criar|crie|cadastr\w*|adiciona\w*|adicione|edita\w*|edite|altera\w*|altere|atualiz\w*|muda\w*|mude|exclui\w*|exclua|deleta\w*|delete|remov\w*|apag\w*|list\w*|mostr\w*|quant[oa]s?|tenho|busca\w*|encontr\w*|vincul\w*|marca\w*|agend\w*)\b/.test(
      text
    );

  // Verbos genéricos de criação/edição (board quando o usuário já está no canvas).
  const boardVerbs =
    /\b(cria|criar|crie|faz|faça|fazer|monta|montar|monte|adiciona|adicionar|adicione|coloca|colocar|coloque|escreve|escrever|escreva|gera|gerar|gere|melhora|melhorar|melhore|ajusta|ajustar|ajuste|organiza|organizar|organize|reorganiza|move|mover|mova|renomeia|renomear|edita|editar|edite|altera|alterar|altere|remove|remover|remova|deleta|deletar|delete|liga|ligar|ligue|avalia|avaliar|analis|revis|resum)/;

  // 1) Intenção explícita de workspace vence o desenho.
  //    Ex.: "cria um projeto vinculado ao cliente X" mesmo que a descrição colada
  //    contenha palavras como "fluxo", "nota", "jornada" etc.
  //    Só cede se o usuário nomear explicitamente a ferramenta de desenho.
  if (workspaceNoun && workspaceVerb && !drawingNoun) {
    return {
      intent: "chat",
      promptParts: ["core/identity", "core/safety", "modes/chat"],
      toolGroups: ["workspace_read", "workspace_write"],
    };
  }

  // 2) Desenho explícito (nome da ferramenta ou verbo de desenho), ou ação no
  //    board já aberto sem intenção de workspace.
  if (
    drawingNoun ||
    drawingVerb ||
    (onBoardTab && !mentionsWhatsapp && !workspaceNoun && boardVerbs.test(text))
  ) {
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
