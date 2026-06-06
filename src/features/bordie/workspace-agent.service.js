const aiRuntime = require("../settings/ai-runtime.service");
const workspaceTools = require("./workspace");

// Quantas voltas de tool-calling permitimos antes de forçar uma resposta final.
const MAX_ITERATIONS = 5;

function collectEntities(newOnes, bucket, seen) {
  for (const entity of newOnes || []) {
    if (!entity) continue;
    const key = `${entity.type}:${entity.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bucket.push(entity);
  }
}

function parseArgs(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/**
 * Agente de workspace: roda um loop agêntico de function calling.
 * - Tools de LEITURA são executadas na hora e o resultado volta ao modelo (multi-turn).
 * - Tools de ESCRITA viram "action candidates" (não executadas aqui) — a policy/confirmação decide.
 *
 * Retorna { reply, entities, actions }.
 */
async function runWorkspaceAgent({
  message,
  history = [],
  attachments = [],
  systemMessages = [],
  tenantId,
  ctx,
}) {
  const tools = workspaceTools.getToolDefinitions();

  const messages = [...systemMessages];
  for (const item of history.slice(-12)) {
    if (!item?.content) continue;
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content,
    });
  }

  // Mensagem do usuário — multimodal quando há arquivo anexado (manda o arquivo
  // de verdade, não o texto extraído).
  const validAttachments = (attachments || []).filter((a) => a && a.data);
  if (validAttachments.length) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: message || "Veja o arquivo anexado." },
        ...validAttachments.map((a) => ({
          type: "image_url",
          image_url: { url: a.data },
        })),
      ],
    });
  } else {
    messages.push({ role: "user", content: message });
  }

  const entities = [];
  const seenEntity = new Set();
  const actions = [];
  let reply = "";

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const completion = await aiRuntime.createChatCompletion(tenantId, {
      messages,
      tools,
      temperature: 0.3,
      max_tokens: 1500,
    });

    const toolCalls = completion.tool_calls || [];
    if (completion.content) reply = completion.content;

    if (!toolCalls.length) {
      break;
    }

    // Mensagem do assistant carregando as chamadas de ferramenta (formato OpenAI).
    messages.push({
      role: "assistant",
      content: completion.content || "",
      tool_calls: toolCalls,
    });

    let hasWrite = false;

    for (const call of toolCalls) {
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      const tool = workspaceTools.getTool(name);

      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Ferramenta desconhecida: ${name}` }),
        });
        continue;
      }

      if (tool.kind === "read") {
        try {
          const result = await tool.run(args, ctx);
          collectEntities(result.entities, entities, seenEntity);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result.summary || {}),
          });
        } catch (error) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: error.message || "Falha ao consultar." }),
          });
        }
        continue;
      }

      // tool.kind === "write"
      hasWrite = true;
      try {
        const built = await tool.build(args, ctx);
        if (built?.action) {
          actions.push(built.action);
          if (built.action.preview_entity) {
            collectEntities([built.action.preview_entity], entities, seenEntity);
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              status: built.action.status,
              label: built.action.label,
              summary: built.action.summary,
              missing: built.action.missing || [],
              note:
                built.action.status === "ready"
                  ? "Ação preparada. Aguardando confirmação/execução conforme a política de segurança — NÃO diga que já executou."
                  : "Faltam dados — peça ao usuário o que falta.",
            }),
          });
        } else {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "Não foi possível preparar a ação." }),
          });
        }
      } catch (error) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: error.message || "Falha ao preparar a ação." }),
        });
      }
    }

    // Depois de preparar uma escrita, encerramos sem uma 2ª chamada ao LLM.
    // A resposta sai direto do resumo da ação — evita dobrar a latência (e o
    // timeout do gateway) em mensagens longas, e não executa nada automaticamente.
    if (hasWrite) {
      const summaries = actions.map((a) => a.summary).filter(Boolean);
      if (summaries.length) {
        reply = summaries.join("\n\n");
      } else if (!reply) {
        reply = "Preparei a ação.";
      }
      break;
    }
  }

  return { reply: reply || "", entities, actions };
}

module.exports = { runWorkspaceAgent };
