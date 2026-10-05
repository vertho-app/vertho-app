/**
 * Tipos e constantes da DRE por tenant (migration 276).
 *
 * Regime: receita por CAIXA (a parcela conta na semana em que o dinheiro entrou)
 * e custo por competência semanal. As duas coisas ficam escritas na tela.
 */

import type { DataISO } from './semana';

/** Agrupador estável do que não tem tenant (plataforma, P&D sem empresa). */
export const CHAVE_SEM_TENANT = 'sem-tenant';

export const CATEGORIAS = ['horas', 'impostos', 'comissao', 'infra', 'whatsapp', 'terceiros', 'outros'] as const;
export type CategoriaLancamento = (typeof CATEGORIAS)[number];

export const ROTULO_CATEGORIA: Record<CategoriaLancamento, string> = {
  horas: 'Horas de gente',
  impostos: 'Impostos',
  comissao: 'Comissão',
  infra: 'Infraestrutura',
  whatsapp: 'WhatsApp',
  terceiros: 'Terceiros',
  outros: 'Outros',
};

export const STATUS_CONTRATO = ['em_vigor', 'encerrado', 'cancelado'] as const;
export type StatusContrato = (typeof STATUS_CONTRATO)[number];

export type EscopoLancamento = 'empresa' | 'plataforma';

export type FonteCambio = 'ptax_bcb' | 'manual' | 'herdado' | 'orcamento';

/** Natureza do custo de IA, como o e-mail semanal classifica (`classificacao.ts`). */
export type NaturezaCusto = 'operacao' | 'pd';

/** O que o orçamento aprovado previa, congelado no contrato. */
export interface PrevistoContrato {
  valorFinal: number;
  parcela: number;
  parcelas: number;
  custoTotalBrl: number;
  custoIABrl: number;
  custoOperacionalBrl: number;
  margemPct: number;
  mesesPrograma: number;
  /** Mês (1 = primeira parcela) e saldo de caixa do pior ponto previsto. */
  piorSaldoMes: number;
  piorSaldoBrl: number;
  /** Cotação USD→BRL que o orçamento usou; null se o jsonb antigo não a trazia. */
  cotacao: number | null;
  orcamentoNome: string | null;
}

export interface ParcelaDRE {
  id: string;
  contratoId: string;
  numero: number;
  vencimento: DataISO;
  valorPrevistoBrl: number;
  recebidoEm: DataISO | null;
  valorRecebidoBrl: number | null;
  notaFiscal: string | null;
  observacao: string | null;
}

export interface ContratoDRE {
  id: string;
  empresaId: string | null;
  empresaNome: string;
  chaveEmpresa: string;
  nome: string;
  valorTotalBrl: number;
  inicio: DataISO;
  status: StatusContrato;
  orcamentoId: string | null;
  previsto: PrevistoContrato | null;
  previstoCongeladoEm: string | null;
  parcelas: ParcelaDRE[];
}

export interface LancamentoDRE {
  id: string;
  escopo: EscopoLancamento;
  empresaId: string | null;
  empresaNome: string | null;
  chaveEmpresa: string;
  semanaInicio: DataISO;
  categoria: CategoriaLancamento;
  descricao: string | null;
  horas: number | null;
  custoHoraBrl: number | null;
  responsavel: string | null;
  valorBrl: number;
  criadoPor: string;
  atualizadoPor: string | null;
}

/** Uma linha de `dre_custo_ia_semana`, ou a mesma forma calculada ao vivo. */
export interface CustoIASemanaDRE {
  semanaInicio: DataISO;
  natureza: NaturezaCusto;
  chaveEmpresa: string;
  empresaId: string | null;
  empresaNome: string | null;
  custoUsd: number;
  usdBrl: number;
  custoBrl: number;
  chamadas: number;
  linhasSemCusto: number;
  /** true = semana em curso, calculada agora (ainda não fechada). */
  aoVivo: boolean;
}

export interface CambioDRE {
  semanaInicio: DataISO;
  usdBrl: number;
  fonte: FonteCambio;
}

/** Como cada linha de custo chegou à tela: o selo que impede margem inflada. */
export type Cobertura = 'medido' | 'manual' | 'nao_lancado';
