import type { EmpresaConfig } from './types';

/**
 * A empresa usa o Mapeamento Comportamental (DISC) NATIVO da Vertho?
 *
 * Não usa quem tem fonte externa de perfil (`perfil_externo_fonte`: OPQ32,
 * Hogan…). É o mesmo sinal que `canAccessMapeamentoCenarios` e
 * `verificarDisponibilidadeMapeamento` já leem — `perfil_comportamental_liberado
 * = false` sozinho NÃO conta: é estado transitório da turma, e sem fonte externa
 * o assessment nem abre (o perfil é pré-requisito dele).
 */
export function usaMapeamentoComportamentalNativo(config: EmpresaConfig | null | undefined): boolean {
  return !(config || {}).perfil_externo_fonte;
}

/**
 * Preferências de aprendizagem (8 formatos, 1 a 5 estrelas) moram, para quem usa
 * o DISC nativo, na última etapa do mapeamento comportamental. Quem NÃO usa essa
 * etapa nunca as preencheria — então o formulário é pedido logo depois da
 * PRIMEIRA competência respondida do primeiro mapeamento (o assessment).
 *
 * ⚠️ "Primeira competência", não "mapeamento concluído": o assessment tem 5-6
 * competências, respondidas ao longo de dias. Pedir só no fim (como saiu em
 * 01/10) fazia a pessoa terminar a primeira e não ver a tela.
 *
 * Só pede quando a pessoa ainda não preencheu: a tela é uma etapa, não um
 * recadastro a cada visita.
 */
export function precisaPreferenciasAprendizagem(args: {
  config: EmpresaConfig | null | undefined;
  jaPreencheu: boolean;
  primeiraCompetenciaRespondida: boolean;
}): boolean {
  if (!args.primeiraCompetenciaRespondida) return false;
  if (args.jaPreencheu) return false;
  return !usaMapeamentoComportamentalNativo(args.config);
}

/**
 * Os formatos da tela, na ordem, com a coluna de `colaboradores` de cada um.
 *
 * "Vídeo longo" saiu da tela em 02/10/2026, mas a coluna `pref_video_longo` segue
 * no banco e o motor lê `max(pref_video_curto, pref_video_longo)` como o score do
 * vídeo (`formato-preferido.ts`, `entrega-semana.ts`). Por isso ao salvar ela é
 * ZERADA: quem preenche de novo e tinha 5 estrelas antigas em vídeo longo teria
 * esse valor vencendo o que acabou de dizer sobre vídeo curto.
 */
export const FORMATOS_PREFERENCIA = [
  { id: 'video_short', coluna: 'pref_video_curto' },
  { id: 'text', coluna: 'pref_texto' },
  { id: 'audio', coluna: 'pref_audio' },
  { id: 'infographic', coluna: 'pref_infografico' },
  { id: 'exercise', coluna: 'pref_exercicio' },
  { id: 'mentor', coluna: 'pref_mentor' },
  { id: 'case', coluna: 'pref_estudo_caso' },
] as const;

export type FormatoPreferenciaId = (typeof FORMATOS_PREFERENCIA)[number]['id'];

/** Quantos formatos a pessoa ordena. A nota gravada vai de 1 (último) a N (primeiro). */
export const N_FORMATOS = FORMATOS_PREFERENCIA.length;

/**
 * Ordem (do formato que MAIS ajuda ao que MENOS ajuda) -> nota por formato.
 * O primeiro recebe N, o último 1: ordenação total, sem empate. Era isso que as
 * estrelas não davam — 46% da base tinha empate no topo entre os formatos que o
 * motor usa (medido 02/10/2026), e o empate se resolvia por ordem fixa (vídeo).
 *
 * As colunas `pref_*` seguem inteiras; o motor só COMPARA (`max`/`sort`), então
 * a escala 1..N funciona sem mudar quem lê. Quem respondeu em estrelas (1-5)
 * mantém o que tem: ninguém é obrigado a refazer.
 */
export function prefsDeOrdem(ordem: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  ordem.forEach((id, i) => { out[id] = ordem.length - i; });
  return out;
}

/**
 * Notas -> ordem, SE forem uma ordenação completa (permutação de 1..N). Notas em
 * estrelas (1-5, com empate) devolvem `null`: não são uma ordem e não pré-preenchem nada.
 */
export function ordemDePrefs(prefs: unknown): string[] | null {
  if (!prefs || typeof prefs !== 'object') return null;
  const vistos = new Set<number>();
  const pares: Array<[string, number]> = [];
  for (const f of FORMATOS_PREFERENCIA) {
    const v = (prefs as Record<string, unknown>)[f.id];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > N_FORMATOS || vistos.has(v)) return null;
    vistos.add(v);
    pares.push([f.id, v]);
  }
  return pares.sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * Valida o que veio do cliente: uma ORDENAÇÃO COMPLETA dos formatos da tela (cada
 * nota de 1 a N, sem repetir). Devolve as colunas prontas para o update, ou `null`
 * se faltar formato, repetir nota ou sair do intervalo (ordem parcial não é ordem).
 */
export function colunasDePreferencias(prefs: unknown): Record<string, number> | null {
  const ordem = ordemDePrefs(prefs);
  if (!ordem) return null;
  const out: Record<string, number> = {};
  for (const f of FORMATOS_PREFERENCIA) out[f.coluna] = (prefs as Record<string, number>)[f.id];
  out.pref_video_longo = 0; // formato aposentado da tela: ver FORMATOS_PREFERENCIA
  return out;
}
