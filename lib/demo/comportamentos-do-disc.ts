/**
 * As colunas comportamentais (`comp_*` e `lid_*`) de uma persona demo, derivadas do DISC.
 *
 * Régua canônica de competências, a MESMA que o mapeamento real e o simulador usam: o
 * demo tinha derivação própria e produzia números que a plataforma nunca produz. Mora
 * fora de `reset-acme-demo.ts` porque o reset importa `next/headers` e o cliente do
 * banco, e o pacote offline (que monta o ranking de adequação sem rede nem credencial)
 * não pode arrastar o reset inteiro. O reset reexporta o nome, então os chamadores
 * antigos não mudam.
 */
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';

export function comportamentosDoDisc(D: number, I: number, S: number, C: number) {
  // Mesmo arredondamento do caminho real: executivo/motivador com 1 casa,
  // metódico/sistemático inteiros (mapeamento-actions.ts:116-119).
  const meio1 = (v: number) => Math.round((v / 2) * 10) / 10;
  const meio0 = (v: number) => Math.round(v / 2);
  const comp = computeDiscCompetenciesNatural({ D, I, S, C });
  return {
    lid_executivo: meio1(D), lid_motivador: meio1(I),
    lid_metodico: meio0(S), lid_sistematico: meio0(C),
    comp_ousadia: comp.Ousadia, comp_comando: comp.Comando, comp_objetividade: comp.Objetividade,
    comp_assertividade: comp.Assertividade, comp_persuasao: comp['Persuasão'], comp_extroversao: comp['Extroversão'],
    comp_entusiasmo: comp.Entusiasmo, comp_sociabilidade: comp.Sociabilidade, comp_empatia: comp.Empatia,
    comp_paciencia: comp['Paciência'], comp_persistencia: comp['Persistência'], comp_planejamento: comp.Planejamento,
    comp_organizacao: comp['Organização'], comp_detalhismo: comp.Detalhismo, comp_prudencia: comp['Prudência'],
    comp_concentracao: comp['Concentração'],
  };
}
