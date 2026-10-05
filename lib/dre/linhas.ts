/**
 * Mapeadores das linhas do banco (snake_case) para os tipos da DRE (camelCase).
 *
 * PURO. Existe separado do loader por dois motivos: (1) é onde o `numeric` do
 * Postgres vira `number` (o PostgREST pode devolvê-lo como string) e onde um
 * campo ausente vira 0 em vez de NaN; (2) dá para testar sem rede e sem mock.
 */

import { lerPrevisto } from './previsto';
import {
  CATEGORIAS,
  STATUS_CONTRATO,
  type CambioDRE,
  type CategoriaLancamento,
  type ContratoDRE,
  type CustoIASemanaDRE,
  type FonteCambio,
  type LancamentoDRE,
  type NaturezaCusto,
  type ParcelaDRE,
  type StatusContrato,
} from './tipos';

type Linha = Record<string, any>;

function n(v: unknown): number {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}

function nOuNulo(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function s(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

/** 'YYYY-MM-DD' de uma coluna `date` (o PostgREST já entrega assim). */
function dia(v: unknown): string {
  return String(v ?? '').slice(0, 10);
}

export function parcelaDeLinha(r: Linha): ParcelaDRE {
  return {
    id: String(r.id),
    contratoId: String(r.contrato_id),
    numero: n(r.numero),
    vencimento: dia(r.vencimento),
    valorPrevistoBrl: n(r.valor_previsto_brl),
    recebidoEm: r.recebido_em ? dia(r.recebido_em) : null,
    valorRecebidoBrl: nOuNulo(r.valor_recebido_brl),
    notaFiscal: s(r.nota_fiscal),
    observacao: s(r.observacao),
  };
}

export function contratoDeLinha(r: Linha, parcelas: ParcelaDRE[]): ContratoDRE {
  const status = STATUS_CONTRATO.includes(r.status) ? (r.status as StatusContrato) : 'em_vigor';
  return {
    id: String(r.id),
    empresaId: s(r.empresa_id),
    empresaNome: String(r.empresa_nome ?? ''),
    chaveEmpresa: String(r.chave_empresa),
    nome: String(r.nome ?? ''),
    valorTotalBrl: n(r.valor_total_brl),
    inicio: dia(r.inicio),
    status,
    orcamentoId: s(r.orcamento_id),
    previsto: lerPrevisto(r.previsto),
    previstoCongeladoEm: s(r.previsto_congelado_em),
    parcelas: [...parcelas].sort((a, b) => a.numero - b.numero),
  };
}

export function lancamentoDeLinha(r: Linha): LancamentoDRE {
  const categoria = (CATEGORIAS as readonly string[]).includes(r.categoria) ? (r.categoria as CategoriaLancamento) : 'outros';
  return {
    id: String(r.id),
    escopo: r.escopo === 'plataforma' ? 'plataforma' : 'empresa',
    empresaId: s(r.empresa_id),
    empresaNome: s(r.empresa_nome),
    chaveEmpresa: String(r.chave_empresa),
    // Linha anterior à mig 280 não tem a coluna: é semanal.
    periodicidade: r.periodicidade === 'mensal' ? 'mensal' : 'semanal',
    semanaInicio: r.semana_inicio ? dia(r.semana_inicio) : null,
    mesCompetencia: r.mes_competencia ? dia(r.mes_competencia) : null,
    categoria,
    descricao: s(r.descricao),
    horas: nOuNulo(r.horas),
    custoHoraBrl: nOuNulo(r.custo_hora_brl),
    responsavel: s(r.responsavel),
    valorBrl: n(r.valor_brl),
    criadoPor: String(r.criado_por ?? ''),
    atualizadoPor: s(r.atualizado_por),
  };
}

export function custoIADeLinha(r: Linha): CustoIASemanaDRE {
  return {
    semanaInicio: dia(r.semana_inicio),
    natureza: (r.natureza === 'pd' ? 'pd' : 'operacao') as NaturezaCusto,
    chaveEmpresa: String(r.chave_empresa),
    empresaId: s(r.empresa_id),
    empresaNome: s(r.empresa_nome),
    custoUsd: n(r.custo_usd),
    usdBrl: n(r.usd_brl),
    custoBrl: n(r.custo_brl),
    chamadas: n(r.chamadas),
    linhasSemCusto: n(r.linhas_sem_custo),
    aoVivo: false,
  };
}

export function cambioDeLinha(r: Linha): CambioDRE {
  const fonte = (['ptax_bcb', 'manual', 'herdado', 'orcamento'] as const).includes(r.fonte) ? (r.fonte as FonteCambio) : 'orcamento';
  return { semanaInicio: dia(r.semana_inicio), usdBrl: n(r.usd_brl), fonte };
}
