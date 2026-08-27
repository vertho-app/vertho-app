/**
 * Contexto de EXECUÇÃO de uma chamada de IA — declarado, nunca farejado.
 *
 * Por que existe (26/08/2026): o ledger registra `latency_ms` mas não onde a
 * chamada rodou, e os orçamentos de tempo diferem por ordem de grandeza — 300s
 * ou 800s numa rota, 3600s numa task do Trigger. Sem o denominador, "estamos
 * perto do timeout?" não é respondível pelo dado.
 *
 * O custo disso já apareceu nesta base: eu segurei o teto de `modulo_base_autor`
 * afirmando "227s contra os 300s da rota — 76% do relógio". Nenhum caminho que
 * executa essa task tem 300s. A premissa errada sobreviveu porque não havia como
 * contestá-la com dado.
 *
 * 🔑 Por que DECLARAR e não detectar: a alternativa seria farejar env var do
 * Trigger, e a documentação não expõe nenhuma para isso — seria depender de um
 * detalhe não documentado para decidir. Aqui quem sabe o orçamento é quem o
 * declara (a task conhece seu `maxDuration`, a rota conhece o dela), e quem não
 * declara entra como `desconhecido`: aparece no relatório como cobertura que
 * falta, em vez de virar um número inventado.
 *
 * Usa `AsyncLocalStorage`, então atravessa a pilha sem que `callAI` precise de
 * mais um parâmetro em 59 call-sites.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type Runtime = 'trigger' | 'rota' | 'action' | 'script' | 'desconhecido';

export interface ExecucaoContexto {
  runtime: Runtime;
  /** Teto de tempo do contexto em ms (`maxDuration` × 1000), quando conhecido. */
  orcamentoMs?: number;
  /** Rótulo de quem declarou — ajuda a achar o call-site no relatório. */
  onde?: string;
}

const armazenamento = new AsyncLocalStorage<ExecucaoContexto>();

/**
 * Executa `fn` declarando o contexto. Tudo que `fn` chamar — inclusive
 * `callAI` várias camadas abaixo — enxerga esta declaração.
 *
 * ```ts
 * export const minhaTask = task({
 *   maxDuration: 3600,
 *   run: (p) => comContexto({ runtime: 'trigger', orcamentoMs: 3_600_000, onde: 'minha-task' },
 *     () => fazerOTrabalho(p)),
 * });
 * ```
 */
export function comContexto<T>(ctx: ExecucaoContexto, fn: () => Promise<T>): Promise<T> {
  return armazenamento.run(ctx, fn);
}

/** O contexto declarado, ou `desconhecido` quando ninguém declarou. */
export function contextoAtual(): ExecucaoContexto {
  return armazenamento.getStore() ?? { runtime: 'desconhecido' };
}

/**
 * Fração do orçamento consumida, ou null quando o orçamento é desconhecido.
 * `null` é resposta legítima e diferente de 0 — é o que impede alguém de ler
 * "sem orçamento declarado" como "sobra tempo".
 */
export function fracaoDoOrcamento(latencyMs: number, ctx = contextoAtual()): number | null {
  if (!ctx.orcamentoMs || ctx.orcamentoMs <= 0) return null;
  return latencyMs / ctx.orcamentoMs;
}
