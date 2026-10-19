import {
  GESTORES_NA_ESCOLA, GESTORES_NA_MV, corteDeMinimo, municipiosDasRegioes, termosDeCidade,
} from '@/lib/mercado-potencial/filtros';
import { calcularMercadoScores, type MercadoScoringFilters } from '@/lib/mercado-potencial/scoring';
import { escaparLike } from '@/lib/sql-like';

/**
 * Cartões da tela Mercado Potencial sobre o FILTRO INTEIRO.
 *
 * A tabela traz só até o "Limite" (na visão Escola, 1.000 linhas por padrão), e os
 * cartões eram somados no navegador sobre essas linhas: medido em 19/10/2026, o print
 * do dono mostrava "1.000 de 25.540" com os cartões das 1.000. A soma agora é do banco
 * (RPC `mercado_potencial_totais`, mig 292), que só devolve contagens brutas; o TAM sai
 * de `calcularMercadoScores`, a mesma fórmula das linhas.
 *
 * Vive aqui, e não no `actions.ts`, porque um arquivo `'use server'` só exporta ação.
 */

export type VisaoDoFiltro = 'municipio' | 'rede' | 'escola';

/** Os filtros que restringem as LINHAS (preço, idade e ordem não restringem nada). */
export interface FiltrosDoBanco {
  uf?: string[];
  regioesMetropolitanas?: unknown;
  redes?: string[];
  municipioBusca?: string;
  inseMin?: number;
  inseMax?: number;
  professoresMin?: unknown;
  gestoresMin?: unknown;
}

/**
 * Parâmetros do filtro para os RPCs (`mercado_potencial_totais` e `mercado_potencial_linhas`,
 * que filtram pela mesma `mercado_potencial_base`, mig 293). Cada um sai do MESMO helper que
 * o `aplicarFiltrosBase` da action usa, com a mesma regra de "ligado": o conjunto tem que ser
 * o que o `count` do PostgREST conta, e a action confere as contagens antes de usar.
 * `null` = não filtra; região desconhecida vira `[]` (nenhuma linha), como na tabela.
 */
export function argsDoFiltro(visao: VisaoDoFiltro, filtros: FiltrosDoBanco) {
  const gestores = visao === 'escola' ? GESTORES_NA_ESCOLA : GESTORES_NA_MV;
  const gestMin = corteDeMinimo(filtros.gestoresMin);
  const cidades = termosDeCidade(filtros.municipioBusca);
  return {
    p_visao: visao,
    p_ufs: filtros.uf?.length ? filtros.uf : null,
    p_municipios_ibge: municipiosDasRegioes(filtros.regioesMetropolitanas),
    p_inse_min: filtros.inseMin != null ? filtros.inseMin : null,
    p_inse_max: filtros.inseMax != null ? filtros.inseMax : null,
    p_professores_min: corteDeMinimo(filtros.professoresMin),
    p_gestores_coluna_min: gestMin != null ? gestMin - gestores.diretorProxy : null,
    p_cidades: cidades.length ? cidades.map((c) => `%${escaparLike(c)}%`) : null,
    p_redes: visao !== 'municipio' && filtros.redes?.length ? filtros.redes : null,
  };
}

/** Uma linha do RPC: contagens e somas brutas, sem preço. */
export interface SomasDoFiltro {
  linhas: number;
  qt_escolas: number;
  qt_professores: number;
  qt_docs_jovens: number;
  qt_docs_0_24: number;
  qt_gestores: number;
}

const CAMPOS_DAS_SOMAS = ['linhas', 'qt_escolas', 'qt_professores', 'qt_docs_jovens', 'qt_docs_0_24', 'qt_gestores'] as const;

/**
 * Lê a linha que o RPC devolveu. Qualquer coisa fora do formato (sem linha, campo que
 * não é número) vira `null`, nunca zero: a tela volta a somar o que mostra, dizendo isso.
 */
export function somasDoRpc(data: unknown): SomasDoFiltro | null {
  const linha: any = Array.isArray(data) ? data[0] : data;
  if (!linha || typeof linha !== 'object') return null;
  const out: Partial<SomasDoFiltro> = {};
  for (const c of CAMPOS_DAS_SOMAS) {
    const n = Number(linha[c]);
    if (linha[c] == null || !Number.isFinite(n)) return null;
    out[c] = n;
  }
  return out as SomasDoFiltro;
}

/** Os cartões da tela. */
export interface TotaisDoFiltro {
  linhas: number;
  qt_escolas: number;
  qt_professores_total: number;
  qt_professores_onboarding: number;
  qt_gestores: number;
  tam_mensal_mentor_ia: number;
  tam_mensal_onboarding: number;
}

/**
 * Cartões a partir das somas brutas. O TAM e o "professores até a idade" são lineares
 * nas contagens, então a linha SOMADA pela fórmula dá o mesmo que somar o TAM linha a
 * linha (o teste prova; se a fórmula deixar de ser linear, ele quebra).
 *
 * `null` quando as somas não vieram OU não são do mesmo conjunto que a tabela contou
 * (`linhas` diferente do `count` exato): soma de outro filtro com cara de soma deste é
 * pior que a soma parcial avisada.
 */
export function consolidarTotais(
  somas: SomasDoFiltro | null,
  totalNoBanco: number | null | undefined,
  filtros: MercadoScoringFilters,
): TotaisDoFiltro | null {
  if (!somas || typeof totalNoBanco !== 'number' || somas.linhas !== totalNoBanco) return null;
  const s = calcularMercadoScores(somas, filtros);
  return {
    linhas: somas.linhas,
    qt_escolas: somas.qt_escolas,
    qt_professores_total: s.qt_professores_total,
    qt_professores_onboarding: s.qt_professores_onboarding,
    qt_gestores: somas.qt_gestores,
    tam_mensal_mentor_ia: s.tam_mensal_mentor_ia,
    tam_mensal_onboarding: s.tam_mensal_onboarding,
  };
}

/** Quem só quer as linhas (exportação, plano do enriquecimento) pula a soma. */
export interface OpcoesDaLeitura { totais?: boolean }

/**
 * Chama o RPC. Nunca lança: falha vira `null` e a tela soma o que mostra, avisando.
 * O log leva só a mensagem do banco, sem filtro nem linha.
 */
export async function lerSomasDoFiltro(
  sb: any, visao: VisaoDoFiltro, filtros: FiltrosDoBanco, opcoes: OpcoesDaLeitura = {},
): Promise<SomasDoFiltro | null> {
  if (opcoes.totais === false) return null;
  try {
    const { data, error } = await sb.rpc('mercado_potencial_totais', argsDoFiltro(visao, filtros));
    if (error) {
      console.error('[mercado-potencial] totais do filtro falharam:', error.message);
      return null;
    }
    return somasDoRpc(data);
  } catch (e) {
    console.error('[mercado-potencial] totais do filtro falharam:', e instanceof Error ? e.message : typeof e);
    return null;
  }
}

/** Cartões do filtro inteiro, só se a soma for do MESMO conjunto que a tabela contou. */
export function totaisDaLeitura(
  visao: VisaoDoFiltro, somas: SomasDoFiltro | null, totalNoBanco: number | null | undefined, filtros: MercadoScoringFilters,
): TotaisDoFiltro | null {
  const totais = consolidarTotais(somas, totalNoBanco, filtros);
  if (somas && !totais) {
    console.error('[mercado-potencial] totais do filtro divergem da contagem da tabela', { visao, somadas: somas.linhas, contadas: totalNoBanco ?? null });
  }
  return totais;
}
