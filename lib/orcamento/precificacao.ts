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

import { SIMULADORES, type Simulador } from '@/lib/simuladores/acesso-cargo';

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
  precoMatrizNova: 1000,
  precoMatrizAdaptada: 500,
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
  // Simuladores: cada um tem a sua régua em `SIMULADORES_DEFAULT` (02/10/2026).
};

/**
 * Nome de cada simulador como o CLIENTE lê (menu do produto e escopo da proposta).
 * Os três são "Simulador de …", decisão do Rodrigo (17/09/2026): nada de
 * "Treino de atendimento" nem "Prontidão para liderança".
 */
export const ROTULO_SIMULADOR: Record<Simulador, string> = {
  vendas: 'Simulador de vendas',
  atendimento: 'Simulador de atendimento',
  lideranca: 'Simulador de liderança',
};

/** Pessoas com acesso por simulador. Zero = simulador fora do escopo. */
export type PessoasPorSimulador = Record<Simulador, number>;

export function semSimuladores(): PessoasPorSimulador {
  return SIMULADORES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as PessoasPorSimulador);
}

/**
 * Soma de acessos: uma pessoa em dois simuladores conta duas vezes, porque o
 * preço e o custo são por pessoa POR simulador. Ninguém tem acesso além da base.
 */
export function acessosSimuladores(por: PessoasPorSimulador, pessoasDoPrograma: number): number {
  const teto = Math.max(0, Math.floor(Number(pessoasDoPrograma) || 0));
  return SIMULADORES.reduce(
    (total, s) => total + Math.min(teto, Math.max(0, Math.floor(Number(por[s]) || 0))),
    0,
  );
}

/** Custo de IA dos simuladores no contrato: acessos × treinos × custo do treino × ciclos. */
export function custoSimuladoresBrl(p: {
  acessos: number;
  treinosPessoaCiclo: number;
  custoTreinoUsd: number;
  ciclos: number;
  cotacao: number;
}): number {
  const pos = (v: number) => Math.max(0, Number(v) || 0);
  return pos(p.acessos) * pos(p.treinosPessoaCiclo) * pos(p.custoTreinoUsd)
    * Math.max(1, Math.floor(Number(p.ciclos) || 1)) * pos(p.cotacao);
}

/**
 * Preço, uso e custo de UM simulador. Cada um tem o seu desde 02/10/2026 (pedido
 * do Rodrigo): até ali a tela usava um preço só e, para os três, o custo de
 * treino do atendimento, que é o mais caro.
 */
export interface ConfigSimulador {
  /** R$ por pessoa com acesso, por ciclo. Zero = sem preço (a tela avisa). */
  precoPessoaCiclo: number;
  treinosPessoaCiclo: number;
  /** Turnos de conversa por treino. O custo da conversa cresce com eles. */
  turnosPorTreino: number;
  /** US$ das chamadas que rodam uma vez por treino (avaliação, preparo). */
  custoFixoTreinoUsd: number;
}

export type ConfigSimuladores = Record<Simulador, ConfigSimulador>;

/**
 * US$ das chamadas que rodam a cada turno (personagem, moderação). É custo da
 * PLATAFORMA, não do orçamento: decisão do Rodrigo (02/10/2026), não é campo
 * editável. Por isso mora aqui e não em `ConfigSimulador`: um valor gravado no
 * cenário (houve cenário salvo com ele entre 02/10, de manhã, e esta mudança) é
 * descartado na leitura, e a conta usa sempre este. Medição na nota abaixo.
 */
export const CUSTO_TURNO_USD: Record<Simulador, number> = {
  vendas: 0.0075,
  atendimento: 0.0069,
  lideranca: 0.005,
};

/**
 * Pior caso medido no ledger (`ia_usage_log`, 13 a 24/09/2026, só ensaios da
 * equipe: nenhum colaborador real tinha usado os simuladores), com 8 turnos:
 *   · vendas: criador US$ 0,027 + avaliação do gerente até US$ 0,073; cliente,
 *     moderador e intenção ~US$ 0,0075 por turno → US$ 0,16 por treino
 *   · atendimento: avaliação pela matriz de 30 descritores até US$ 0,166;
 *     paciente US$ 0,0069 por turno → US$ 0,22 por treino
 *   · liderança: abertura, consequências e avaliador até US$ 0,09; personagem
 *     US$ 0,005 por turno → US$ 0,13 por encontro
 * Treinos: 2 por semana nas semanas 2, 4 e 6 (17/09/2026); a liderança é uma
 * jornada de 5 encontros. Preço zero: ainda não há régua (17/09/2026), e zero
 * não é cortesia: a tela avisa quando um simulador entra no escopo sem preço.
 */
export const SIMULADORES_DEFAULT: ConfigSimuladores = {
  vendas: { precoPessoaCiclo: 0, treinosPessoaCiclo: 6, turnosPorTreino: 8, custoFixoTreinoUsd: 0.1 },
  atendimento: { precoPessoaCiclo: 0, treinosPessoaCiclo: 6, turnosPorTreino: 8, custoFixoTreinoUsd: 0.166 },
  lideranca: { precoPessoaCiclo: 0, treinosPessoaCiclo: 5, turnosPorTreino: 8, custoFixoTreinoUsd: 0.09 },
};

/** Cópia da régua dos simuladores: editar o cenário não edita o default. */
export function configSimuladoresPadrao(): ConfigSimuladores {
  return SIMULADORES.reduce(
    (acc, s) => ({ ...acc, [s]: { ...SIMULADORES_DEFAULT[s] } }),
    {} as ConfigSimuladores,
  );
}

const naoNegativo = (v: number) => Math.max(0, Number(v) || 0);

/** US$ de um treino: o que roda uma vez mais o custo do turno × turnos. */
export function custoTreinoUsd(
  c: Pick<ConfigSimulador, 'custoFixoTreinoUsd' | 'turnosPorTreino'>,
  custoTurnoUsd: number,
): number {
  return naoNegativo(c.custoFixoTreinoUsd) + naoNegativo(custoTurnoUsd) * naoNegativo(c.turnosPorTreino);
}

export interface SimuladorNoOrcamento {
  simulador: Simulador;
  acessos: number;
  /** O da plataforma (`CUSTO_TURNO_USD`), exibido sem edição. */
  custoTurnoUsd: number;
  custoTreinoUsd: number;
  /** R$ de IA de uma pessoa com acesso, num ciclo. */
  custoPessoaCicloBrl: number;
  /** Preço de tabela no contrato: acessos × preço × ciclos, antes de desconto. */
  valorBrl: number;
  /** Custo de IA no contrato. */
  custoBrl: number;
}

/**
 * Cada simulador no orçamento, com os totais. Acesso nunca passa das pessoas
 * do programa; uma pessoa em dois simuladores conta nos dois.
 */
export function simuladoresDoOrcamento(p: {
  pessoas: PessoasPorSimulador;
  pessoasDoPrograma: number;
  config: ConfigSimuladores;
  ciclos: number;
  cotacao: number;
}): { itens: SimuladorNoOrcamento[]; acessos: number; valorBrl: number; custoBrl: number } {
  const teto = Math.max(0, Math.floor(Number(p.pessoasDoPrograma) || 0));
  const ciclos = Math.max(1, Math.floor(Number(p.ciclos) || 1));
  const itens = SIMULADORES.map((s): SimuladorNoOrcamento => {
    const c = p.config[s];
    const acessos = Math.min(teto, Math.max(0, Math.floor(Number(p.pessoas[s]) || 0)));
    const treino = custoTreinoUsd(c, CUSTO_TURNO_USD[s]);
    return {
      simulador: s,
      acessos,
      custoTurnoUsd: CUSTO_TURNO_USD[s],
      custoTreinoUsd: treino,
      custoPessoaCicloBrl: naoNegativo(c.treinosPessoaCiclo) * treino * naoNegativo(p.cotacao),
      valorBrl: valorSimuladorBrl({ acessos, precoPessoaCiclo: c.precoPessoaCiclo }, ciclos),
      custoBrl: custoSimuladoresBrl({
        acessos, treinosPessoaCiclo: c.treinosPessoaCiclo, custoTreinoUsd: treino, ciclos, cotacao: p.cotacao,
      }),
    };
  });
  const soma = (k: 'acessos' | 'valorBrl' | 'custoBrl') => itens.reduce((t, i) => t + i[k], 0);
  return { itens, acessos: soma('acessos'), valorBrl: soma('valorBrl'), custoBrl: soma('custoBrl') };
}

/** Preço de tabela de um simulador no contrato: acessos × preço × ciclos. */
export function valorSimuladorBrl(s: { acessos: number; precoPessoaCiclo: number }, ciclos: number): number {
  return naoNegativo(s.acessos) * naoNegativo(s.precoPessoaCiclo) * Math.max(1, Math.floor(Number(ciclos) || 1));
}

/**
 * Menor preço por pessoa/ciclo em que o simulador paga o próprio custo e ainda
 * deixa a margem-alvo, na mesma conta de `calcularProjeto` (contingência sobre o
 * custo; impostos e comissão sobre a receita), antes de desconto. `Infinity`
 * quando impostos, comissão e margem já somam 100% ou mais: nenhum preço fecha.
 */
export function precoMinimoSimuladorBrl(p: {
  custoPessoaCicloBrl: number;
  contingenciaPct: number;
  impostosPct: number;
  comissaoPct: number;
  margemAlvoPct: number;
}): number {
  const sobra = 1 - (naoNegativo(p.impostosPct) + naoNegativo(p.comissaoPct) + naoNegativo(p.margemAlvoPct)) / 100;
  if (sobra <= 0) return Number.POSITIVE_INFINITY;
  return naoNegativo(p.custoPessoaCicloBrl) * (1 + naoNegativo(p.contingenciaPct) / 100) / sobra;
}

/**
 * Margem do simulador sozinho, em %, na conta de `precoMinimoSimuladorBrl` (é a
 * inversa dela). `null` sem preço: margem de receita zero não é um número.
 */
export function margemSimuladorPct(p: {
  precoPessoaCiclo: number;
  custoPessoaCicloBrl: number;
  contingenciaPct: number;
  impostosPct: number;
  comissaoPct: number;
}): number | null {
  const preco = naoNegativo(p.precoPessoaCiclo);
  if (preco <= 0) return null;
  const sobreReceita = (naoNegativo(p.impostosPct) + naoNegativo(p.comissaoPct)) / 100;
  const custo = naoNegativo(p.custoPessoaCicloBrl) * (1 + naoNegativo(p.contingenciaPct) / 100);
  return ((preco * (1 - sobreReceita) - custo) / preco) * 100;
}

export const MESES_POR_CICLO = 2;
/** Parcela além das do programa (regra do Rodrigo, 02/10/2026): ciclos × 2 + 1. */
export const PARCELAS_ALEM_DO_PROGRAMA = 1;
export const PERFIS_DISC_POR_CARGO = 4;
export const CONTEUDO_POR_FORMATO_DEFAULT = 12;

/** Canais mutuamente exclusivos usados para calcular o custo comercial. */
export const OPCOES_COMISSAO_ORCAMENTO = [
  { key: 'rc', label: 'RC', percentual: 20 },
  { key: 'consultor_parceiro', label: 'Consultor parceiro', percentual: 10 },
  { key: 'consultor_integrador', label: 'Consultor integrador', percentual: 0 },
] as const;

export type TipoComissaoOrcamento = (typeof OPCOES_COMISSAO_ORCAMENTO)[number]['key'];

/** Retorna a política do canal; RC é o fallback seguro do orçamento. */
export function obterComissaoOrcamento(tipo: string) {
  return OPCOES_COMISSAO_ORCAMENTO.find((opcao) => opcao.key === tipo)
    ?? OPCOES_COMISSAO_ORCAMENTO[0];
}

/**
 * Duração do programa em meses: cada ciclo dura dois meses (regra do Rodrigo,
 * 17/09/2026). Até então a calculadora estimava por semanas da jornada
 * (7 × ciclos ÷ 4,345), e a proposta de 5 ciclos dizia "8 meses de programa" ao
 * lado de "10 parcelas".
 */
export function mesesDoPrograma(ciclos: number): number {
  return Math.max(1, Math.floor(Number(ciclos) || 1)) * MESES_POR_CICLO;
}

/**
 * A forma de pagamento acompanha a entrega: uma parcela por mês de programa e
 * mais uma (02/10/2026). Desde então parcelas ≠ duração: 5 ciclos são 10 meses
 * de programa pagos em 11 parcelas. A infra e o custo da curva de exposição
 * correm pelos MESES; o valor do projeto é dividido pelas parcelas.
 */
export function parcelasPorCiclos(ciclos: number): number {
  return mesesDoPrograma(ciclos) + PARCELAS_ALEM_DO_PROGRAMA;
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

/** Rateia qualquer valor do projeto por pessoa no contrato e em cada ciclo. */
export function ratearValorPorPessoa(
  valorTotalBrl: number,
  pessoas: number,
  ciclos: number,
): { contrato: number; porCiclo: number } {
  const totalPessoas = Math.max(0, Number(pessoas) || 0);
  if (totalPessoas === 0) return { contrato: 0, porCiclo: 0 };

  const totalCiclos = Math.max(1, Math.floor(Number(ciclos) || 1));
  const contrato = Math.max(0, Number(valorTotalBrl) || 0) / totalPessoas;
  return { contrato, porCiclo: contrato / totalCiclos };
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
  /** Acessos e preço de cada simulador no escopo. Ausente = nenhum. */
  simuladores?: { acessos: number; precoPessoaCiclo: number }[];
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
  /** Simuladores: acessos × preço × ciclos. Recorrente, como o programa. */
  simuladores: number;
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
  const simuladores = (escopo.simuladores ?? [])
    .reduce((total, s) => total + valorSimuladorBrl(s, ciclos), 0);

  const valorTabela = oneTime + programa + simuladores;
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
    simuladores,
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
