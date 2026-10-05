/**
 * O "previsto" de um contrato: o que o orçamento aprovado dizia.
 *
 * `orcamento_cenarios.resultado` é sobrescrito a cada `salvarOrcamento` (o botão
 * de salvar não olha se o cenário já virou proposta), então a DRE não compara o
 * realizado com o cenário vivo: copia a folha para `dre_contratos.previsto` na
 * hora em que o contrato é ligado ao orçamento. É a mesma razão do par
 * `entradas`/`resultado` da migration 253 (a régua evolui, o aprovado não).
 *
 * Só entra aqui o que o `ResumoOrcamento` congela. Impostos, comissão e horas
 * NÃO estão no resumo (a tela do orçamento os deriva de `valorFinal` e do
 * `pricing`); por isso o previsto compara TOTAIS e a IA, não categoria a
 * categoria. Ver `consolidar.ts` (`comparavel`).
 */

import { normalizarResumo } from '@/lib/orcamento/cenario';
import type { PrevistoContrato } from './tipos';

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Monta o previsto a partir das duas colunas de `orcamento_cenarios`.
 * `null` = o `resultado` não é uma folha reconhecível (linha anterior à folha).
 */
export function congelarPrevisto(
  resultadoBruto: unknown,
  entradasBrutas: unknown,
  orcamentoNome: string | null,
): PrevistoContrato | null {
  const r = normalizarResumo(resultadoBruto);
  if (!r) return null;
  const cotacao = numero(objeto(objeto(entradasBrutas).pricing).cotacao);
  return {
    valorFinal: r.valorFinal,
    parcela: r.parcela,
    parcelas: r.parcelas,
    custoTotalBrl: r.custoTotalBrl,
    custoIABrl: r.custoIABrl,
    custoOperacionalBrl: r.custoOperacionalBrl,
    margemPct: r.margemPct,
    mesesPrograma: r.mesesPrograma,
    piorSaldoMes: r.piorSaldo.mes,
    piorSaldoBrl: r.piorSaldo.saldo,
    cotacao: cotacao !== null && cotacao > 0 ? cotacao : null,
    orcamentoNome,
  };
}

/** Lê o jsonb `previsto` de um contrato. Campo ausente vira 0, nunca NaN. */
export function lerPrevisto(bruto: unknown): PrevistoContrato | null {
  const b = objeto(bruto);
  if (!Object.keys(b).length) return null;
  const n = (v: unknown) => numero(v) ?? 0;
  const cot = numero(b.cotacao);
  return {
    valorFinal: n(b.valorFinal),
    parcela: n(b.parcela),
    parcelas: Math.max(1, Math.floor(n(b.parcelas))),
    custoTotalBrl: n(b.custoTotalBrl),
    custoIABrl: n(b.custoIABrl),
    custoOperacionalBrl: n(b.custoOperacionalBrl),
    margemPct: n(b.margemPct),
    mesesPrograma: Math.max(1, Math.floor(n(b.mesesPrograma))),
    piorSaldoMes: Math.max(1, Math.floor(n(b.piorSaldoMes))),
    piorSaldoBrl: n(b.piorSaldoBrl),
    cotacao: cot !== null && cot > 0 ? cot : null,
    orcamentoNome: typeof b.orcamentoNome === 'string' ? b.orcamentoNome : null,
  };
}
