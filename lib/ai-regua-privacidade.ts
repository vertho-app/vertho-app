/**
 * Régua de privacidade na EXECUÇÃO (R-45, 03/10/2026): o ponto por onde o modelo
 * realmente passa.
 *
 * `callAI` faz `aiConfig?.model || DEFAULT_MODEL` e não consulta `getModelForTask`:
 * o modelo chega de tela (o operador escolheu), de constante de código (o leitor
 * do Modo Cena era `grok-4.6`), de script ou de `sys_config`. Travar só o seletor
 * e o `resolveTaskModel` deixaria todos esses caminhos abertos. Por isso a régua
 * também vale aqui, na entrada do `callAI`/`callAIChat`.
 *
 * Na ENTREGA a régua não lança (CLAUDE.md, "na entrega, degrade registrando"): o
 * modelo não permitido é trocado pelo default declarado da tarefa e a troca vira
 * uma linha em `degradacao_log`. A lista de quem pode o quê vive em
 * `lib/ai-tasks.ts` (`TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS`).
 */
import { DEGRADACAO, registrarDegradacao } from '@/lib/degradacao';
import { modeloDeclaradoDaTarefa, modeloPermitidoNaTarefa } from '@/lib/ai-tasks';

export interface ContextoRegua {
  taskKey?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  /** Quem aplicou a régua (callAI, callAIChat, getModelForTask...), para o detalhe do log. */
  onde: string;
}

/** Registra a troca. Nunca lança: `registrarDegradacao` engole a própria falha. */
export async function registrarModeloNaoDeclarado(
  info: { pedido: string; usado: string } & ContextoRegua,
): Promise<void> {
  console.warn(
    `[ia] "${info.pedido}" é de provedor que a política de privacidade não declara, e a tarefa `
    + `"${info.taskKey || 'sem taskKey'}" não está liberada: rodando em "${info.usado}" (${info.onde}).`,
  );
  await registrarDegradacao({
    fluxo: 'ia',
    tipo: DEGRADACAO.MODELO_NAO_DECLARADO,
    chave: `${info.taskKey || 'sem-taskKey'}:${info.pedido}`,
    empresaId: info.empresaId ?? null,
    colaboradorId: info.colaboradorId ?? null,
    severidade: 'aviso',
    detalhe: { pedido: info.pedido, usado: info.usado, taskKey: info.taskKey ?? null, onde: info.onde },
  });
}

/**
 * Devolve o modelo que a chamada pode usar: o pedido, se a régua permite, ou o
 * default declarado da tarefa, com a troca registrada.
 */
export async function modeloNaReguaDePrivacidade(pedido: string, ctx: ContextoRegua): Promise<string> {
  if (modeloPermitidoNaTarefa(pedido, ctx.taskKey, ctx.empresaId)) return pedido;
  const usado = modeloDeclaradoDaTarefa(ctx.taskKey);
  await registrarModeloNaoDeclarado({ pedido, usado, ...ctx });
  return usado;
}
