/**
 * O que o CLIENTE (RH da empresa) recebe do Mapeamento de liderança: nível de
 * 1 a 4, nunca a nota decimal (decisão 1 do dono, revisão de 02/10/2026:
 * "ninguém do cliente vê nota decimal; a nota decimal fica só no admin da
 * Vertho"). Puro.
 *
 * A projeção acontece no SERVIDOR, na porta do RH (`actions/prontidao-lideranca.ts`),
 * e não só na tela: esconder o número na renderização deixaria a média, o corte
 * e a nota de cada comportamento no corpo da resposta, legíveis no navegador.
 * O preview do admin da Vertho segue com os números (`exibeNota: true`).
 *
 * O que muda para o cliente:
 *   - média geral, média por competência, nota por comportamento, confiança e
 *     corte saem; ficam o nível (régua oficial, `lib/nivel-regua.ts`) e o
 *     nível-meta do programa;
 *   - as frases de gap ancoradas em média e corte saem (a tela monta a frase
 *     com o nível, no idioma da pessoa);
 *   - a aderência de estilo vai em porcentagem inteira, sem casa decimal;
 *   - dentro de cada quadrante a lista vai em ordem alfabética: a ordem pela
 *     média era um ranking pelo número que não se mostra.
 */
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';
import type { Parecer, ProntidaoLideranca } from './agregar';
import { ORDEM_QUADRANTES, type LinhaMatriz } from './matriz';

/**
 * O nível que o corte representa. O corte é decimal no `sys_config` (padrão
 * 3,00 = N3); só um corte que cai EXATAMENTE numa fronteira da régua vira
 * nível sem mentir. Fora disso (um 2,75 gravado à mão) a tela diz "meta do
 * programa" sem número, em vez de arredondar para um nível que classificaria
 * diferente.
 */
export function nivelMeta(corte: number | null | undefined): Nivel | null {
  const c = Number(corte);
  if (!Number.isFinite(c)) return null;
  return c === 1 || c === 2 || c === 3 ? (c as Nivel) : null;
}

const inteiro = (v: number) => Math.round(Number(v) || 0);

function linhaParaCliente(l: LinhaMatriz): LinhaMatriz {
  return {
    ...l,
    posicao: {
      ...l.posicao,
      mediaGeral: null,
      competencias: (l.posicao?.competencias || []).map((c) => ({ ...c, media: null })),
    },
    estilo: {
      ...l.estilo,
      aderenciaPct: inteiro(l.estilo?.aderenciaPct),
      lacunas: (l.estilo?.lacunas || []).map((g) => ({ ...g, fitPct: inteiro(g.fitPct) })),
    },
    frasesGap: [],
  };
}

function ordemAlfabetica(linhas: LinhaMatriz[]): LinhaMatriz[] {
  const peso = new Map(ORDEM_QUADRANTES.map((q, i) => [q, i]));
  return [...linhas].sort((a, b) =>
    (peso.get(a.quadrante)! - peso.get(b.quadrante)!) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function prontidaoParaCliente(data: ProntidaoLideranca): ProntidaoLideranca {
  return {
    ...data,
    corte: null,
    metaNivel: nivelMeta(data.corte),
    exibeNota: false,
    faixas: null,
    linhas: ordemAlfabetica((data.linhas || []).map(linhaParaCliente)),
  };
}

export function parecerParaCliente(p: Parecer): Parecer {
  return {
    ...p,
    corte: null,
    metaNivel: nivelMeta(p.corte),
    exibeNota: false,
    linha: linhaParaCliente(p.linha),
    evidencias: (p.evidencias || []).map((ev) => ({
      ...ev,
      descritores: ev.descritores.map((d) => ({
        ...d,
        nivel: d.nivel ?? (d.nota == null ? null : nivelDaNota(d.nota)),
        nota: null,
        confianca: null,
      })),
    })),
  };
}
