/**
 * Mapeamento comportamental CONTÍNUO (spec_version ≥ 2).
 *
 * O Mapeamento mede o alinhamento do DISC da pessoa com os POLOS escolhidos no
 * gabarito (tela1). A versão legada (v1) era BINÁRIA: 1 se a pessoa está no lado
 * do polo, 0 senão — uma função degrau das mesmas comparações de DISC que
 * `destaquesBipolares` usa. Problema (medido): dentro de um pool do mesmo
 * arquétipo, candidatos caem no MESMO lado de ~12 dos 14 pares → Mapeamento
 * quase CONSTANTE (não discrimina) e ainda colinear com o bloco DISC.
 *
 * v2 torna isso CONTÍNUO: pontua pela MARGEM da comparação (quão forte a pessoa
 * está no lado do polo), normalizada pela amplitude do par, via logística. Mesma
 * filosofia graduada do resto do motor (binário→trapezoidal). É 100% derivado do
 * DISC — por isso o peso do bloco foi rebaixado (ver role-spec, cap v2).
 *
 * As 24 expressões espelham EXATAMENTE `destaquesBipolares` (perfil-organizacional
 * /aggregate). A margem "para o polo da ESQUERDA" = leftExpr − rightExpr.
 */
import type { DiscMedia } from '@/lib/perfil-organizacional/aggregate';

const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

type MarginFn = (m: DiscMedia) => number;
const ic: MarginFn = (m) => m.i - m.c;
const ds: MarginFn = (m) => m.d - m.s;
const isf: MarginFn = (m) => m.i - m.s;
const dc: MarginFn = (m) => m.d - m.c;
const di_sc: MarginFn = (m) => (m.d + m.i) - (m.s + m.c);
const is_dc: MarginFn = (m) => (m.i + m.s) - (m.d + m.c);
const extro: MarginFn = (m) => (m.i + 0.4 * m.s) - (m.c + 0.4 * m.d);

// [polo esquerdo, polo direito, fn de margem (toward LEFT), amplitude máx]
const PARES: [string, string, MarginFn, number][] = [
  ['OTIMISTA', 'REALISTA', ic, 100],
  ['COMUNICATIVO', 'ANALISTA', ic, 100],
  ['GENERALISTA', 'DETALHISTA', di_sc, 200],
  ['ESTILO AGRESSIVO', 'ESTILO CONSULTIVO', ds, 100],
  ['MELHOR EM FALAR', 'MELHOR EM OUVIR', isf, 100],
  ['AVERSO A ROTINA', 'ROTINEIRO', di_sc, 200],
  ['DELEGA', 'CENTRALIZA', dc, 100],
  ['COMPREENSIVO', 'IMPARCIAL', is_dc, 200],
  ['CASUAL', 'FORMAL', ic, 100],
  ['FOCO EM RELACIONAMENTOS', 'FOCO NAS TAREFAS', is_dc, 200],
  ['ORIENTAÇÃO A RESULTADOS', 'ORIENTAÇÃO A PROCESSOS', ds, 100],
  ['EMOCIONAL', 'RACIONAL', is_dc, 200],
  ['DINÂMICO', 'ESTÁVEL', di_sc, 200],
  ['AGE COM FIRMEZA', 'AGE COM CONSENTIMENTO', ds, 100],
  ['COMANDANTE', 'CONCILIADOR', ds, 100],
  ['ASSUME RISCOS', 'PRUDENTE', dc, 100],
  ['OBJETIVO', 'SISTEMÁTICO', dc, 100],
  ['CRIA DO ZERO', 'APRIMORA O QUE JÁ EXISTE', di_sc, 200],
  ['MULTITAREFAS', 'ESPECIALISTA', ic, 100],
  ['INSPIRADOR', 'TÉCNICO', ic, 100],
  ['EXTROVERTIDO', 'INTROVERTIDO', extro, 140],
  ['OUSADO', 'CONSERVADOR', dc, 100],
  ['AGE COM VELOCIDADE', 'AGE COM PLANEJAMENTO', di_sc, 200],
  ['PRÁTICO', 'TEÓRICO', dc, 100],
];

// polo (normalizado) → { fn de margem, sinal (+1 esquerda / −1 direita), amplitude }
const POLO = new Map<string, { f: MarginFn; sign: number; range: number }>();
for (const [l, r, f, range] of PARES) {
  POLO.set(norm(l), { f, sign: 1, range });
  POLO.set(norm(r), { f, sign: -1, range });
}

const logistic = (x: number) => 1 / (1 + Math.exp(-4 * x));

/** Fit 0..1 da pessoa para um POLO do cargo (margem normalizada → logística). null se polo desconhecido. */
export function mapeamentoFitContinuo(m: DiscMedia, polo: string): number | null {
  const e = POLO.get(norm(polo));
  if (!e) return null;
  const s = (e.sign * e.f(m)) / e.range; // ∈ [-1, 1]
  return logistic(Math.max(-1, Math.min(1, s)));
}

/** Polo é reconhecível pelo instrumento? (mesma checagem do role-spec p/ criar o traço) */
export function poloReconhecivel(polo: string): boolean {
  return POLO.has(norm(polo));
}
