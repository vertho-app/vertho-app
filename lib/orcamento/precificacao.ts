/**
 * Precificação de um projeto Vertho — a conta que a tela de orçamento aplica.
 *
 * Vive fora do componente porque teve um erro de MODELO, não de digitação, e
 * erro de modelo só não volta se houver teste: até 07/09/2026 a receita fazia
 * `mensalidade × meses` enquanto o custo fazia `custo × ciclos`, duas dimensões
 * soltas. Medido com os defaults da própria tela (100 pessoas, 1 unidade, 3
 * cargos):
 *
 *   · parcelar o MESMO projeto em 24 meses em vez de 12 → receita ×1,96, custo ×1,00
 *   · entregar o DOBRO do programa (2 ciclos) em 12 meses → receita ×1,00, custo ×1,99
 *
 * A régua, agora explícita: **o preço vem do ESCOPO; o prazo só divide.**
 * O contrato é vendido pelo projeto (decisão do dono, 07/09/2026) e a
 * mensalidade é forma de pagamento, não assinatura.
 */

export interface TabelaPreco {
  /** R$ de implantação, uma vez, independente de tamanho. */
  setupGeral: number;
  /** R$ por pessoa por CICLO de programa — nunca por mês. */
  pessoaCiclo: number;
  /** R$ por unidade (escola/filial) na implantação. */
  unidade: number;
  /** R$ por matriz de competências criada do zero. */
  matrizNova: number;
  /** R$ por matriz adaptada do catálogo canônico. */
  matrizAdaptada: number;
  /** R$ por unidade quando o mapeamento é por workshop presencial. */
  workshop: number;
  descontoPct: number;
  /** Piso de margem que decide o desconto máximo. */
  margemAlvoPct: number;
}

/**
 * Fonte única da régua comercial usada pelo deal desk e pelo formulário de
 * propostas. Valores operacionais continuam editáveis no deal desk, mas toda
 * sugestão nasce daqui para não haver duas tabelas concorrentes.
 */
export const ORCAMENTO_DEFAULTS = {
  // PTAX de fechamento do BCB em 10/09/2026 (R$ 5,1149), arredondada e
  // editável para que o cenário possa aplicar a margem cambial da negociação.
  cotacao: 5.12,
  precoSetupGeral: 2000,
  precoPessoaCiclo: 300,
  precoCluster: 2000,
  precoMatrizNova: 500,
  precoMatrizAdaptada: 250,
  adicionalWorkshop: 15000,
  descontoPct: 0,
  margemAlvoPct: 50,
  impostosPct: 20,
  contingenciaPct: 10,
  custoHora: 500, // valor informado pelo dono em 07/09/2026
  horasImplantacao: 8,
  horasMatrizNova: 6,
  horasMatrizAdaptada: 2,
  horasWorkshop: 8,
  msgsPorPessoaCiclo: 25,
  custoMsgUnitario: 0.035,
  clientesAtivos: 2,
};

export const MESES_POR_CICLO = 2;
export const PERFIS_DISC_POR_CARGO = 4;
export const CONTEUDO_POR_FORMATO_DEFAULT = 12;

/** O programa padrão dura cerca de dois meses; a forma de pagamento acompanha a entrega. */
export function parcelasPorCiclos(ciclos: number): number {
  return Math.max(1, Math.floor(Number(ciclos) || 1)) * MESES_POR_CICLO;
}

/** Todo cargo que não exige uma matriz nova adapta uma matriz existente. */
export function distribuirMatrizes(cargos: number, novasInformadas: number): {
  novas: number;
  adaptadas: number;
} {
  const total = Math.max(0, Math.floor(Number(cargos) || 0));
  const novas = Math.max(0, Math.min(total, Math.floor(Number(novasInformadas) || 0)));
  return { novas, adaptadas: total - novas };
}

/** Compartilhamento médio por célula de cargo × perfil DISC, com piso de uma pessoa. */
export function reusoConteudoPorCelula(pessoas: number, cargos: number): number {
  const totalPessoas = Math.max(0, Number(pessoas) || 0);
  const totalCargos = Math.max(1, Number(cargos) || 1);
  return Math.max(1, totalPessoas / totalCargos / PERFIS_DISC_POR_CARGO);
}

export type ConteudoPorFormato = {
  video: number;
  podcast: number;
  texto: number;
  case: number;
};

/** Soma os quatro formatos e aplica o compartilhamento médio entre pessoas. */
export function custoConteudoComReuso(
  quantidades: ConteudoPorFormato,
  custosUnitarios: ConteudoPorFormato,
  pessoas: number,
  reuso: number,
): { porPessoa: number; total: number } {
  const formatos: (keyof ConteudoPorFormato)[] = ['video', 'podcast', 'texto', 'case'];
  const custoBrutoPorPessoa = formatos.reduce(
    (total, formato) => total
      + Math.max(0, Number(quantidades[formato]) || 0) * Math.max(0, Number(custosUnitarios[formato]) || 0),
    0,
  );
  const porPessoa = custoBrutoPorPessoa / Math.max(1, Number(reuso) || 1);
  return { porPessoa, total: porPessoa * Math.max(0, Number(pessoas) || 0) };
}

export interface EscopoProjeto {
  pessoas: number;
  /** Ciclos de programa entregues no contrato. É isto que dobra a entrega. */
  ciclos: number;
  unidades: number;
  matrizesNovas: number;
  matrizesAdaptadas: number;
  workshop: boolean;
  /** Em quantas parcelas o cliente paga. NÃO entra no preço. */
  parcelas: number;
}

export interface CustoProjeto {
  /** Custo total de entrega em BRL: IA + horas + mensagens + infra. */
  totalBrl: number;
  /** A parte que é gasta na largada (implantação, matrizes, setup de IA). */
  oneTimeBrl: number;
  /** Duração do PROGRAMA em meses — por ela o custo variável se distribui. */
  mesesPrograma: number;
  /** Comissão, impostos e outras saídas que incidem sobre a receita final. */
  percentualSobreReceita?: number;
}

export interface ResultadoProjeto {
  oneTime: number;
  programa: number;
  valorTabela: number;
  valorFinal: number;
  desconto: number;
  parcela: number;
  margemAbs: number;
  margemPct: number;
  custoSobreReceita: number;
  /** Maior desconto que ainda respeita a margem-alvo. */
  descontoMaxPct: number;
  acimaDoPiso: boolean;
  /** Caixa acumulado (recebido − entregue) ao fim de cada parcela. */
  exposicao: { mes: number; saldo: number }[];
  piorSaldo: { mes: number; saldo: number };
}

export function calcularProjeto(
  escopo: EscopoProjeto,
  preco: TabelaPreco,
  custo: CustoProjeto,
): ResultadoProjeto {
  const ciclos = Math.max(1, escopo.ciclos || 1);
  const parcelas = Math.max(1, escopo.parcelas || 1);

  const oneTime =
    preco.setupGeral +
    escopo.unidades * preco.unidade +
    escopo.matrizesNovas * preco.matrizNova +
    escopo.matrizesAdaptadas * preco.matrizAdaptada +
    (escopo.workshop ? escopo.unidades * preco.workshop : 0);

  // O programa escala por pessoa e por ciclo — as duas dimensões da entrega.
  const programa = escopo.pessoas * preco.pessoaCiclo * ciclos;

  const valorTabela = oneTime + programa;
  const fator = 1 - (preco.descontoPct || 0) / 100;
  const valorFinal = valorTabela * fator;
  const desconto = valorTabela - valorFinal;
  const parcela = valorFinal / parcelas;

  const percentualSobreReceita = Math.max(0, custo.percentualSobreReceita || 0);
  const custoSobreReceita = valorFinal * percentualSobreReceita;
  const margemAbs = valorFinal - custo.totalBrl - custoSobreReceita;
  const margemPct = valorFinal > 0 ? (margemAbs / valorFinal) * 100 : 0;

  // Desconto máximo que preserva a margem-alvo. É o número que se precisa ANTES
  // de sentar na negociação — não o aviso depois de ceder.
  const alvo = Math.min(99, Math.max(0, preco.margemAlvoPct)) / 100;
  const capacidadeDeCusto = 1 - alvo - percentualSobreReceita;
  const valorMinimo = capacidadeDeCusto > 0 ? custo.totalBrl / capacidadeDeCusto : Number.POSITIVE_INFINITY;
  const descontoMaxPct = valorTabela > 0
    ? Math.max(0, (1 - valorMinimo / valorTabela) * 100)
    : 0;

  // Preço fechado pago aos poucos: a implantação sai na largada e volta
  // parcelada. O fundo do poço é o risco de uma rescisão no meio.
  const variavel = Math.max(0, custo.totalBrl - custo.oneTimeBrl);
  const meses = Math.max(1, custo.mesesPrograma);
  const exposicao: { mes: number; saldo: number }[] = [];
  for (let m = 1; m <= parcelas; m++) {
    const recebido = parcela * m;
    const gasto = custo.oneTimeBrl + variavel * Math.min(1, m / meses);
    exposicao.push({ mes: m, saldo: recebido - gasto - recebido * percentualSobreReceita });
  }
  const piorSaldo = exposicao.reduce((min, e) => (e.saldo < min.saldo ? e : min), exposicao[0]);

  return {
    oneTime,
    programa,
    valorTabela,
    valorFinal,
    desconto,
    parcela,
    margemAbs,
    margemPct,
    custoSobreReceita,
    descontoMaxPct,
    acimaDoPiso: margemPct + 1e-9 < alvo * 100,
    exposicao,
    piorSaldo,
  };
}
