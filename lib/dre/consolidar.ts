/**
 * Consolidação da DRE por tenant. PURA: sem rede, sem banco, sem relógio.
 *
 * Regime: **receita por caixa** (a parcela conta na semana em que `recebido_em`
 * cai, e só se foi recebida) e **custo por competência semanal**. Parcela a
 * receber é previsão, nunca receita.
 *
 * Três regras que esta camada existe para não deixar escapar:
 *
 *  1. **Margem sem receita é `null`, não 0% nem NaN.** Uma semana de custo sem
 *     recebimento é prejuízo de caixa, e "0%" diria que está empatada.
 *  2. **Custo não lançado não é custo zero.** Cada categoria manual carrega uma
 *     COBERTURA (`manual` se há lançamento, `nao_lancado` se não há nenhum no
 *     período). É o que impede a tela de mostrar uma margem maior do que a real
 *     só porque ninguém lançou as horas; o orçamento já errou exatamente assim
 *     (margem de 96 a 99% em qualquer cenário, porque o custo de gente era zero).
 *  3. **Tenant excluído continua na conta.** `empresa_id` vira NULL (SET NULL),
 *     mas `chave_empresa` é estável e agrupa os registros dele.
 *
 * O custo de IA vem de `dre_custo_ia_semana` (fechado, com câmbio congelado) e,
 * para a semana em curso, do cálculo ao vivo que o loader monta na mesma forma.
 */

import { arredondar2, deCentavos, paraCentavos } from './dinheiro';
import { estaAtrasada, venceEm } from './parcelas';
import { alocarLancamento } from './rateio';
import { semanaDaData, somarDias, type DataISO } from './semana';
import {
  CATEGORIAS,
  CHAVE_SEM_TENANT,
  type CambioDRE,
  type CategoriaLancamento,
  type Cobertura,
  type ContratoDRE,
  type CustoIASemanaDRE,
  type FonteCambio,
  type LancamentoDRE,
  type ParcelaDRE,
  type PrevistoContrato,
} from './tipos';

// ── Formas de saída ─────────────────────────────────────────────────────────

/** Uma linha da DRE: um tenant (ou o total) em uma semana (ou no período). */
export interface LinhaDRE {
  receita: number;
  ia: number;
  horas: number;
  impostos: number;
  comissao: number;
  whatsapp: number;
  infra: number;
  terceiros: number;
  outros: number;
  /** Soma de todos os custos. */
  custo: number;
  /** `receita − custo`. */
  resultado: number;
  /** `resultado ÷ receita × 100`, ou `null` quando não houve receita. */
  margemPct: number | null;
}

export interface ResumoContrato {
  id: string;
  nome: string;
  status: ContratoDRE['status'];
  inicio: DataISO;
  valorTotalBrl: number;
  recebidoBrl: number;
  /** Soma do previsto das parcelas ainda não recebidas. */
  aReceberBrl: number;
  /** `recebido ÷ valor do contrato`, ou `null` se o contrato vale zero. */
  pctRecebido: number | null;
  atrasadas: { qtd: number; valorBrl: number };
  proximas4Semanas: { qtd: number; valorBrl: number };
  mesesDecorridos: number;
  previsto: PrevistoContrato | null;
  parcelas: ParcelaDRE[];
}

/** Previsto × realizado. Só existe quando o contrato tem previsto e é o único do tenant. */
export interface ComparacaoContrato {
  /** IA operação orçada no contrato inteiro × IA realizada do tenant desde o início. */
  iaOrcadoBrl: number;
  iaRealizadoBrl: number;
  /** Pior saldo de caixa previsto × resultado de caixa acumulado até hoje. */
  piorSaldoPrevistoBrl: number;
  resultadoCaixaAcumuladoBrl: number;
  mesesDecorridos: number;
  mesesPrograma: number;
}

export interface TenantDRE {
  chave: string;
  empresaId: string | null;
  nome: string;
  /** `empresa_id` nulo com chave de tenant: foi excluído depois de lançar. */
  empresaRemovida: boolean;
  semContrato: boolean;
  porSemana: Record<DataISO, LinhaDRE>;
  /** Soma das semanas exibidas. */
  total: LinhaDRE;
  /** Resultado de caixa desde a primeira semana conhecida (não só a janela). */
  caixaAcumuladoBrl: number;
  cobertura: Record<'ia' | CategoriaLancamento, Cobertura>;
  /** Chamadas de IA sem preço no catálogo (o custo de IA é piso enquanto > 0). */
  iaLinhasSemCusto: number;
  /** Alguma semana de IA da janela está aberta ou usa câmbio estimado. */
  iaProvisoria: boolean;
  contratos: ResumoContrato[];
  comparacao: ComparacaoContrato | null;
}

export interface BlocoForaDeCliente {
  /** IA que não é de cliente pagante: P&D, plataforma sem tenant, demos. */
  iaPdBrl: number;
  /** Lançamentos manuais de escopo plataforma (infra geral, por exemplo). */
  plataformaBrl: number;
  totalBrl: number;
}

export interface ResultadoDRE {
  janela: DataISO[];
  tenants: TenantDRE[];
  foraDeCliente: {
    porSemana: Record<DataISO, BlocoForaDeCliente>;
    total: BlocoForaDeCliente;
    iaLinhasSemCusto: number;
  };
  totais: {
    /** Só tenants (cliente). */
    operacao: LinhaDRE;
    /** Tenants + fora de cliente: o que a Vertho gastou de fato. */
    geral: LinhaDRE;
    porSemanaOperacao: Record<DataISO, LinhaDRE>;
    porSemanaGeral: Record<DataISO, LinhaDRE>;
  };
  parcelas: {
    atrasadas: { qtd: number; valorBrl: number };
    proximas4Semanas: { qtd: number; valorBrl: number };
  };
  cambios: Record<DataISO, { usdBrl: number | null; fonte: FonteCambio | null; estimado: boolean }>;
}

export interface EntradaConsolidar {
  /** TODAS as semanas conhecidas (segundas, crescentes): base dos acumulados. */
  semanas: DataISO[];
  /** As semanas exibidas: um sufixo de `semanas`. */
  janela: DataISO[];
  contratos: ContratoDRE[];
  lancamentos: LancamentoDRE[];
  custoIA: CustoIASemanaDRE[];
  cambios: CambioDRE[];
  /** Hoje em Brasília (para atraso e vencimento). */
  hoje: DataISO;
}

// ── Acumulador em centavos ──────────────────────────────────────────────────

type ChaveLinha = 'receita' | 'ia' | CategoriaLancamento;
type Acc = Record<ChaveLinha, number>;

function novoAcc(): Acc {
  return { receita: 0, ia: 0, horas: 0, impostos: 0, comissao: 0, whatsapp: 0, infra: 0, terceiros: 0, outros: 0 };
}

function somarAcc(destino: Acc, origem: Acc): void {
  for (const k of Object.keys(destino) as ChaveLinha[]) destino[k] += origem[k];
}

function finalizar(a: Acc): LinhaDRE {
  const custoCent = a.ia + a.horas + a.impostos + a.comissao + a.whatsapp + a.infra + a.terceiros + a.outros;
  const resultadoCent = a.receita - custoCent;
  return {
    receita: deCentavos(a.receita),
    ia: deCentavos(a.ia),
    horas: deCentavos(a.horas),
    impostos: deCentavos(a.impostos),
    comissao: deCentavos(a.comissao),
    whatsapp: deCentavos(a.whatsapp),
    infra: deCentavos(a.infra),
    terceiros: deCentavos(a.terceiros),
    outros: deCentavos(a.outros),
    custo: deCentavos(custoCent),
    resultado: deCentavos(resultadoCent),
    margemPct: a.receita > 0 ? Math.round((resultadoCent / a.receita) * 10_000) / 100 : null,
  };
}

interface TenantAcc {
  chave: string;
  empresaId: string | null;
  nome: string | null;
  porSemana: Map<DataISO, Acc>;
  contratos: ContratoDRE[];
  lancamentosPorCategoria: Map<CategoriaLancamento, number>;
  iaLinhasSemCusto: number;
  iaProvisoria: boolean;
}

function tenantDe(mapa: Map<string, TenantAcc>, chave: string): TenantAcc {
  let t = mapa.get(chave);
  if (!t) {
    t = {
      chave,
      empresaId: null,
      nome: null,
      porSemana: new Map(),
      contratos: [],
      lancamentosPorCategoria: new Map(),
      iaLinhasSemCusto: 0,
      iaProvisoria: false,
    };
    mapa.set(chave, t);
  }
  return t;
}

function accDaSemana(t: TenantAcc, semana: DataISO): Acc {
  let a = t.porSemana.get(semana);
  if (!a) {
    a = novoAcc();
    t.porSemana.set(semana, a);
  }
  return a;
}

/** Guarda o 1º nome/id que aparecer; um id real vence um nulo. */
function lembrar(t: TenantAcc, empresaId: string | null, nome: string | null): void {
  if (empresaId) t.empresaId = empresaId;
  if (nome && !t.nome) t.nome = nome;
}

/** Meses inteiros entre duas datas de calendário (`ate` ≥ `de`; senão 0). */
export function mesesEntre(de: DataISO, ate: DataISO): number {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  return Math.max(0, meses);
}

// ── Consolidação ────────────────────────────────────────────────────────────

export function consolidar(e: EntradaConsolidar): ResultadoDRE {
  const conhecidas = new Set(e.semanas);
  const naJanela = new Set(e.janela);
  const tenants = new Map<string, TenantAcc>();
  // "Fora de cliente" também guarda a CATEGORIA: IA de P&D entra em `ia` e o
  // lançamento de plataforma na categoria dele. Somar tudo em `outros` apagaria
  // a quebra do total geral (a IA de P&D apareceria como "outros").
  const foraPorSemana = new Map<DataISO, Acc>();
  let foraSemCusto = 0;

  const foraDaSemana = (s: DataISO): Acc => {
    let f = foraPorSemana.get(s);
    if (!f) {
      f = novoAcc();
      foraPorSemana.set(s, f);
    }
    return f;
  };

  // Contratos: o tenant existe na DRE se tem contrato, mesmo cancelado (o
  // dinheiro que já entrou é caixa de verdade).
  for (const c of e.contratos) {
    const t = tenantDe(tenants, c.chaveEmpresa);
    t.contratos.push(c);
    lembrar(t, c.empresaId, c.empresaNome);
    for (const p of c.parcelas) {
      if (p.recebidoEm === null || p.valorRecebidoBrl === null) continue;
      const semana = semanaDaData(p.recebidoEm);
      if (!conhecidas.has(semana)) continue;
      accDaSemana(t, semana).receita += paraCentavos(p.valorRecebidoBrl);
    }
  }

  // Lançamentos manuais. O semanal cai numa semana; o MENSAL é rateado por dia nas
  // semanas que o mês toca (`alocarLancamento`). Só contam as semanas conhecidas:
  // a parte de um mês que cai antes da 1ª semana com dado, ou depois da semana em
  // curso, não entra (a de depois aparece sozinha quando a semana chegar).
  for (const l of e.lancamentos) {
    for (const parte of alocarLancamento(l)) {
      if (!conhecidas.has(parte.semana)) continue;
      if (l.escopo === 'plataforma') {
        foraDaSemana(parte.semana)[l.categoria] += paraCentavos(parte.valorBrl);
        continue;
      }
      const t = tenantDe(tenants, l.chaveEmpresa);
      lembrar(t, l.empresaId, l.empresaNome);
      accDaSemana(t, parte.semana)[l.categoria] += paraCentavos(parte.valorBrl);
      // Cobertura: basta UMA fatia do lançamento dentro da janela para a categoria
      // contar como lançada (o número só é comparado com zero).
      if (naJanela.has(parte.semana)) {
        t.lancamentosPorCategoria.set(l.categoria, (t.lancamentosPorCategoria.get(l.categoria) ?? 0) + 1);
      }
    }
  }

  // Custo de IA: operação vai para o tenant; o resto é "fora de cliente".
  for (const c of e.custoIA) {
    if (!conhecidas.has(c.semanaInicio)) continue;
    if (c.natureza === 'pd') {
      foraDaSemana(c.semanaInicio).ia += paraCentavos(c.custoBrl);
      if (naJanela.has(c.semanaInicio)) foraSemCusto += c.linhasSemCusto;
      continue;
    }
    const t = tenantDe(tenants, c.chaveEmpresa);
    lembrar(t, c.empresaId, c.empresaNome);
    accDaSemana(t, c.semanaInicio).ia += paraCentavos(c.custoBrl);
    if (naJanela.has(c.semanaInicio)) {
      t.iaLinhasSemCusto += c.linhasSemCusto;
      if (c.aoVivo) t.iaProvisoria = true;
    }
  }

  // Câmbio por semana (só para exibir de onde veio a conversão).
  const cambioPorSemana = new Map(e.cambios.map((c) => [c.semanaInicio, c]));
  const cambios: ResultadoDRE['cambios'] = {};
  for (const s of e.janela) {
    const c = cambioPorSemana.get(s);
    cambios[s] = { usdBrl: c?.usdBrl ?? null, fonte: c?.fonte ?? null, estimado: !c };
  }

  // Parcelas: atraso e vencimento olham TODOS os contratos em vigor.
  const atrasadasGeral = { qtd: 0, valorCent: 0 };
  const proximasGeral = { qtd: 0, valorCent: 0 };

  const saida: TenantDRE[] = [];
  const totalOperacao = novoAcc();
  const porSemanaOperacao = new Map<DataISO, Acc>();
  const porSemanaGeral = new Map<DataISO, Acc>();

  for (const t of tenants.values()) {
    const porSemana: Record<DataISO, LinhaDRE> = {};
    const total = novoAcc();
    const acumulado = novoAcc();

    for (const s of e.semanas) {
      const a = t.porSemana.get(s);
      if (!a) continue;
      somarAcc(acumulado, a);
      if (naJanela.has(s)) {
        somarAcc(total, a);
        porSemana[s] = finalizar(a);
        const op = porSemanaOperacao.get(s) ?? novoAcc();
        somarAcc(op, a);
        porSemanaOperacao.set(s, op);
      }
    }
    // Semanas da janela sem nenhum movimento ficam zeradas, não ausentes: a
    // tabela semanal precisa de uma célula por semana.
    for (const s of e.janela) if (!porSemana[s]) porSemana[s] = finalizar(novoAcc());
    somarAcc(totalOperacao, total);

    const resumos = t.contratos.map((c) => resumirContrato(c, e.hoje, atrasadasGeral, proximasGeral));
    const naoCancelados = t.contratos.filter((c) => c.status !== 'cancelado');
    const resultadoCaixaAcumulado = deCentavos(
      acumulado.receita -
        (acumulado.ia + acumulado.horas + acumulado.impostos + acumulado.comissao + acumulado.whatsapp + acumulado.infra + acumulado.terceiros + acumulado.outros),
    );

    let comparacao: ComparacaoContrato | null = null;
    if (naoCancelados.length === 1 && naoCancelados[0].previsto) {
      const c = naoCancelados[0];
      const previsto = c.previsto as PrevistoContrato;
      const semanaInicio = semanaDaData(c.inicio);
      let iaCent = 0;
      for (const s of e.semanas) {
        if (s < semanaInicio) continue;
        iaCent += t.porSemana.get(s)?.ia ?? 0;
      }
      comparacao = {
        iaOrcadoBrl: previsto.custoIABrl,
        iaRealizadoBrl: deCentavos(iaCent),
        piorSaldoPrevistoBrl: previsto.piorSaldoBrl,
        resultadoCaixaAcumuladoBrl: resultadoCaixaAcumulado,
        mesesDecorridos: mesesEntre(c.inicio, e.hoje),
        mesesPrograma: previsto.mesesPrograma,
      };
    }

    const cobertura = { ia: 'medido' } as TenantDRE['cobertura'];
    for (const cat of CATEGORIAS) {
      cobertura[cat] = (t.lancamentosPorCategoria.get(cat) ?? 0) > 0 ? 'manual' : 'nao_lancado';
    }

    saida.push({
      chave: t.chave,
      empresaId: t.empresaId,
      nome: t.nome ?? (t.chave === CHAVE_SEM_TENANT ? 'Sem tenant' : 'Empresa removida'),
      empresaRemovida: t.empresaId === null && t.chave !== CHAVE_SEM_TENANT,
      semContrato: naoCancelados.length === 0,
      porSemana,
      total: finalizar(total),
      caixaAcumuladoBrl: resultadoCaixaAcumulado,
      cobertura,
      iaLinhasSemCusto: t.iaLinhasSemCusto,
      iaProvisoria: t.iaProvisoria,
      contratos: resumos,
      comparacao,
    });
  }

  saida.sort((x, y) => y.total.receita - x.total.receita || y.total.custo - x.total.custo || x.nome.localeCompare(y.nome, 'pt-BR'));

  // Fora de cliente: por semana, e somado ao total GERAL categoria a categoria.
  const foraOut: Record<DataISO, BlocoForaDeCliente> = {};
  const foraTotal = novoAcc();
  const geralTotal = { ...totalOperacao };
  for (const s of e.janela) {
    const f = foraPorSemana.get(s) ?? novoAcc();
    const plataformaCent = f.horas + f.impostos + f.comissao + f.whatsapp + f.infra + f.terceiros + f.outros;
    somarAcc(foraTotal, f);
    somarAcc(geralTotal, f);
    foraOut[s] = {
      iaPdBrl: deCentavos(f.ia),
      plataformaBrl: deCentavos(plataformaCent),
      totalBrl: deCentavos(f.ia + plataformaCent),
    };
    const g = novoAcc();
    const op = porSemanaOperacao.get(s);
    if (op) somarAcc(g, op);
    somarAcc(g, f);
    porSemanaGeral.set(s, g);
  }
  const foraTotalPlataformaCent =
    foraTotal.horas + foraTotal.impostos + foraTotal.comissao + foraTotal.whatsapp + foraTotal.infra + foraTotal.terceiros + foraTotal.outros;

  const linhasPorSemana = (m: Map<DataISO, Acc>): Record<DataISO, LinhaDRE> => {
    const o: Record<DataISO, LinhaDRE> = {};
    for (const s of e.janela) o[s] = finalizar(m.get(s) ?? novoAcc());
    return o;
  };

  return {
    janela: e.janela,
    tenants: saida,
    foraDeCliente: {
      porSemana: foraOut,
      total: {
        iaPdBrl: deCentavos(foraTotal.ia),
        plataformaBrl: deCentavos(foraTotalPlataformaCent),
        totalBrl: deCentavos(foraTotal.ia + foraTotalPlataformaCent),
      },
      iaLinhasSemCusto: foraSemCusto,
    },
    totais: {
      operacao: finalizar(totalOperacao),
      geral: finalizar(geralTotal),
      porSemanaOperacao: linhasPorSemana(porSemanaOperacao),
      porSemanaGeral: linhasPorSemana(porSemanaGeral),
    },
    parcelas: {
      atrasadas: { qtd: atrasadasGeral.qtd, valorBrl: deCentavos(atrasadasGeral.valorCent) },
      proximas4Semanas: { qtd: proximasGeral.qtd, valorBrl: deCentavos(proximasGeral.valorCent) },
    },
    cambios,
  };
}

function resumirContrato(
  c: ContratoDRE,
  hoje: DataISO,
  atrasadasGeral: { qtd: number; valorCent: number },
  proximasGeral: { qtd: number; valorCent: number },
): ResumoContrato {
  let recebidoCent = 0;
  let aReceberCent = 0;
  const atrasadas = { qtd: 0, valorCent: 0 };
  const proximas = { qtd: 0, valorCent: 0 };
  for (const p of c.parcelas) {
    if (p.recebidoEm !== null && p.valorRecebidoBrl !== null) {
      recebidoCent += paraCentavos(p.valorRecebidoBrl);
      continue;
    }
    // Só contrato em vigor tem "a receber": o cancelado/encerrado não cobra mais.
    if (c.status !== 'em_vigor') continue;
    const v = paraCentavos(p.valorPrevistoBrl);
    aReceberCent += v;
    if (estaAtrasada(p, hoje)) {
      atrasadas.qtd += 1;
      atrasadas.valorCent += v;
    } else if (venceEm(p, hoje, 28)) {
      proximas.qtd += 1;
      proximas.valorCent += v;
    }
  }
  atrasadasGeral.qtd += atrasadas.qtd;
  atrasadasGeral.valorCent += atrasadas.valorCent;
  proximasGeral.qtd += proximas.qtd;
  proximasGeral.valorCent += proximas.valorCent;

  return {
    id: c.id,
    nome: c.nome,
    status: c.status,
    inicio: c.inicio,
    valorTotalBrl: c.valorTotalBrl,
    recebidoBrl: deCentavos(recebidoCent),
    aReceberBrl: deCentavos(aReceberCent),
    pctRecebido: c.valorTotalBrl > 0 ? Math.round((deCentavos(recebidoCent) / c.valorTotalBrl) * 10_000) / 100 : null,
    atrasadas: { qtd: atrasadas.qtd, valorBrl: deCentavos(atrasadas.valorCent) },
    proximas4Semanas: { qtd: proximas.qtd, valorBrl: deCentavos(proximas.valorCent) },
    mesesDecorridos: mesesEntre(c.inicio, hoje),
    previsto: c.previsto,
    parcelas: c.parcelas,
  };
}

/** Em BRL, a conversão de uma linha de IA (usado pelo loader para a semana ao vivo). */
export function converterUsd(custoUsd: number, usdBrl: number): number {
  return arredondar2(custoUsd * usdBrl);
}

/** O último dia da semana que começa em `segunda`. */
export function fimDaSemana(segunda: DataISO): DataISO {
  return somarDias(segunda, 6);
}
