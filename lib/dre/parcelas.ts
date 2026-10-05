/**
 * Geração do calendário de parcelas de um contrato.
 *
 * O orçamento diz QUANTAS parcelas e de QUANTO (`ResumoOrcamento.parcelas` e
 * `.parcela`, parcelas iguais), mas não diz QUANDO: não existe data em nenhum
 * lugar do deal desk. A data da 1ª é escolhida na tela. Daí em diante é mensal,
 * no mesmo dia do mês (dia 31 cai no último dia dos meses mais curtos).
 *
 * Tudo que sai daqui é só PROPOSTA: o sócio edita parcela a parcela depois,
 * porque a vida real não segue o calendário do orçamento.
 */

import { deCentavos, paraCentavos } from './dinheiro';
import { ehDataISO, somarDias, type DataISO } from './semana';

export interface ParcelaGerada {
  numero: number;
  vencimento: DataISO;
  valorPrevistoBrl: number;
}

/** `data` + `meses` meses, preservando o dia ou caindo no último dia do mês. */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const [a, m, d] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), dia)).toISOString().slice(0, 10);
}

/**
 * Divide `valorTotalBrl` em `n` parcelas mensais. As `n - 1` primeiras são o
 * total dividido arredondado a centavo; a ÚLTIMA absorve a diferença, então a
 * soma é SEMPRE igual ao total (sem centavo perdido nem inventado).
 */
export function gerarParcelas(opts: {
  valorTotalBrl: number;
  n: number;
  primeiroVencimento: DataISO;
}): ParcelaGerada[] {
  const { valorTotalBrl, primeiroVencimento } = opts;
  const n = Math.floor(opts.n);
  if (!Number.isFinite(valorTotalBrl) || valorTotalBrl < 0) throw new Error('valor do contrato inválido');
  if (!Number.isInteger(n) || n < 1 || n > 120) throw new Error('número de parcelas inválido (1 a 120)');
  if (!ehDataISO(primeiroVencimento)) throw new Error('data do 1º vencimento inválida');

  const totalCentavos = paraCentavos(valorTotalBrl);
  const base = Math.round(totalCentavos / n);
  const parcelas: ParcelaGerada[] = [];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    const centavos = i === n - 1 ? totalCentavos - acumulado : base;
    acumulado += centavos;
    parcelas.push({
      numero: i + 1,
      vencimento: somarMeses(primeiroVencimento, i),
      valorPrevistoBrl: deCentavos(centavos),
    });
  }
  return parcelas;
}

/** Parcela em atraso: venceu antes de `hoje` e o dinheiro não entrou. */
export function estaAtrasada(p: { vencimento: DataISO; recebidoEm: DataISO | null }, hoje: DataISO): boolean {
  return p.recebidoEm === null && p.vencimento < hoje;
}

/** A parcela vence nos próximos `dias` dias (contando hoje) e ainda não entrou. */
export function venceEm(p: { vencimento: DataISO; recebidoEm: DataISO | null }, hoje: DataISO, dias: number): boolean {
  return p.recebidoEm === null && p.vencimento >= hoje && p.vencimento <= somarDias(hoje, dias - 1);
}
