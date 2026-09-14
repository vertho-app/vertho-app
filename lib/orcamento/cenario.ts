/**
 * Serialização do cenário do deal desk — o que "salvar orçamento" grava e lê.
 *
 * POR QUE AS ENTRADAS *E* O RESULTADO (não um dos dois):
 *
 *   · Só o resultado viraria uma foto sem reprodução: dava para ver o número,
 *     não para voltar à tela que o produziu.
 *   · Só as entradas recalculam com a régua NOVA. `ORCAMENTO_DEFAULTS` e o
 *     catálogo de IA evoluem (a cotação foi a PTAX de 10/09, o preset "atual"
 *     é o que está em produção hoje) — um orçamento aprovado em setembro,
 *     reaberto em novembro, mostraria outro valor sem que ninguém tivesse
 *     decidido nada. Para uma decisão comercial isso é o pior dos dois mundos.
 *
 * Então `entradas` reproduz a tela e `resultado` congela a decisão do dia. É o
 * mesmo par de `copilot_plans.inputs`/`.plan` (mig 235).
 *
 * `normalizarEntradas` é a função load-bearing: um cenário salvo ANTES de um
 * campo existir tem de carregar com o default da régua, não quebrar a tela — e
 * é ela que impede lixo vindo do banco de virar `NaN` propagando por todo o
 * cálculo (e, na Fase 2, de chegar a uma proposta).
 */
import {
  CONTEUDO_POR_FORMATO_DEFAULT,
  OPCOES_COMISSAO_ORCAMENTO,
  ORCAMENTO_DEFAULTS,
  distribuirMatrizes,
  obterComissaoOrcamento,
  type ConteudoPorFormato,
  type TipoComissaoOrcamento,
} from './precificacao';

export type MetodoMapeamento = 'votacao' | 'workshop';
export const METODOS_MAPEAMENTO: readonly MetodoMapeamento[] = ['votacao', 'workshop'];

export type PricingOrcamento = typeof ORCAMENTO_DEFAULTS;

export type EntradasOrcamento = {
  nClusters: number;
  nPerfis: number;
  nColabs: number;
  /** Matrizes criadas do zero; as restantes são adaptadas (`distribuirMatrizes`). */
  matrizNovas: number;
  ciclosPorAno: number;
  metodo: MetodoMapeamento;
  tipoComissao: TipoComissaoOrcamento;
  /** Chave do preset de modelos IA — validada contra a lista da tela. */
  preset: string;
  /** Chave da jornada contratada — validada contra a lista da tela. */
  jornada: string;
  conteudoColab: ConteudoPorFormato;
  nVideosExtraidos: number;
  auditarExtracao: boolean;
  comAvatar: boolean;
  pricing: PricingOrcamento;
};

/**
 * Folha de decisão CONGELADA no dia do save. Não é cache: é o registro do que
 * foi decidido, e por isso não se recalcula ao listar.
 */
export type ResumoOrcamento = {
  valorTabela: number;
  valorFinal: number;
  desconto: number;
  parcela: number;
  parcelas: number;
  margemAbs: number;
  margemPct: number;
  descontoMaxPct: number;
  acimaDoPiso: boolean;
  custoTotalBrl: number;
  custoOperacionalBrl: number;
  custoIABrl: number;
  investimentoPorPessoaBrl: number;
  custoPorPessoaBrl: number;
  mesesPrograma: number;
  ciclos: number;
  pessoas: number;
  unidades: number;
  cargos: number;
  jornada: string;
  piorSaldo: { mes: number; saldo: number };
};

/**
 * As chaves válidas de `preset` e `jornada` pertencem à TELA (é ela que tem
 * `PRESETS` e `JORNADAS`). O núcleo não duplica as listas — recebê-las por
 * parâmetro é o que impede as duas de divergirem em silêncio.
 */
export type ListasValidas = {
  presets: readonly string[];
  jornadas: readonly string[];
};

/** `clientesAtivos` é divisor do rateio de infra: zero dividiria por zero. */
const MINIMOS_PRICING: Partial<Record<keyof PricingOrcamento, number>> = {
  clientesAtivos: 1,
};

const LIMITE_NOME = 120;
const LIMITE_CLIENTE = 120;

function inteiro(v: unknown, padrao: number, minimo: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return padrao;
  return Math.max(minimo, Math.floor(n));
}

function real(v: unknown, padrao: number, minimo = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return padrao;
  return Math.max(minimo, n);
}

function booleano(v: unknown, padrao: boolean): boolean {
  return typeof v === 'boolean' ? v : padrao;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** O cenário com que a tela abre — os defaults vigentes da régua. */
export function entradasPadrao(listas: ListasValidas): EntradasOrcamento {
  const porFormato = CONTEUDO_POR_FORMATO_DEFAULT;
  return {
    nClusters: 1,
    nPerfis: 3,
    nColabs: 100,
    matrizNovas: 3,
    ciclosPorAno: 1,
    metodo: 'votacao',
    tipoComissao: OPCOES_COMISSAO_ORCAMENTO[0].key,
    preset: listas.presets[0] ?? 'atual',
    jornada: listas.jornadas[0] ?? 'jornada',
    conteudoColab: { video: porFormato, podcast: porFormato, texto: porFormato, case: porFormato },
    nVideosExtraidos: 0,
    auditarExtracao: true,
    comAvatar: true,
    pricing: { ...ORCAMENTO_DEFAULTS },
  };
}

/**
 * Reconstrói as entradas de um cenário gravado. Campo ausente ou inválido cai
 * no default da régua; o objeto inteiro inválido devolve `null` (a action
 * reporta "cenário ilegível" em vez de renderizar `NaN`).
 *
 * Chave desconhecida é DESCARTADA de propósito: o que volta é sempre um
 * `EntradasOrcamento` completo, então um campo removido da tela não ressuscita
 * por estar no jsonb.
 */
export function normalizarEntradas(bruto: unknown, listas: ListasValidas): EntradasOrcamento | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const padrao = entradasPadrao(listas);

  const preset = typeof b.preset === 'string' && listas.presets.includes(b.preset) ? b.preset : padrao.preset;
  const jornada = typeof b.jornada === 'string' && listas.jornadas.includes(b.jornada) ? b.jornada : padrao.jornada;
  const metodo = METODOS_MAPEAMENTO.includes(b.metodo as MetodoMapeamento)
    ? (b.metodo as MetodoMapeamento)
    : padrao.metodo;

  // `obterComissaoOrcamento` já é o fallback seguro da régua (RC).
  const tipoComissao = obterComissaoOrcamento(String(b.tipoComissao ?? '')).key;

  const nPerfis = inteiro(b.nPerfis, padrao.nPerfis, 1);
  const cont = objeto(b.conteudoColab);
  const formatos = ['video', 'podcast', 'texto', 'case'] as const;
  const conteudoColab = formatos.reduce(
    (acc, f) => ({ ...acc, [f]: inteiro(cont[f], padrao.conteudoColab[f], 0) }),
    {} as ConteudoPorFormato,
  );

  const pricingBruto = objeto(b.pricing);
  const pricing = { ...padrao.pricing };
  for (const chave of Object.keys(padrao.pricing) as (keyof PricingOrcamento)[]) {
    pricing[chave] = real(pricingBruto[chave], padrao.pricing[chave], MINIMOS_PRICING[chave] ?? 0);
  }

  return {
    nClusters: inteiro(b.nClusters, padrao.nClusters, 1),
    nPerfis,
    nColabs: inteiro(b.nColabs, padrao.nColabs, 0),
    // Uma matriz "nova" além do número de cargos não existe: o resto é adaptada.
    matrizNovas: Math.min(nPerfis, inteiro(b.matrizNovas, padrao.matrizNovas, 0)),
    ciclosPorAno: inteiro(b.ciclosPorAno, padrao.ciclosPorAno, 1),
    metodo,
    tipoComissao,
    preset,
    jornada,
    conteudoColab,
    nVideosExtraidos: inteiro(b.nVideosExtraidos, padrao.nVideosExtraidos, 0),
    auditarExtracao: booleano(b.auditarExtracao, padrao.auditarExtracao),
    comAvatar: booleano(b.comAvatar, padrao.comAvatar),
    pricing,
  };
}

/**
 * Valida o resumo gravado. Menos estrito que as entradas: um resumo incompleto
 * (cenário salvo antes de um KPI existir) ainda é listável — os campos que
 * faltam viram 0/false, porque perder a LINHA da lista seria pior do que
 * exibir um KPI zerado.
 */
export function normalizarResumo(bruto: unknown): ResumoOrcamento | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const pior = objeto(b.piorSaldo);
  return {
    valorTabela: real(b.valorTabela, 0),
    valorFinal: real(b.valorFinal, 0),
    desconto: real(b.desconto, 0),
    parcela: real(b.parcela, 0),
    parcelas: inteiro(b.parcelas, 1, 1),
    margemAbs: real(b.margemAbs, 0, -Number.MAX_SAFE_INTEGER),
    margemPct: real(b.margemPct, 0, -Number.MAX_SAFE_INTEGER),
    descontoMaxPct: real(b.descontoMaxPct, 0),
    acimaDoPiso: booleano(b.acimaDoPiso, false),
    custoTotalBrl: real(b.custoTotalBrl, 0),
    custoOperacionalBrl: real(b.custoOperacionalBrl, 0),
    custoIABrl: real(b.custoIABrl, 0),
    investimentoPorPessoaBrl: real(b.investimentoPorPessoaBrl, 0),
    custoPorPessoaBrl: real(b.custoPorPessoaBrl, 0),
    mesesPrograma: inteiro(b.mesesPrograma, 1, 1),
    ciclos: inteiro(b.ciclos, 1, 1),
    pessoas: inteiro(b.pessoas, 0, 0),
    unidades: inteiro(b.unidades, 0, 0),
    cargos: inteiro(b.cargos, 0, 0),
    jornada: typeof b.jornada === 'string' ? b.jornada : '',
    piorSaldo: { mes: inteiro(pior.mes, 1, 1), saldo: real(pior.saldo, 0, -Number.MAX_SAFE_INTEGER) },
  };
}

export type Identificacao = { nome: string; cliente: string | null };

/**
 * Tipo PLANO, como o `ActionResult` de `lib/auth/protected-action.ts`: com
 * `strict:false` o projeto não estreita union discriminada de forma confiável,
 * então `{ok:true}|{ok:false}` obrigaria todo chamador a fazer cast.
 */
export type ResultadoIdentificacao = { ok: boolean; valor?: Identificacao; erro?: string };

/**
 * Nome é obrigatório: uma lista de orçamentos sem nome é uma lista de
 * "R$ 5.569.000 · 14/09" onde nada distingue um cenário do outro.
 */
export function validarIdentificacao(nome: unknown, cliente: unknown): ResultadoIdentificacao {
  const n = typeof nome === 'string' ? nome.trim() : '';
  if (!n) return { ok: false, erro: 'Dê um nome ao orçamento' };
  if (n.length > LIMITE_NOME) return { ok: false, erro: `Nome muito longo (máximo ${LIMITE_NOME} caracteres)` };

  const c = typeof cliente === 'string' ? cliente.trim() : '';
  if (c.length > LIMITE_CLIENTE) return { ok: false, erro: `Cliente muito longo (máximo ${LIMITE_CLIENTE} caracteres)` };

  return { ok: true, valor: { nome: n, cliente: c || null } };
}

/**
 * Rascunho do escopo que vai no documento da proposta.
 *
 * É RASCUNHO, e por isso a tela o entrega num campo editável e o server exige o
 * texto revisado: `included_scope` vira a lista de bullets que o CLIENTE lê em
 * /proposta/[token]. Gerar isso automaticamente e gravar sem ninguém olhar seria
 * publicar texto comercial derivado de uma calculadora.
 *
 * Uma linha por item — `buildProposalDocument` quebra `included_scope` por `\n`.
 */
export function escopoPropostaDoCenario(
  e: EntradasOrcamento,
  r: ResumoOrcamento,
  jornada: { rotulo: string; semanas: number },
): string {
  const { novas, adaptadas } = distribuirMatrizes(r.cargos, e.matrizNovas);
  const c = e.conteudoColab;
  // Este texto vira bullet no documento do cliente: plural errado aqui é erro
  // publicado, não cosmetic. `institucional → institucionais` (l vira is) é o
  // caso que uma concatenação de sufixo erra em silêncio.
  const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  const linhas = [
    `Programa ${jornada.rotulo} de ${p(jornada.semanas, 'semana', 'semanas')} · ${p(r.ciclos, 'ciclo', 'ciclos')}`,
    `${p(r.pessoas, 'pessoa', 'pessoas')} · ${p(r.unidades, 'unidade', 'unidades')} · `
      + `${p(r.cargos, 'cargo mapeado', 'cargos mapeados')} por ${e.metodo === 'workshop' ? 'workshop' : 'votação'}`,
    `Matrizes de competência: ${p(novas, 'nova', 'novas')}, ${p(adaptadas, 'adaptada', 'adaptadas')}`,
    `${p(c.video, 'vídeo', 'vídeos')}, ${p(c.podcast, 'podcast', 'podcasts')}, `
      + `${p(c.texto, 'texto', 'textos')} e ${p(c.case, 'case', 'cases')} por pessoa/ciclo`,
    'Mentor IA e trilhas personalizadas por cargo e perfil comportamental',
    'Relatório de evolução por competência ao fim de cada ciclo',
  ];
  if (e.nVideosExtraidos > 0) {
    linhas.splice(
      3,
      0,
      `Extração de ${p(e.nVideosExtraidos, 'vídeo institucional', 'vídeos institucionais')} como matéria-prima do conteúdo`,
    );
  }
  return linhas.join('\n');
}
