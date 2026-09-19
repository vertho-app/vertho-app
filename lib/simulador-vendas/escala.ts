import type { Saidas } from './schema';
import { mediaGeral } from '@/lib/simuladores/cobertura';
import {
  consolidarMatriz,
  escalaNativa14,
  regraDaVersao,
  usaRegraCobertura,
  type AvaliacaoMatriz,
} from './matriz-avaliacao';

/**
 * Notas 1 a 4 por competência e média geral de peso igual, a partir da matriz.
 * Da pace-7 em diante vale a regra de cobertura comum e a versão dela fica no
 * relatório (`regraCobertura`); a pace-6 continua lida como foi gerada.
 */
export function pontuacaoMatriz(matriz: AvaliacaoMatriz, versao?: string) {
  const comps = consolidarMatriz(matriz, versao);
  const nota = (codigo: string) => comps.find((c) => c.codigo === codigo)!.nota;
  return {
    PL: nota('PL'),
    P: nota('P'),
    A: nota('A'),
    C: nota('C'),
    E: nota('E'),
    Media: mediaGeral(comps, regraDaVersao(versao)).nota,
    escalaNota: '1-4' as const,
    ...(usaRegraCobertura(versao) ? { regraCobertura: regraDaVersao(versao).versao } : {}),
  };
}
export function notaPacePublica(
  nota: number | null | undefined,
  versao?: string,
) {
  if (nota == null || nota === 0) return null;
  return escalaNativa14(versao) ? nota : 1 + (3 * nota) / 10;
}
export function relatorioPacePublico(
  r: Saidas['gerente'] | null,
  versao?: string,
): Saidas['gerente'] | null {
  if (!r || r.escalaNota === '1-4') return r;
  if (r.Matriz)
    return {
      ...structuredClone(r),
      ...pontuacaoMatriz(r.Matriz, versao),
      escalaOriginal: '0-10',
    };
  return {
    ...structuredClone(r),
    escalaNota: '1-4',
    escalaOriginal: '0-10',
    P: notaPacePublica(r.P, versao),
    A: notaPacePublica(r.A, versao),
    C: notaPacePublica(r.C, versao),
    E: notaPacePublica(r.E, versao),
    Media: notaPacePublica(r.Media, versao),
    Violacoes: r.Violacoes.map((v) => ({
      ...v,
      reducao_aplicada: (v.reducao_aplicada * 3) / 10,
    })),
  };
}
