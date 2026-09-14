/**
 * EIXO Y da matriz, a POSIÇÃO: o que a pessoa demonstrou nas competências do
 * programa, a partir das notas por descritor (`descriptor_assessments.nota`).
 *
 * Puro: zero I/O. Quem chama já leu as notas e as competências do programa.
 *
 * Uma decisão de régua, e o motivo dela: a classificação usa a NOTA e
 * `nivelDaNota`, nunca a coluna `descriptor_assessments.nivel`. Essa coluna é
 * GENERATED ALWAYS no banco com cortes 1,5 / 2,5 / 3,5, e a régua oficial do
 * produto (`lib/nivel-regua.ts`) é 2,0 / 3,0 / 3,5. Nota 1,7 é "em
 * desenvolvimento" na coluna e N1 na régua. O módulo segue a régua oficial; a
 * divergência da coluna está registrada como pendência do dono.
 *
 * O corte é BINÁRIO: média igual ou acima demonstra, abaixo não demonstra.
 * Existiu aqui uma "banda de revisão" (uma faixa de ±0,33 em torno do corte onde
 * ninguém era classificado por máquina, emprestada do ruído medido no
 * instrumento de conversa). O dono a descartou em 14/09/2026: um terceiro estado
 * que nenhuma tela sabia resolver custava mais do que protegia.
 */
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';
import { chaveDescritor } from '@/lib/descritores';
import { chaveCompetencia } from './config';

export interface NotaDescritor {
  colaboradorId: string;
  competencia: string;
  descritor: string;
  nota: number;
}

export type Posicao = 'demonstra' | 'nao_demonstra';

export const POSICAO_LABEL: Record<Posicao, string> = {
  demonstra: 'Demonstra',
  nao_demonstra: 'Não demonstra',
};

export interface CompetenciaPosicao {
  competencia: string;
  /** Média das notas dos descritores avaliados. `null` = não avaliada. */
  media: number | null;
  nivel: Nivel | null;
  descritores: number;
  /**
   * Coberta com POUCOS descritores (menos de `DESCRITORES_MIN_CONFIAVEL`): a
   * média existe, mas vem de 1 ou 2 notas. A IA4 grava a régua inteira de
   * uma vez, então isto é sinal de omissão do modelo ou de régua curta, e o
   * parecer avisa em vez de esconder.
   */
  parcial: boolean;
  posicao: Posicao | null;
  /** Média abaixo do corte: é gap nomeável no parecer. */
  gap: boolean;
}

/** Abaixo disto a média de uma competência é sinal fraco (a régua canônica tem 6). */
export const DESCRITORES_MIN_CONFIAVEL = 3;

export interface PosicaoPessoa {
  colaboradorId: string;
  competencias: CompetenciaPosicao[];
  cobertas: number;
  total: number;
  /** Todas as competências do programa têm ao menos um descritor avaliado. */
  completo: boolean;
  faltantes: string[];
  /** Média das médias por competência, só quando completo. */
  mediaGeral: number | null;
  nivelGeral: Nivel | null;
  /** Posição da PESSOA (pela média geral). `null` enquanto incompleto. */
  posicao: Posicao | null;
  /** Competências com média abaixo do corte. */
  gaps: string[];
  /** Competências cobertas com poucos descritores: ver `CompetenciaPosicao.parcial`. */
  parciais: string[];
}

/** A média vem arredondada em 2 casas; a fronteira exata precisa de folga. */
const EPS = 1e-9;

/** Média igual ou acima do corte demonstra; abaixo, não demonstra. */
export function classificarNota(media: number, corte: number): Posicao {
  return media >= corte - EPS ? 'demonstra' : 'nao_demonstra';
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Posição de cada pessoa presente em `notas`, nas `competencias` do programa
 * (na ordem dada). Pessoas sem nenhuma nota nas competências do programa não
 * aparecem; quem chama decide como listá-las (incompletas / não iniciadas).
 */
export function calcularPosicoes(
  notas: NotaDescritor[],
  competencias: string[],
  corte: number,
): Map<string, PosicaoPessoa> {
  const ordem = competencias.map((c) => ({ nome: c, chave: chaveCompetencia(c) })).filter((c) => c.chave);
  const chavesPrograma = new Set(ordem.map((c) => c.chave));

  // pessoa → competência → descritor(chave) → notas
  const porPessoa = new Map<string, Map<string, Map<string, number[]>>>();
  for (const n of notas) {
    const comp = chaveCompetencia(n.competencia);
    if (!chavesPrograma.has(comp)) continue;
    const nota = Number(n.nota);
    if (!Number.isFinite(nota)) continue;
    const desc = chaveDescritor(n.descritor) || '(sem descritor)';
    const comps = porPessoa.get(n.colaboradorId) || new Map<string, Map<string, number[]>>();
    const descs = comps.get(comp) || new Map<string, number[]>();
    const arr = descs.get(desc) || [];
    arr.push(nota);
    descs.set(desc, arr);
    comps.set(comp, descs);
    porPessoa.set(n.colaboradorId, comps);
  }

  const out = new Map<string, PosicaoPessoa>();
  for (const [colaboradorId, comps] of porPessoa) {
    const linhas: CompetenciaPosicao[] = ordem.map(({ nome, chave }) => {
      const descs = comps.get(chave);
      if (!descs || !descs.size) {
        return { competencia: nome, media: null, nivel: null, descritores: 0, parcial: false, posicao: null, gap: false };
      }
      // Um descritor com mais de uma linha (grafias que a normalização junta) entra pela média dele.
      const mediasDesc = [...descs.values()].map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
      const media = arred2(mediasDesc.reduce((a, b) => a + b, 0) / mediasDesc.length);
      const posicao = classificarNota(media, corte);
      return {
        competencia: nome, media, nivel: nivelDaNota(media), descritores: descs.size,
        parcial: descs.size < DESCRITORES_MIN_CONFIAVEL, posicao,
        gap: posicao === 'nao_demonstra',
      };
    });
    const cobertas = linhas.filter((l) => l.media != null);
    const completo = ordem.length > 0 && cobertas.length === ordem.length;
    const mediaGeral = completo
      ? arred2(cobertas.reduce((a, l) => a + (l.media as number), 0) / cobertas.length)
      : null;
    out.set(colaboradorId, {
      colaboradorId,
      competencias: linhas,
      cobertas: cobertas.length,
      total: ordem.length,
      completo,
      faltantes: linhas.filter((l) => l.media == null).map((l) => l.competencia),
      mediaGeral,
      nivelGeral: mediaGeral == null ? null : nivelDaNota(mediaGeral),
      posicao: mediaGeral == null ? null : classificarNota(mediaGeral, corte),
      gaps: linhas.filter((l) => l.gap).map((l) => l.competencia),
      parciais: linhas.filter((l) => l.parcial).map((l) => l.competencia),
    });
  }
  return out;
}
