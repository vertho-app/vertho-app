import { parametrosDoScore, type MercadoScoringFilters } from '@/lib/mercado-potencial/scoring';
import { argsDoFiltro, type FiltrosDoBanco, type VisaoDoFiltro } from '@/lib/mercado-potencial/totais';

/**
 * Tabela do Mercado Potencial: as N primeiras do FILTRO INTEIRO na ordem escolhida.
 *
 * A action lia as N primeiras linhas pela CHAVE e só então ordenava: com 25.540 escolas e
 * limite 1.000, a tabela "por score" eram as 1.000 de menor INEP. Ler o filtro inteiro para
 * ordenar no servidor custa 4,5 s em MG e 9 a 15 s no Brasil a cada clique (medido em
 * 19/10/2026), então a ordem vem do banco (`mercado_potencial_linhas`, mig 293), que espelha
 * `ordenarLinhas` + `calcularMercadoScores`. A action confere a contagem com o PostgREST e a
 * ordem com os valores do TS; se algo não bater, volta à leitura por chave e a tela avisa
 * que a ordem é parcial.
 *
 * Vive aqui, e não no `actions.ts`, porque um arquivo `'use server'` só exporta ação.
 */

/** As colunas que a tela ordena (os `<Th coluna=…>` da página). Qualquer outra vira score. */
export const ORDENS = [
  'nome', 'uf', 'rede', 'qt_escolas', 'qt_professores', 'qt_professores_onboarding', 'qt_gestores',
  'pct_jovens', 'pct_sem_pos', 'inse_medio', 'tam_mensal_mentor_ia', 'tam_mensal_onboarding',
  'fit_pedagogico', 'score_completo',
] as const;
export type ColunaDeOrdem = typeof ORDENS[number];
export interface OrdemDaTela { orderBy: ColunaDeOrdem; orderDir: 'asc' | 'desc' }

/** A ordem pedida pelo cliente (a action é endpoint), saneada uma vez: o MESMO valor vai ao SQL e ao sort. */
export function normalizarOrdem(filtros: { orderBy?: unknown; orderDir?: unknown }): OrdemDaTela {
  const orderBy = (ORDENS as readonly unknown[]).includes(filtros.orderBy) ? filtros.orderBy as ColunaDeOrdem : 'score_completo';
  return { orderBy, orderDir: filtros.orderDir === 'asc' ? 'asc' : 'desc' };
}

/** O sort da tela: nulo vale -Infinity e empate fica na ordem de chegada (que é a da chave). */
export function ordenarLinhas<T extends Record<string, any>>(rows: T[], ordem: OrdemDaTela): T[] {
  const mult = ordem.orderDir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const av = a[ordem.orderBy] ?? -Infinity;
    const bv = b[ordem.orderBy] ?? -Infinity;
    if (av === bv) return 0;
    return av < bv ? -1 * mult : 1 * mult;
  });
}

/** Parâmetros do `mercado_potencial_linhas`: o filtro, os preços e a idade efetivos do score, a ordem e o limite. */
export function argsDasLinhas(visao: VisaoDoFiltro, filtros: FiltrosDoBanco & MercadoScoringFilters, ordem: OrdemDaTela, limite: number) {
  const { precoProf, precoGestor, idadeCorte } = parametrosDoScore(filtros);
  return {
    ...argsDoFiltro(visao, filtros),
    p_preco_prof: precoProf,
    p_preco_gestor: precoGestor,
    p_idade: idadeCorte,
    p_ordem: ordem.orderBy,
    p_desc: ordem.orderDir === 'desc',
    p_limite: limite,
  };
}

export interface LinhasOrdenadas { total: number; linhas: any[] }

/** O jsonb `{ total, linhas }` do RPC. Fora do formato vira `null` (a action cai na leitura por chave). */
export function linhasDoRpc(data: unknown): LinhasOrdenadas | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { total, linhas } = data as { total?: unknown; linhas?: unknown };
  const n = Number(total);
  if (total == null || !Number.isInteger(n) || !Array.isArray(linhas) || n < linhas.length) return null;
  return { total: n, linhas };
}

/** Chama o RPC. Nunca lança; o log leva só a mensagem do banco. */
export async function lerLinhasOrdenadas(
  sb: any, visao: VisaoDoFiltro, filtros: FiltrosDoBanco & MercadoScoringFilters, ordem: OrdemDaTela, limite: number,
): Promise<LinhasOrdenadas | null> {
  try {
    const { data, error } = await sb.rpc('mercado_potencial_linhas', argsDasLinhas(visao, filtros, ordem, limite));
    if (error) {
      console.error('[mercado-potencial] ordem global falhou:', error.message);
      return null;
    }
    const r = linhasDoRpc(data);
    if (!r && data != null) console.error('[mercado-potencial] ordem global devolveu formato inesperado');
    return r;
  } catch (e) {
    console.error('[mercado-potencial] ordem global falhou:', e instanceof Error ? e.message : typeof e);
    return null;
  }
}

/**
 * O total que o SQL filtrou é o que o PostgREST conta com `aplicarFiltrosBase`? Se não for,
 * o filtro do SQL se separou do da action: a ordem do banco é descartada (a action lê por chave).
 */
export function contagemConfere(visao: VisaoDoFiltro, doBanco: number, doPostgrest: number | null, erro?: string): boolean {
  if (erro == null && doPostgrest === doBanco) return true;
  console.error('[mercado-potencial] ordem global descartada: contagem diverge do PostgREST', { visao, doBanco, doPostgrest, erro: erro ?? null });
  return false;
}

/**
 * A ordem que o banco devolveu bate com os valores que o TS calculou? Confere par a par, com
 * folga de arredondamento nos números. Não bater quer dizer que a conta do SQL e a do
 * `scoring.ts` se separaram, e as N escolhidas podem não ser as N primeiras.
 */
export function ordemConfere(rows: Record<string, any>[], ordem: OrdemDaTela, visao: VisaoDoFiltro): boolean {
  const desc = ordem.orderDir === 'desc';
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1][ordem.orderBy] ?? -Infinity;
    const b = rows[i][ordem.orderBy] ?? -Infinity;
    if (a === b) continue;
    let fora: boolean;
    if (a === -Infinity || b === -Infinity) fora = desc ? a === -Infinity : b === -Infinity;
    else if (typeof a === 'number' && typeof b === 'number') {
      const folga = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
      fora = desc ? b - a > folga : a - b > folga;
    } else fora = desc ? a < b : a > b;
    if (fora) {
      console.error('[mercado-potencial] ordem do banco diverge do TS', { visao, coluna: ordem.orderBy, posicao: i });
      return false;
    }
  }
  return true;
}
