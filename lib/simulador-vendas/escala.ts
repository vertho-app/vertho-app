import type { Saidas } from './schema';
import { consolidarMatriz, type AvaliacaoMatriz } from './matriz-avaliacao';

export function pontuacaoMatriz(matriz: AvaliacaoMatriz) {
  const comps = consolidarMatriz(matriz);
  const nota = (codigo: string) => comps.find((c) => c.codigo === codigo)!.nota;
  const observadas = comps.filter((c) => c.nota !== null);
  return {
    PL: nota('PL'),
    P: nota('P'),
    A: nota('A'),
    C: nota('C'),
    E: nota('E'),
    Media: observadas.length
      ? observadas.reduce((s, c) => s + c.nota!, 0) / observadas.length
      : null,
    escalaNota: '1-4' as const,
  };
}
export function notaPacePublica(
  nota: number | null | undefined,
  versao?: string,
) {
  if (nota == null || nota === 0) return null;
  return versao === 'pace-6' ? nota : 1 + (3 * nota) / 10;
}
export function relatorioPacePublico(
  r: Saidas['gerente'] | null,
  versao?: string,
): Saidas['gerente'] | null {
  if (!r || r.escalaNota === '1-4') return r;
  if (r.Matriz)
    return {
      ...structuredClone(r),
      ...pontuacaoMatriz(r.Matriz),
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
