/**
 * EIXO Y da matriz — a POSIÇÃO: o que a pessoa demonstrou nas competências do
 * programa, a partir das notas por descritor (`descriptor_assessments.nota`).
 *
 * Puro: zero I/O. Quem chama já leu as notas e as competências do programa.
 *
 * Duas decisões de régua, e o motivo de cada uma:
 *
 * 1. A classificação usa a NOTA e `nivelDaNota`, nunca a coluna
 *    `descriptor_assessments.nivel`. Essa coluna é GENERATED ALWAYS no banco com
 *    cortes 1,5 / 2,5 / 3,5 — e a régua oficial do produto (`lib/nivel-regua.ts`)
 *    é 2,0 / 3,0 / 3,5. Nota 1,7 é "em desenvolvimento" na coluna e N1 na régua.
 *    O módulo segue a régua oficial; a divergência da coluna está registrada como
 *    pendência do dono.
 *
 * 2. O corte NÃO é binário: há uma ZONA DE REVISÃO de ±`banda` em torno dele.
 *    Medido em 09/09/2026 no instrumento de conversa: reler a MESMA entrada cinco
 *    vezes moveu a média por pessoa com desvio 0,07 e amplitude máxima 0,33, e
 *    34% das notas caem exatamente sobre 2,00 ou 3,00. Classificar por máquina
 *    dentro da banda é classificar ruído — quem cai nela vai para leitura humana.
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

export type Posicao = 'demonstra' | 'zona_de_revisao' | 'nao_demonstra';

export const POSICAO_LABEL: Record<Posicao, string> = {
  demonstra: 'Demonstra',
  zona_de_revisao: 'Zona de revisão',
  nao_demonstra: 'Não demonstra',
};

export interface CompetenciaPosicao {
  competencia: string;
  /** Média das notas dos descritores avaliados. `null` = não avaliada. */
  media: number | null;
  nivel: Nivel | null;
  descritores: number;
  posicao: Posicao | null;
  /** Média no ramo de baixo da banda: é gap nomeável no parecer. */
  gap: boolean;
}

export interface PosicaoPessoa {
  colaboradorId: string;
  competencias: CompetenciaPosicao[];
  cobertas: number;
  total: number;
  /** Todas as competências do programa têm ao menos um descritor avaliado. */
  completo: boolean;
  faltantes: string[];
  /** Média das médias por competência — só quando completo. */
  mediaGeral: number | null;
  nivelGeral: Nivel | null;
  /** Posição da PESSOA (pela média geral). `null` enquanto incompleto. */
  posicao: Posicao | null;
  /** Competências com média no ramo de baixo (≤ corte − banda). */
  gaps: string[];
}

/** 3 + 0,33 não é 3,33 em binário; a fronteira exata precisa de folga. */
const EPS = 1e-9;

/**
 * Classifica uma média contra o corte com banda:
 *   ≥ corte + banda → demonstra · ≤ corte − banda → não demonstra · entre → zona.
 * Com banda 0 vira o corte simples (≥ corte demonstra).
 */
export function classificarNota(media: number, corte: number, banda: number): Posicao {
  const b = Math.max(0, banda);
  if (media >= corte + b - EPS) return 'demonstra';
  if (b > 0 && media <= corte - b + EPS) return 'nao_demonstra';
  if (b === 0) return 'nao_demonstra';
  return 'zona_de_revisao';
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Posição de cada pessoa presente em `notas`, nas `competencias` do programa
 * (na ordem dada). Pessoas sem nenhuma nota nas competências do programa não
 * aparecem — quem chama decide como listá-las (incompletas / não iniciadas).
 */
export function calcularPosicoes(
  notas: NotaDescritor[],
  competencias: string[],
  corte: number,
  banda: number,
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
        return { competencia: nome, media: null, nivel: null, descritores: 0, posicao: null, gap: false };
      }
      // Um descritor com mais de uma linha (grafias que a normalização junta) entra pela média dele.
      const mediasDesc = [...descs.values()].map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
      const media = arred2(mediasDesc.reduce((a, b) => a + b, 0) / mediasDesc.length);
      const posicao = classificarNota(media, corte, banda);
      return {
        competencia: nome, media, nivel: nivelDaNota(media), descritores: descs.size, posicao,
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
      posicao: mediaGeral == null ? null : classificarNota(mediaGeral, corte, banda),
      gaps: linhas.filter((l) => l.gap).map((l) => l.competencia),
    });
  }
  return out;
}
