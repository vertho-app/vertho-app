/**
 * REGRA DE COBERTURA comum aos três simuladores (vendas, atendimento, liderança).
 *
 * 🔑 Decisão do dono (18/09/2026):
 *   - uma competência só recebe NÍVEL com pelo menos 4 descritores observados;
 *   - a média geral só existe com pelo menos 3 competências com nível.
 *
 * Por que existe: até aqui a nota de uma competência era a média dos
 * descritores observados, qualquer que fosse o número deles, e a média geral
 * usava as competências que tivessem ao menos UM. Dar nível exige citação
 * literal, deixar sem nota não exige nada. O efeito medido na revisão de 18/09:
 * uma conversa curta, com um plano N3, uma abertura N3 e uma boa pergunta,
 * fechava em 3,0 (a meta), à frente de quem percorria todas as etapas com
 * alguns N2; e uma competência com 1 descritor observado pesava o mesmo que uma
 * com 6. O Mapeamento de liderança já tratava menos de 3 descritores como sinal
 * fraco (`DESCRITORES_MIN_CONFIAVEL`).
 *
 * A regra vale para avaliações NOVAS e é gravada no relatório (`regraCobertura`):
 * histórico concluído não é recalculado, como em todo o resto dos simuladores.
 * O nível sai sempre de `nivelDaNota` (fonte única da régua N1 a N4).
 */
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';

export interface RegraCobertura {
  versao: string;
  minDescritores: number;
  minCompetencias: number;
}

export const REGRA_COBERTURA: RegraCobertura = Object.freeze({
  versao: 'cobertura-4de6-3comp',
  minDescritores: 4,
  minCompetencias: 3,
});

export interface CompetenciaConsolidada {
  /** Descritores com nível atribuído. */
  observados: number;
  /** Descritores avaliados nesta competência (os que o cenário se propõe a observar). */
  total: number;
  /** Média 1 a 4 dos observados; só existe quando a cobertura é suficiente. */
  nota: number | null;
  nivel: Nivel | null;
  /** A competência atingiu o mínimo de descritores observados. */
  suficiente: boolean;
}

/**
 * Consolida uma competência a partir dos níveis dos seus descritores
 * (`null` = sem oportunidade de observar). Abaixo do mínimo não há nota nem
 * nível: mostrar a média de 1 ou 2 descritores ancoraria a leitura num número
 * que a própria régua não sustenta.
 */
export function consolidarCompetencia(
  niveis: ReadonlyArray<number | null | undefined>,
  regra: RegraCobertura = REGRA_COBERTURA,
): CompetenciaConsolidada {
  const observados = niveis.filter((n): n is number => typeof n === 'number');
  const suficiente = observados.length >= regra.minDescritores;
  const nota = suficiente ? observados.reduce((s, n) => s + n, 0) / observados.length : null;
  return {
    observados: observados.length,
    total: niveis.length,
    nota,
    nivel: nota === null ? null : nivelDaNota(nota),
    suficiente,
  };
}

export interface MediaGeral {
  nota: number | null;
  nivel: Nivel | null;
  /** Quantas competências entraram na média. */
  competencias: number;
  suficiente: boolean;
}

/** Média geral de peso igual entre as competências COM nível. */
export function mediaGeral(
  competencias: ReadonlyArray<{ nota: number | null }>,
  regra: RegraCobertura = REGRA_COBERTURA,
): MediaGeral {
  const com = competencias.filter((c): c is { nota: number } => typeof c.nota === 'number');
  const suficiente = com.length >= regra.minCompetencias;
  const nota = suficiente ? com.reduce((s, c) => s + c.nota, 0) / com.length : null;
  return {
    nota,
    nivel: nota === null ? null : nivelDaNota(nota),
    competencias: com.length,
    suficiente,
  };
}
