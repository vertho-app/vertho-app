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

/** Os 8 formatos, na ordem da tela, com a coluna de `colaboradores` de cada um. */
export const FORMATOS_PREFERENCIA = [
  { id: 'video_short', coluna: 'pref_video_curto' },
  { id: 'video_long', coluna: 'pref_video_longo' },
  { id: 'text', coluna: 'pref_texto' },
  { id: 'audio', coluna: 'pref_audio' },
  { id: 'infographic', coluna: 'pref_infografico' },
  { id: 'exercise', coluna: 'pref_exercicio' },
  { id: 'mentor', coluna: 'pref_mentor' },
  { id: 'case', coluna: 'pref_estudo_caso' },
] as const;

export type FormatoPreferenciaId = (typeof FORMATOS_PREFERENCIA)[number]['id'];

/**
 * Valida o que veio do cliente: as 8 chaves, cada uma inteiro de 1 a 5. Devolve
 * as colunas prontas para o update, ou `null` se qualquer chave faltar/for inválida
 * (parcial não grava — meio formulário não é preferência).
 */
export function colunasDePreferencias(prefs: unknown): Record<string, number> | null {
  if (!prefs || typeof prefs !== 'object') return null;
  const out: Record<string, number> = {};
  for (const f of FORMATOS_PREFERENCIA) {
    const v = (prefs as Record<string, unknown>)[f.id];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return null;
    out[f.coluna] = v;
  }
  return out;
}
