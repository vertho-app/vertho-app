/**
 * "Este cenário já foi respondido?": a régua que decide se uma regeneração pode
 * reescrever o cenário no lugar ou precisa virar versão nova.
 *
 * Plano de cenários de 11/10/2026, Fase 0. Reescrever no lugar um cenário que
 * alguém já respondeu deixa a resposta (e a nota da IA4) apontando para um texto
 * que a pessoa nunca leu. `Medido: 09/10/2026`: os 66 cenários A da Amazon
 * Bowling tinham respostas, e "Regenerar", "Revisar todos" e "Regerar
 * selecionados" da Fase 1 faziam UPDATE no lugar. A geração (`persistirCenarioIA3`)
 * já protegia respondidos; a regeneração não.
 *
 * Quem conta como "respondeu":
 *  - Cenário A: `respostas.cenario_id` (formulário do mapeamento) e
 *    `sessoes_avaliacao.cenario_id` (conversa do assessment; a FK é SET NULL, então
 *    apagar o cenário apagaria o vínculo calado).
 *  - Cenário B: o slot do fechamento em `temporada_semana_progresso.feedback`
 *    (`cenario_b_id` na Jornada, `cenarios[].cenario_b_id` no Onboarding; ver
 *    `lib/season-engine/fechamento-por-competencia.ts`) e `reavaliacao_sessoes`.
 *
 * Falha de leitura NÃO vira "sem uso": volta `{ erro }`, e quem chama não reescreve.
 */
import type { TenantDb } from '@/lib/tenant-db';

export type UsoDoCenario =
  | { total: number; detalhe: Record<string, number> }
  | { erro: string };

/** Lê uma contagem (`head: true`). Erro ou contagem ausente devolve o texto do problema. */
async function contar(consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>, rotulo: string): Promise<number | string> {
  const { count, error } = await consulta;
  if (error) return `${rotulo}: ${error.message}`;
  if (typeof count !== 'number') return `${rotulo}: contagem não veio`;
  return count;
}

function somar(partes: Record<string, number | string>): UsoDoCenario {
  for (const v of Object.values(partes)) if (typeof v === 'string') return { erro: v };
  const detalhe = partes as Record<string, number>;
  return { total: Object.values(detalhe).reduce((s, n) => s + n, 0), detalhe };
}

/** Respostas e conversas ligadas a um cenário A. */
export async function usoDoCenarioA(tdb: TenantDb, cenarioId: string): Promise<UsoDoCenario> {
  const [respostas, sessoes] = await Promise.all([
    contar(tdb.from('respostas').select('id', { count: 'exact', head: true }).eq('cenario_id', cenarioId), 'respostas'),
    contar(tdb.from('sessoes_avaliacao').select('id', { count: 'exact', head: true }).eq('cenario_id', cenarioId), 'sessoes_avaliacao'),
  ]);
  return somar({ respostas, sessoes_avaliacao: sessoes });
}

/** Fechamentos (Jornada e Onboarding) e reavaliações que serviram um cenário B. */
export async function usoDoCenarioB(tdb: TenantDb, cenarioId: string): Promise<UsoDoCenario> {
  const [jornada, onboarding, reavaliacao] = await Promise.all([
    contar(
      tdb.from('temporada_semana_progresso').select('id', { count: 'exact', head: true }).eq('feedback->>cenario_b_id', cenarioId),
      'fechamento (Jornada)',
    ),
    contar(
      tdb.from('temporada_semana_progresso').select('id', { count: 'exact', head: true }).contains('feedback', { cenarios: [{ cenario_b_id: cenarioId }] }),
      'fechamento (Onboarding)',
    ),
    contar(tdb.from('reavaliacao_sessoes').select('id', { count: 'exact', head: true }).eq('cenario_b_id', cenarioId), 'reavaliacao_sessoes'),
  ]);
  return somar({ fechamento_jornada: jornada, fechamento_onboarding: onboarding, reavaliacao_sessoes: reavaliacao });
}
