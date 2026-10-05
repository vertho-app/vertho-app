/**
 * Rateio do lançamento MENSAL pelas semanas da DRE (migration 280).
 *
 * Custo de infraestrutura, assinatura e comissão costuma chegar fechado por MÊS.
 * O lançamento mensal é UMA linha (`mes_competencia` = primeiro dia do mês) e é
 * esta função que o reparte nas semanas (segunda a domingo, BRT), na LEITURA:
 *
 *  - o valor do mês é rateado por DIA: cada semana recebe a parte dos dias dela
 *    que caem no mês, e uma semana que cruza dois meses recebe uma fatia de cada
 *    (setembro de 2026: a semana de 31/08 tem 6 dias de setembro, a de 28/09 tem 3);
 *  - **a soma das semanas é SEMPRE o valor do mês**. O arredondamento é feito
 *    sobre o ACUMULADO de dias, não semana a semana: arredondar cada fatia
 *    separado perde ou inventa centavo, e a soma deixaria de bater com a fatura.
 *
 * É pura e não olha a janela exibida: a fatia de uma semana é a mesma quer a tela
 * mostre 4 semanas, quer 52. Quem decide quais semanas contam é o `consolidar`.
 */

import { deCentavos, paraCentavos } from './dinheiro';
import { ehDataISO, rotuloSemana, segundaDaSemana, somarDias, type DataISO } from './semana';
import type { LancamentoDRE } from './tipos';

/** O primeiro dia do mês de `data` ('2026-09-17' → '2026-09-01'). */
export function primeiroDiaDoMes(data: DataISO): DataISO {
  return `${data.slice(0, 7)}-01`;
}

/** Verdadeiro só para data VÁLIDA que seja o dia 1. */
export function ehPrimeiroDiaDoMes(data: unknown): data is DataISO {
  return ehDataISO(data) && data.endsWith('-01');
}

/** Quantos dias tem o mês que começa em `mes`. */
export function diasNoMes(mes: DataISO): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** `mes` + `n` meses (n pode ser negativo). */
export function somarMesesAoMes(mes: DataISO, n: number): DataISO {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 'set/2026'. */
export function rotuloMes(mes: DataISO): string {
  return `${MES_CURTO[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
}

/** 'setembro de 2026'. */
export function rotuloMesLongo(mes: DataISO): string {
  return `${MES_LONGO[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
}

export interface ParteDaSemana {
  /** A segunda-feira da semana. */
  semana: DataISO;
  /** Quantos dias DESTA semana caem no mês. */
  dias: number;
  valorBrl: number;
}

/**
 * Reparte `valorBrl` do mês `mes` nas semanas que o tocam, proporcional aos dias.
 * A soma de `valorBrl` das partes é exatamente `valorBrl`.
 */
export function ratearMes(valorBrl: number, mes: DataISO): ParteDaSemana[] {
  if (!ehPrimeiroDiaDoMes(mes)) throw new Error(`mês inválido: ${mes} (use o dia 1)`);
  const total = paraCentavos(valorBrl);
  const dias = diasNoMes(mes);

  // Quantos dias de cada semana (em ordem) caem no mês.
  const semanas: Array<{ semana: DataISO; dias: number }> = [];
  for (let d = 0; d < dias; d++) {
    const semana = segundaDaSemana(somarDias(mes, d));
    const ultima = semanas[semanas.length - 1];
    if (ultima && ultima.semana === semana) ultima.dias += 1;
    else semanas.push({ semana, dias: 1 });
  }

  // Arredondamento sobre o ACUMULADO: cada fatia é a diferença de dois acumulados
  // arredondados, então a última fecha exatamente em `total`.
  let diasAcumulados = 0;
  let centavosAcumulados = 0;
  return semanas.map((s) => {
    diasAcumulados += s.dias;
    const ate = Math.round((total * diasAcumulados) / dias);
    const centavos = ate - centavosAcumulados;
    centavosAcumulados = ate;
    return { semana: s.semana, dias: s.dias, valorBrl: deCentavos(centavos) };
  });
}

/** As semanas (segundas) que o mês toca, em ordem. */
export function semanasDoMes(mes: DataISO): DataISO[] {
  return ratearMes(0, mes).map((p) => p.semana);
}

/**
 * Em que semanas e com que valor um lançamento cai, seja semanal ou mensal.
 * Lançamento incoerente (mensal sem mês, semanal sem semana) não aloca nada: o
 * banco recusa a combinação (`dre_lancamentos_periodo_coerente`), então isto só
 * protege contra linha lida de um estado impossível.
 */
export function alocarLancamento(
  l: Pick<LancamentoDRE, 'periodicidade' | 'semanaInicio' | 'mesCompetencia' | 'valorBrl'>,
): Array<{ semana: DataISO; valorBrl: number }> {
  if (l.periodicidade === 'mensal') {
    if (!ehPrimeiroDiaDoMes(l.mesCompetencia)) return [];
    return ratearMes(l.valorBrl, l.mesCompetencia).map(({ semana, valorBrl }) => ({ semana, valorBrl }));
  }
  return l.semanaInicio ? [{ semana: l.semanaInicio, valorBrl: l.valorBrl }] : [];
}

/** O período do lançamento por extenso: 'semana de 28/09 a 04/10' ou 'set/2026'. */
export function rotuloPeriodoDoLancamento(
  l: Pick<LancamentoDRE, 'periodicidade' | 'semanaInicio' | 'mesCompetencia'>,
): string {
  if (l.periodicidade === 'mensal' && l.mesCompetencia) return rotuloMes(l.mesCompetencia);
  return l.semanaInicio ? `semana de ${rotuloSemana(l.semanaInicio)}` : 'sem período';
}

/** Uma data de ordenação do lançamento (a semana ou o mês), para listar do mais novo ao mais antigo. */
export function chaveDeOrdem(l: Pick<LancamentoDRE, 'semanaInicio' | 'mesCompetencia'>): string {
  return l.mesCompetencia ?? l.semanaInicio ?? '';
}
