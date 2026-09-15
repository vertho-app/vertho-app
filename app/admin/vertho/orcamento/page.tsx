'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight, BookOpen, Calculator, School, Users, Briefcase, Vote, Building2, Film, FileText, Headphones, Clapperboard, Route, ShieldCheck, Save, FolderOpen, Trash2, Copy, Send } from 'lucide-react';
import BackButton from '@/components/back-button';
import { CALLS, PRESETS, calcCost, custoColabNaJornada, infraFixaTotal } from '@/lib/ia-cost-catalog';
import {
  entradasPadrao,
  escopoPropostaDoCenario,
  normalizarEntradas,
  type EntradasOrcamento,
  type ListasValidas,
  type ResumoOrcamento,
} from '@/lib/orcamento/cenario';
import {
  carregarOrcamento,
  excluirOrcamento,
  listarOrcamentos,
  salvarOrcamento,
  type OrcamentoSalvo,
} from '@/actions/orcamento/cenarios';
import { criarPropostaDeOrcamento } from '@/actions/sales/proposals-admin';
import { calculateProposalFinancials } from '@/lib/sales/commissions';
import {
  CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, PRODUCT_PACKAGES, PRODUCT_PACKAGE_LABELS,
} from '@/lib/sales/constants';
import {
  ORCAMENTO_DEFAULTS,
  CONTEUDO_POR_FORMATO_DEFAULT,
  calcularProjeto,
  custoConteudoComReuso,
  distribuirMatrizes,
  obterComissaoOrcamento,
  OPCOES_COMISSAO_ORCAMENTO,
  parcelasPorCiclos,
  ratearValorPorPessoa,
  reusoConteudoPorCelula,
  type TipoComissaoOrcamento,
} from '@/lib/orcamento/precificacao';
import {
  PROGRAMA_JORNADA, PROGRAMA_REGULAR_DUO, PROGRAMA_REGULAR,
  PROGRAMA_ONBOARDING, PROGRAMA_PILOTO,
} from '@/lib/season-engine/programa-config';

type Metodo = 'votacao' | 'workshop';
type PresetKey = 'atual' | 'premium' | 'balanced' | 'cheap';

const PRESET_KEYS: PresetKey[] = ['atual', 'premium', 'balanced', 'cheap'];

/**
 * A jornada contratada muda o custo por pessoa mais do que qualquer outro campo
 * desta tela: 7 semanas com 1 competência não paga o que 14 com 2 pagam.
 * Até 01/09/2026 o orçamento somava o `exec` fixo do catálogo (que descreve só o
 * Regular DUO) para qualquer proposta — uma jornada de 7 semanas entrava na conta
 * pelo dobro do que custa. O orçamento agora abre na Jornada de 7 semanas, sem
 * alterar o default global da engine usado na operação.
 */
const JORNADAS = [
  { key: 'jornada', rotulo: 'Jornada', sub: '7 sem · 1 comp', cfg: PROGRAMA_JORNADA },
  { key: 'regular_duo', rotulo: 'Regular DUO', sub: '14 sem · 2 comp', cfg: PROGRAMA_REGULAR_DUO },
  { key: 'regular_single', rotulo: 'Regular', sub: '14 sem · 1 comp', cfg: PROGRAMA_REGULAR },
  { key: 'onboarding', rotulo: 'Onboarding', sub: '10 sem · 5 comp', cfg: PROGRAMA_ONBOARDING },
  { key: 'piloto', rotulo: 'Piloto', sub: 'degustação', cfg: PROGRAMA_PILOTO },
] as const;

/**
 * As chaves válidas de preset e jornada — fonte única para `normalizarEntradas`.
 *
 * Um cenário salvo há meses pode trazer uma chave que não existe mais (preset
 * renomeado, jornada retirada da oferta). Sem esta lista, `PRESETS[preset].label`
 * lançaria ao reabrir o orçamento: a tela inteira morreria por um campo de um
 * jsonb antigo. Chave desconhecida cai no default, não quebra.
 */
const LISTAS_VALIDAS: ListasValidas = {
  presets: PRESET_KEYS,
  jornadas: JORNADAS.map((j) => j.key),
};

/**
 * ⚠️ O PRAZO NÃO ENTRA NO PREÇO (07/09/2026).
 *
 * O contrato é vendido pelo PROJETO; a mensalidade é forma de pagamento. Até
 * aqui a receita fazia `mensalidade × meses` e o custo fazia `custo × ciclos` —
 * duas dimensões soltas, e o resultado eram dois erros simétricos, medidos com
 * os próprios defaults desta tela (100 pessoas, 1 unidade, 3 cargos):
 *
 *   · parcelar o MESMO projeto em 24 meses em vez de 12 → receita ×1,96, custo ×1,00
 *   · entregar o DOBRO do programa (2 ciclos) em 12 meses → receita ×1,00, custo ×1,99
 *
 * O preço recorrente é por pessoa e por CICLO, e `parcelas` só divide. Desde
 * 12/09/2026, a forma de pagamento também deixa de ser uma dimensão solta:
 * cada ciclo contratado gera duas parcelas.
 */
// Fonte única também usada na sugestão de preço das propostas comerciais.
const PRECOS_DEFAULT = ORCAMENTO_DEFAULTS;

function moneyBRL(v: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v);
}

function moneyBRLUnit(v: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(v);
}

/**
 * Calcula o custo de IA (em USD) do setup de UM cluster.
 * Setup compreende: PPP + IA1/IA2 (só se votação) + IA3/CB sempre, escalando por nº de perfis.
 * Tagging de conteúdos NÃO entra aqui — é cobrado 1× por orçamento (banco compartilhado).
 */
function custoIASetupCluster(nPerfis: number, metodo: Metodo, presetFn: (call: any) => string): number {
  let total = 0;
  for (const call of CALLS) {
    if (call.scaleType !== 'empresa') continue;
    if (call.id === 'tagging-conteudos') continue; // cobrado 1× total

    let exec: number = call.exec;
    let skip = false;

    switch (call.id) {
      case 'ppp-extracao':
        exec = 1;
        break;
      case 'ia1-top10':
        if (metodo === 'workshop') skip = true;
        else exec = nPerfis;
        break;
      case 'ia2-gabarito':
        if (metodo === 'workshop') skip = true;
        else exec = nPerfis * 5;
        break;
      case 'ia3-cenarios':
      case 'ia3-cenarios-check':
      case 'cenarios-b':
      case 'cenarios-b-check':
        exec = nPerfis * 5;
        break;
    }

    if (skip) continue;

    const model = presetFn(call);
    const c = calcCost({ ...call, exec }, model, 1);
    if (c) total += c.usd;
  }
  return total;
}

function custoIATaggingTotal(presetFn: (call: any) => string): number {
  const call = CALLS.find((c) => c.id === 'tagging-conteudos');
  if (!call) return 0;
  const model = presetFn(call);
  return calcCost(call, model, 1)?.usd || 0;
}

/**
 * Custo de IA por colaborador na jornada escolhida. Delega ao catálogo, que lê
 * as dimensões do modo (semanas de conteúdo, missões, competências) em vez do
 * `exec` fixo — ver `custoColabNaJornada` em `lib/ia-cost-catalog.ts`.
 */
function custoIAPorColab(presetFn: (call: any) => string, cfg: any): number {
  return custoColabNaJornada(cfg, presetFn).usd;
}

/**
 * Custo de IA da geração de conteúdo, modelado por CONSUMO POR COLABORADOR.
 * Cada colaborador recebe N peças por formato; o `reuso` (colabs que
 * compartilham cada peça) divide o custo — reuso=1 significa conteúdo único por
 * colaborador (custo máximo), reuso alto = biblioteca compartilhada (barato).
 *
 * Os quatro formatos são orçados juntos. Vídeo usa o pipeline atual do
 * Módulo-Base (Opus + HeyGen opcional + Remotion + TTS), não o Veo descontinuado.
 */
function custoIAConteudo(
  porColab: { video: number; podcast: number; texto: number; case: number },
  nColabs: number,
  reuso: number,
  comAvatar: boolean,
) {
  const byId = (id: string) => CALLS.find((c) => c.id === id);
  const unit = (id: string) => {
    const call = byId(id);
    if (!call) return 0;
    return calcCost(call, (call as any).defaultModel, 1)?.usd || 0;
  };
  const uPodcast = unit('conteudo-podcast-roteiro') + unit('conteudo-podcast-tts');
  // PDFs de texto e case percorrem geração, expansão e layout. A expansão é
  // condicional no código, mas entra 1× como premissa conservadora.
  const uTexto = unit('conteudo-texto') + unit('conteudo-expansao-pdf') + unit('conteudo-layout-plan');
  const uCase = unit('conteudo-case') + unit('conteudo-expansao-pdf') + unit('conteudo-layout-plan');
  const uVideo = custoIAVideoGerado(1, comAvatar);
  const custo = custoConteudoComReuso(
    porColab,
    { video: uVideo, podcast: uPodcast, texto: uTexto, case: uCase },
    nColabs,
    reuso,
  );
  const totalPecasPorColab = porColab.video + porColab.podcast + porColab.texto + porColab.case;
  return {
    perColab: custo.porPessoa,
    total: custo.total,
    totalPecasPorColab,
    uVideo,
    uPodcast,
    uTexto,
    uCase,
  };
}

/**
 * Custo de IA da extração de vídeo → Módulo-Base. One-time por vídeo (matéria-
 * prima reusada entre colabs/tenants). Áudio→texto (Gemini) + detecção +
 * estruturação (Sonnet). Auditoria opcional (só ao submeter à revisão). Modelos
 * são fixos pelo serviço → usa defaultModel (não aplica preset).
 */
function custoIAExtracao(nVideos: number, incluirAuditoria: boolean) {
  let total = 0;
  for (const call of CALLS) {
    if (call.scaleType !== 'extracao') continue;
    if (call.id === 'extracao-auditor' && !incluirAuditoria) continue;
    const c = calcCost(call, (call as any).defaultModel, Math.max(0, nVideos || 0));
    if (c) total += c.usd;
  }
  return total;
}

/**
 * Custo unitário de VÍDEO a partir do Módulo-Base (Opus batch + HeyGen +
 * Remotion Hetzner + narração TTS). Avatar opcional (sem ele, sai só cenas
 * animadas e o custo cai ~$0,47).
 */
function custoIAVideoGerado(nVideos: number, comAvatar: boolean) {
  let total = 0;
  for (const call of CALLS) {
    if (call.scaleType !== 'video_gerado') continue;
    if (call.id === 'video-modulo-avatar' && !comAvatar) continue;
    const c = calcCost(call, (call as any).defaultModel, Math.max(0, nVideos || 0));
    if (c) total += c.usd;
  }
  return total;
}

export default function OrcamentoPage() {
  const locale = useLocale();
  const t = useTranslations('AdminBudget');
  const money = (v: number) => moneyBRL(v, locale);

  // Inputs do escopo
  const [nClusters, setNClusters] = useState(1);
  const [nPerfis, setNPerfis] = useState(3);
  const [metodo, setMetodo] = useState<Metodo>('votacao');
  const [nColabs, setNColabs] = useState(100);
  // As matrizes restantes são sempre adaptadas: cargos = novas + adaptadas.
  const [matrizNovas, setMatrizNovas] = useState(3);
  function setCargos(v: number) {
    setNPerfis(v);
    setMatrizNovas((atuais) => Math.min(v, atuais));
  }
  const [ciclosPorAno, setCiclosPorAno] = useState(1); // ciclos de programa entregues
  const [tipoComissao, setTipoComissao] = useState<TipoComissaoOrcamento>('rc');
  const [preset, setPreset] = useState<PresetKey>('atual');
  const [jornada, setJornada] = useState<string>('jornada');
  const cfgJornada = useMemo(
    () => (JORNADAS.find((j) => j.key === jornada) || JORNADAS[0]).cfg,
    [jornada],
  );
  const presetLabel = preset === 'atual' ? 'Configuração atual da plataforma' : PRESETS[preset].label;
  // 48 peças por pessoa/ciclo: 12 de cada um dos quatro formatos.
  const [conteudoColab, setConteudoColab] = useState({
    video: CONTEUDO_POR_FORMATO_DEFAULT,
    podcast: CONTEUDO_POR_FORMATO_DEFAULT,
    texto: CONTEUDO_POR_FORMATO_DEFAULT,
    case: CONTEUDO_POR_FORMATO_DEFAULT,
  });
  function setConteudo<K extends keyof typeof conteudoColab>(k: K, v: number) {
    setConteudoColab((q) => ({ ...q, [k]: v }));
  }
  // Extração de vídeo → módulo-base (one-time, matéria-prima reusada).
  const [nVideosExtraidos, setNVideosExtraidos] = useState(0);
  const [auditarExtracao, setAuditarExtracao] = useState(true);
  // O vídeo é um dos quatro formatos do conteúdo. Avatar segue opcional.
  const [comAvatar, setComAvatar] = useState(true);
  const reusoConteudo = reusoConteudoPorCelula(nColabs, nPerfis);

  // Inputs de pricing
  const [pricing, setPricing] = useState({ ...PRECOS_DEFAULT });

  function setPricingField<K extends keyof typeof PRECOS_DEFAULT>(k: K, v: number) {
    setPricing((p) => ({ ...p, [k]: v }));
  }

  const calc = useMemo(() => {
    const presetFn = (call: (typeof CALLS)[number]) =>
      preset === 'atual' ? call.defaultModel : PRESETS[preset].model(call);

    // Custo IA (USD)
    const custoSetupPorCluster = custoIASetupCluster(nPerfis, metodo, presetFn);
    const custoTaggingTotal = custoIATaggingTotal(presetFn);
    const custoPorColab = custoIAPorColab(presetFn, cfgJornada);
    const conteudo = custoIAConteudo(conteudoColab, nColabs, reusoConteudo, comAvatar);
    const custoConteudoTotal = conteudo.total;
    const custoConteudoPorColab = conteudo.perColab;

    // Extração de vídeo → módulo-base (one-time, não escala por ciclo).
    const custoExtracaoTotal = custoIAExtracao(nVideosExtraidos, auditarExtracao);
    const custoExtracaoPorVideo = custoIAExtracao(1, auditarExtracao);

    // Setup + tagging: uma vez (implantação). Mentor IA + Conteúdo: por ciclo.
    // A base inteira entra no pior caso de custo: adesão orçada = 100%.
    const ciclos = Math.max(1, Math.floor(ciclosPorAno || 1));
    const pessoasAtivas = nColabs;
    const custoSetupTotal = nClusters * custoSetupPorCluster + custoTaggingTotal;
    const custoColabsTotalAno = pessoasAtivas * custoPorColab * ciclos;
    const custoConteudoTotalAno = custoConteudoTotal * ciclos;
    const custoIAUsd = custoSetupTotal + custoColabsTotalAno + custoConteudoTotalAno + custoExtracaoTotal;
    const custoIABrl = custoIAUsd * pricing.cotacao;

    // ── Custo cheio: IA + horas + mensagens + infra ──
    const { novas: matrizesNovas, adaptadas: matrizesAdaptadas } = distribuirMatrizes(nPerfis, matrizNovas);
    const horasTotais =
      pricing.horasImplantacao +
      matrizesNovas * pricing.horasMatrizNova +
      matrizesAdaptadas * pricing.horasMatrizAdaptada +
      (metodo === 'workshop' ? nClusters * pricing.horasWorkshop : 0);
    const custoHorasBrl = horasTotais * pricing.custoHora;
    const custoMsgBrl = pessoasAtivas * pricing.msgsPorPessoaCiclo * pricing.custoMsgUnitario * ciclos;
    // Duração real do PROGRAMA (não do contrato): é por ela que a infra é rateada.
    const mesesPrograma = Math.max(1, Math.round((cfgJornada.semanas * ciclos) / 4.345));
    const infra = infraFixaTotal();
    const infraMesUsd = ((infra.min + infra.max) / 2) / Math.max(1, pricing.clientesAtivos);
    const custoInfraBrl = infraMesUsd * mesesPrograma * pricing.cotacao;
    const custoOperacionalBrl = custoIABrl + custoHorasBrl + custoMsgBrl + custoInfraBrl;
    const contingenciaRate = Math.max(0, pricing.contingenciaPct) / 100;
    const custoContingenciaBrl = custoOperacionalBrl * contingenciaRate;
    const custoEntregaBrl = custoOperacionalBrl + custoContingenciaBrl;
    const comissao = obterComissaoOrcamento(tipoComissao);
    const comissaoRate = comissao.percentual / 100;
    const impostosRate = Math.max(0, pricing.impostosPct) / 100;

    // ── Valor do projeto — pelo ESCOPO, nunca pelo prazo ──
    // A conta vive em `lib/orcamento/precificacao.ts` (pura, com teste): ela teve
    // um erro de MODELO, e modelo só não regride com guard.
    const custoOneTime = (
      custoHorasBrl +
      custoSetupTotal * pricing.cotacao +
      custoExtracaoTotal * pricing.cotacao
    ) * (1 + contingenciaRate);
    const parcelas = parcelasPorCiclos(ciclos);

    const projeto = calcularProjeto(
      {
        pessoas: nColabs,
        ciclos,
        unidades: nClusters,
        matrizesNovas,
        matrizesAdaptadas,
        workshop: metodo === 'workshop',
        parcelas,
      },
      {
        setupGeral: pricing.precoSetupGeral,
        pessoaCiclo: pricing.precoPessoaCiclo,
        unidade: pricing.precoCluster,
        matrizNova: pricing.precoMatrizNova,
        matrizAdaptada: pricing.precoMatrizAdaptada,
        workshop: pricing.adicionalWorkshop,
        descontoPct: pricing.descontoPct,
        margemAlvoPct: pricing.margemAlvoPct,
      },
      {
        totalBrl: custoEntregaBrl,
        oneTimeBrl: custoOneTime,
        mesesPrograma,
        percentualSobreReceita: comissaoRate + impostosRate,
      },
    );

    const custoComissoesBrl = projeto.valorFinal * comissaoRate;
    const custoImpostosBrl = projeto.valorFinal * impostosRate;
    const custoTotalBrl = custoEntregaBrl + custoComissoesBrl + custoImpostosBrl;
    const investimentoUnitario = ratearValorPorPessoa(projeto.valorFinal, nColabs, ciclos);
    const custoUnitario = ratearValorPorPessoa(custoTotalBrl, nColabs, ciclos);

    const tabelaSetupGeral = pricing.precoSetupGeral;
    const tabelaClusters = nClusters * pricing.precoCluster;
    const tabelaPerfis = matrizesNovas * pricing.precoMatrizNova + matrizesAdaptadas * pricing.precoMatrizAdaptada;
    const tabelaWorkshop = metodo === 'workshop' ? nClusters * pricing.adicionalWorkshop : 0;
    const tabelaPessoasCiclo = nColabs * pricing.precoPessoaCiclo;

    return {
      tabelaPrograma: projeto.programa,
      oneTimeTabela: projeto.oneTime,
      valorTotalTabela: projeto.valorTabela,
      valorTotalFinal: projeto.valorFinal,
      descontoTotal: projeto.desconto,
      mensalidadeFlat: projeto.parcela,
      margemAbs: projeto.margemAbs,
      margemPct: projeto.margemPct,
      descontoMaxPct: projeto.descontoMaxPct,
      acimaDoPiso: projeto.acimaDoPiso,
      exposicao: projeto.exposicao,
      piorSaldo: projeto.piorSaldo,
      matrizesNovas,
      matrizesAdaptadas,
      horasTotais,
      custoHorasBrl,
      custoMsgBrl,
      custoInfraBrl,
      custoOperacionalBrl,
      custoContingenciaBrl,
      custoComissoesBrl,
      custoImpostosBrl,
      comissaoLabel: comissao.label,
      comissaoPct: comissaoRate * 100,
      custoTotalBrl,
      investimentoPorPessoaBrl: investimentoUnitario.contrato,
      investimentoPorPessoaCicloBrl: investimentoUnitario.porCiclo,
      custoPorPessoaBrl: custoUnitario.contrato,
      custoPorPessoaCicloBrl: custoUnitario.porCiclo,
      mesesPrograma,
      tabelaPessoasCiclo,
      parcelas,
      custoSetupPorCluster,
      custoTaggingTotal,
      custoPorColab,
      custoConteudoTotal,
      custoConteudoTotalAno,
      custoConteudoPorColab,
      totalPecasPorColab: conteudo.totalPecasPorColab,
      custoVideoGeradoPorVideo: conteudo.uVideo,
      custoExtracaoTotal,
      custoExtracaoPorVideo,
      custoSetupTotal,
      custoColabsTotalAno,
      ciclos,
      custoIAUsd,
      custoIABrl,
      tabelaSetupGeral,
      tabelaClusters,
      tabelaPerfis,
      tabelaWorkshop,
    };
  }, [nClusters, nPerfis, metodo, nColabs, ciclosPorAno, matrizNovas, tipoComissao, preset, cfgJornada, pricing, conteudoColab, nVideosExtraidos, auditarExtracao, comAvatar, reusoConteudo]);

  // ── Orçamento salvo (mig 253) ──────────────────────────────────────────────
  // `id` nulo = cenário novo; preenchido = este cenário já existe no banco e
  // "Salvar" o sobrescreve. É o que distingue atualizar de criar uma cópia.
  const [ident, setIdent] = useState<{
    id: string | null;
    nome: string;
    cliente: string;
    propostaId: string | null;
  }>({ id: null, nome: '', cliente: '', propostaId: null });
  const [salvos, setSalvos] = useState<OrcamentoSalvo[]>([]);
  const [listaAberta, setListaAberta] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Conversão em proposta: o escopo é editável porque vira texto que o CLIENTE lê.
  const [convAberta, setConvAberta] = useState(false);
  const [convEscopo, setConvEscopo] = useState('');
  const [convPagamento, setConvPagamento] = useState('');
  const [convTipoCliente, setConvTipoCliente] = useState('');
  const [convPacote, setConvPacote] = useState('');
  // Contato que assina o documento (mig 255). Obrigatório no server: sem RC, é
  // a única coisa que diz ao cliente com quem falar. Guardado no navegador
  // porque é quase sempre o mesmo — redigitar a cada conversão é o atrito que
  // faz alguém deixar em branco.
  const [convContatoNome, setConvContatoNome] = useState('');
  const [convContatoEmail, setConvContatoEmail] = useState('');
  const [convContatoWhats, setConvContatoWhats] = useState('');

  /**
   * Junta o estado da tela num `EntradasOrcamento`. Tipar o retorno é o que
   * impede a deriva: campo novo no tipo obriga a acrescentá-lo aqui (e, ao lado,
   * em `aplicarEntradas`), senão não compila.
   */
  function coletarEntradas(): EntradasOrcamento {
    return {
      nClusters,
      nPerfis,
      nColabs,
      matrizNovas,
      ciclosPorAno,
      metodo,
      tipoComissao,
      preset,
      jornada,
      conteudoColab,
      nVideosExtraidos,
      auditarExtracao,
      comAvatar,
      pricing,
    };
  }

  /** Devolve um cenário normalizado à tela. Sempre via `normalizarEntradas`. */
  function aplicarEntradas(e: EntradasOrcamento) {
    setNClusters(e.nClusters);
    setNPerfis(e.nPerfis);
    setNColabs(e.nColabs);
    // A régua é `cargos = novas + adaptadas`: novas nunca passam de cargos.
    setMatrizNovas(Math.min(e.nPerfis, e.matrizNovas));
    setCiclosPorAno(e.ciclosPorAno);
    setMetodo(e.metodo);
    setTipoComissao(e.tipoComissao);
    // Seguro: normalizarEntradas só devolve chave presente em LISTAS_VALIDAS.
    setPreset(e.preset as PresetKey);
    setJornada(e.jornada);
    setConteudoColab(e.conteudoColab);
    setNVideosExtraidos(e.nVideosExtraidos);
    setAuditarExtracao(e.auditarExtracao);
    setComAvatar(e.comAvatar);
    setPricing(e.pricing);
  }

  /**
   * A folha de decisão CONGELADA. Não é cache de `calc`: é o registro do que foi
   * decidido com a régua deste dia. Reabrir o cenário recalcula com a régua
   * nova; o que está gravado aqui continua sendo o número aprovado.
   */
  const resumo: ResumoOrcamento = {
    valorTabela: calc.valorTotalTabela,
    valorFinal: calc.valorTotalFinal,
    desconto: calc.descontoTotal,
    parcela: calc.mensalidadeFlat,
    parcelas: calc.parcelas,
    margemAbs: calc.margemAbs,
    margemPct: calc.margemPct,
    descontoMaxPct: calc.descontoMaxPct,
    acimaDoPiso: calc.acimaDoPiso,
    custoTotalBrl: calc.custoTotalBrl,
    custoOperacionalBrl: calc.custoOperacionalBrl,
    custoIABrl: calc.custoIABrl,
    investimentoPorPessoaBrl: calc.investimentoPorPessoaBrl,
    custoPorPessoaBrl: calc.custoPorPessoaBrl,
    mesesPrograma: calc.mesesPrograma,
    ciclos: calc.ciclos,
    pessoas: nColabs,
    unidades: nClusters,
    cargos: nPerfis,
    jornada,
    piorSaldo: calc.piorSaldo ?? { mes: 1, saldo: 0 },
  };

  const recarregarSalvos = useCallback(async () => {
    try {
      const r = await listarOrcamentos();
      if (r.success) setSalvos(r.data);
    } catch {
      // A lista é conveniência: falhar ao buscá-la não pode quebrar a tela, que
      // continua calculando o cenário normalmente.
    }
  }, []);

  // `void`: a busca é disparada e o resultado chega por setState — não há o que
  // aguardar na montagem. O lint `set-state-in-effect` avisa aqui e no
  // FieldNumber abaixo; é mount-fetch legítimo, e o repo não suprime a regra.
  useEffect(() => {
    void recarregarSalvos();
  }, [recarregarSalvos]);

  async function aoSalvar() {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await salvarOrcamento({
        id: ident.id,
        nome: ident.nome,
        cliente: ident.cliente || null,
        entradas: coletarEntradas(),
        resultado: resumo,
      });
      if (!r.success) {
        setAviso({ tom: 'erro', texto: r.error });
        return;
      }
      setIdent((i) => ({ ...i, id: r.data }));
      setAviso({ tom: 'ok', texto: ident.id ? 'Orçamento atualizado.' : 'Orçamento salvo.' });
      await recarregarSalvos();
    } catch (e: any) {
      setAviso({ tom: 'erro', texto: e?.message || 'Não foi possível salvar o orçamento.' });
    } finally {
      setOcupado(false);
    }
  }

  async function aoCarregar(id: string) {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await carregarOrcamento(id);
      if (!r.success) {
        setAviso({ tom: 'erro', texto: r.error });
        return;
      }
      const entradas = normalizarEntradas(r.data.entradas, LISTAS_VALIDAS);
      if (!entradas) {
        setAviso({ tom: 'erro', texto: 'Este cenário está ilegível no banco — não dá para reabrir.' });
        return;
      }
      aplicarEntradas(entradas);
      setIdent({
        id: r.data.id,
        nome: r.data.nome,
        cliente: r.data.cliente ?? '',
        propostaId: r.data.propostaId ?? null,
      });
      setConvAberta(false);
      setAviso({ tom: 'ok', texto: `“${r.data.nome}” carregado nos campos acima.` });
    } catch (e: any) {
      setAviso({ tom: 'erro', texto: e?.message || 'Não foi possível carregar o orçamento.' });
    } finally {
      setOcupado(false);
    }
  }

  async function aoExcluir(id: string, nome: string) {
    if (ocupado) return;
    if (!window.confirm(`Excluir o orçamento “${nome}”? Não dá para desfazer.`)) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await excluirOrcamento(id);
      if (!r.success) {
        setAviso({ tom: 'erro', texto: r.error });
        return;
      }
      // Excluir o que está aberto desvincula a tela, sem mexer nos números.
      setIdent((i) => (i.id === id ? { id: null, nome: '', cliente: '', propostaId: null } : i));
      setAviso({ tom: 'ok', texto: `“${nome}” excluído.` });
      await recarregarSalvos();
    } catch (e: any) {
      setAviso({ tom: 'erro', texto: e?.message || 'Não foi possível excluir o orçamento.' });
    } finally {
      setOcupado(false);
    }
  }

  /** Desvincula: o próximo "Salvar" cria uma cópia em vez de sobrescrever. */
  function aoSalvarComoNovo() {
    setIdent((i) => ({
      id: null,
      nome: i.nome ? `${i.nome} (cópia)` : '',
      cliente: i.cliente,
      propostaId: null,
    }));
    setConvAberta(false);
    setAviso(null);
  }

  function aoRestaurarPadrao() {
    if (!window.confirm('Voltar todos os campos ao padrão da régua? O que não estiver salvo se perde.')) return;
    aplicarEntradas(entradasPadrao(LISTAS_VALIDAS));
    setIdent({ id: null, nome: '', cliente: '', propostaId: null });
    setConvAberta(false);
    setAviso(null);
  }

  // ── Conversão em proposta (mig 254) ────────────────────────────────────────
  /**
   * Prévia do que vai ser gravado, calculada com a MESMA função pura que o
   * server usa (`calculateProposalFinancials`). Sem isto o admin confirmaria uma
   * conversão sem ver que a vigência da proposta são as parcelas do projeto
   * (2 numa jornada de 7 semanas), não 12 meses.
   */
  const previaProposta = useMemo(() => {
    const vigencia = Math.max(1, calc.parcelas);
    const mensal = Math.round((calc.valorTotalTabela / vigencia) * 100) / 100;
    return {
      vigencia,
      mensal,
      ...calculateProposalFinancials({
        monthly_value: mensal,
        contract_duration_months: vigencia,
        discount_requested: pricing.descontoPct,
      }),
    };
  }, [calc.parcelas, calc.valorTotalTabela, pricing.descontoPct]);

  const CONTATO_LS = 'vertho.orcamento.contatoProposta';

  function aoAbrirConversao() {
    try {
      const salvo = JSON.parse(window.localStorage.getItem(CONTATO_LS) || '{}');
      if (!convContatoNome && typeof salvo.nome === 'string') setConvContatoNome(salvo.nome);
      if (!convContatoEmail && typeof salvo.email === 'string') setConvContatoEmail(salvo.email);
      if (!convContatoWhats && typeof salvo.whats === 'string') setConvContatoWhats(salvo.whats);
    } catch { /* storage bloqueado: os campos só ficam vazios */ }

    const j = JORNADAS.find((x) => x.key === jornada) ?? JORNADAS[0];
    setConvEscopo(escopoPropostaDoCenario(coletarEntradas(), resumo, {
      rotulo: j.rotulo,
      semanas: j.cfg.semanas,
    }));
    setConvPagamento(`${calc.parcelas} parcelas de ${money(calc.mensalidadeFlat)}`);
    setConvAberta(true);
  }

  async function aoConverter() {
    if (!ident.id || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await criarPropostaDeOrcamento({
        orcamentoId: ident.id,
        includedScope: convEscopo,
        paymentTerms: convPagamento || null,
        customerType: convTipoCliente || null,
        productPackage: convPacote || null,
        contatoNome: convContatoNome,
        contatoEmail: convContatoEmail,
        contatoWhatsapp: convContatoWhats,
      });
      if (!r.success || !r.data) {
        setAviso({ tom: 'erro', texto: r.error || 'Não foi possível converter o orçamento.' });
        return;
      }
      try {
        window.localStorage.setItem(CONTATO_LS, JSON.stringify({
          nome: convContatoNome, email: convContatoEmail, whats: convContatoWhats,
        }));
      } catch { /* storage bloqueado: só não lembra na próxima */ }
      setIdent((i) => ({ ...i, propostaId: r.data!.id }));
      setConvAberta(false);
      setAviso({
        tom: 'ok',
        texto: `Proposta ${r.data.numero} criada como rascunho · ${money(r.data.totalContrato)} em ${r.data.vigenciaMeses}×.`,
      });
      await recarregarSalvos();
    } catch (e: any) {
      setAviso({ tom: 'erro', texto: e?.message || 'Não foi possível converter o orçamento.' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 py-6 sm:px-6 min-h-full">
      <BackButton href="/admin-v2/negocios" />
      <header className="mb-7 grid gap-5 border-b border-amber-300/15 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Deal desk · proposta</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
            <Calculator size={24} className="text-amber-300" /> {t('title')}
          </h1>
          <p className="mt-2 max-w-[74ch] text-xs leading-relaxed text-gray-400">{t('subtitle')}</p>
        </div>
        <Link href="/admin/vertho/simulador-custo" className="inline-flex items-center gap-2 border-b border-cyan-300/30 pb-1 text-xs font-semibold text-cyan-300 hover:border-cyan-200 hover:text-cyan-200">
          Ver composição técnica <ArrowRight size={13} />
        </Link>
      </header>

      {/* Orçamentos salvos — retomar uma negociação em vez de refazer o cenário */}
      <div className="mb-5 rounded-sm border border-white/10 bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setListaAberta((v) => !v)}
          aria-expanded={listaAberta}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
            <FolderOpen size={14} /> Orçamentos salvos
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
              {salvos.length}
            </span>
          </span>
          <span className="text-[10px] text-gray-500">{listaAberta ? 'recolher' : 'abrir um cenário'}</span>
        </button>

        {listaAberta && (
          <div className="border-t border-white/10 px-4 py-3">
            {salvos.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                Nada salvo ainda. Dê um nome ao cenário na folha de decisão e salve — o valor, a
                margem e a exposição de caixa ficam congelados com a régua de hoje.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {salvos.map((s) => {
                  const aberto = s.id === ident.id;
                  const r = s.resultado;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-bold ${aberto ? 'text-amber-200' : 'text-white'}`}>
                          {s.nome}
                          {aberto && <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider text-amber-300/80">aberto</span>}
                          {s.propostaId && (
                            <Link
                              href={`/admin/comercial/propostas/${s.propostaId}`}
                              className="ml-2 text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80 hover:text-emerald-200"
                            >
                              → proposta
                            </Link>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-gray-500">
                          {s.cliente ? `${s.cliente} · ` : ''}
                          {r ? `${r.pessoas.toLocaleString(locale)} pessoas · ${r.unidades} un · ${r.cargos} cargos · ${r.parcelas}×` : 'sem resumo'}
                          {s.criadoEm ? ` · ${new Date(s.criadoEm).toLocaleDateString(locale)}` : ''}
                        </p>
                      </div>
                      {r && (
                        <div className="flex shrink-0 gap-4 text-right">
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">Projeto</p>
                            <p className="text-xs font-extrabold tabular-nums text-amber-100">{money(r.valorFinal)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">Parcela</p>
                            <p className="text-xs font-bold tabular-nums text-emerald-200">{money(r.parcela)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">Margem</p>
                            <p className={`text-xs font-bold tabular-nums ${r.margemPct < 0 || r.acimaDoPiso ? 'text-amber-300' : 'text-emerald-300'}`}>
                              {r.margemPct.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => aoCarregar(s.id)}
                          disabled={ocupado || aberto}
                          className="rounded border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 hover:border-amber-300/40 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => aoExcluir(s.id, s.nome)}
                          disabled={ocupado}
                          aria-label={`Excluir ${s.nome}`}
                          className="rounded border border-white/10 p-1.5 text-gray-500 hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {aviso && (
        <p
          role="status"
          className={`mb-5 rounded-sm border px-3 py-2 text-[11px] font-semibold ${
            aviso.tom === 'ok'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-400/40 bg-red-500/10 text-red-200'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0">

      {/* Escopo do orçamento */}
      <div className="rounded-sm border border-amber-300/20 bg-amber-300/[0.035] p-4 mb-5">
        <p className="text-xs uppercase tracking-widest text-amber-300 mb-3">01 · {t('scope.title')}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4">
          <FieldNumber locale={locale} icon={<School size={14} />} label={t('scope.clusters.label')} sub={t('scope.clusters.sub')}
            value={nClusters} onChange={setNClusters} min={1} />
          <FieldNumber locale={locale} icon={<Briefcase size={14} />} label={t('scope.profiles.label')} sub={t('scope.profiles.sub')}
            value={nPerfis} onChange={setCargos} min={1} />
          <FieldNumber locale={locale} icon={<Users size={14} />} label={t('scope.collaborators.label')} sub={t('scope.collaborators.sub')}
            value={nColabs} onChange={setNColabs} min={0} />
          <FieldNumber locale={locale} icon={<Calculator size={14} />} label="Ciclos entregues"
            sub="cada ciclo gera 2 parcelas"
            value={ciclosPorAno} onChange={setCiclosPorAno} min={1} />
          <CalculatedField
            icon={<Calculator size={14} />}
            label="Parcelas"
            value={calc.parcelas.toLocaleString(locale)}
            sub={`${calc.ciclos} ${calc.ciclos === 1 ? 'ciclo' : 'ciclos'} × 2`}
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              <Vote size={14} /> {t('scope.mapping')}
            </label>
            <div className="flex gap-1.5">
              {(['votacao', 'workshop'] as Metodo[]).map((m) => (
                <button key={m} onClick={() => setMetodo(m)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-bold border ${
                    metodo === m ? 'bg-amber-400/15 border-amber-300/50 text-amber-200' : 'border-white/10 text-gray-400 hover:text-white'
                  }`}>
                  {m === 'votacao' ? t('methods.vote') : 'Workshop'}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gray-600 mt-1">
              {metodo === 'votacao' ? t('methods.voteHint') : t('methods.workshopHint')}
            </p>
          </div>
        </div>

        {/* Jornada contratada — decide semanas, competências e o custo por pessoa */}
        <div className="mt-3">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1.5">
            <Route size={12} /> Jornada contratada
          </label>
          <div className="flex gap-2 flex-wrap">
            {JORNADAS.map((j) => (
              <button key={j.key} onClick={() => setJornada(j.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  jornada === j.key ? 'bg-amber-400/15 border-amber-300/50 text-amber-200' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {j.rotulo} <span className="font-normal opacity-70">· {j.sub}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-gray-600 mt-1">
            Move o custo de IA por pessoa (USD {calc.custoPorColab.toFixed(2)}/colab nesta jornada), não o valor de tabela.
          </p>
        </div>

        {/* Matrizes: toda matriz que não nasce nova é adaptada. */}
        <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3">
          <FieldNumber locale={locale} icon={<Briefcase size={14} />} label="Matrizes novas"
            sub={`Preço ${money(pricing.precoMatrizNova)} · custo ${pricing.horasMatrizNova}h`}
            value={matrizNovas} onChange={(v) => setMatrizNovas(Math.min(nPerfis, v))} min={0} />
          <CalculatedField
            icon={<Briefcase size={14} />}
            label="Matrizes adaptadas"
            value={calc.matrizesAdaptadas.toLocaleString(locale)}
            sub={`Preço ${money(pricing.precoMatrizAdaptada)} · custo ${pricing.horasMatrizAdaptada}h`}
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Horas de gente</p>
            <p className="text-lg font-bold text-white tabular-nums">{calc.horasTotais} h</p>
            <p className="text-[9px] text-gray-600">Custo interno · {money(calc.custoHorasBrl)} a {money(pricing.custoHora)}/h</p>
          </div>
        </div>

      </div>

      {/* Tabela de preços */}
      <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 mb-5">
        <p className="text-xs uppercase tracking-widest text-amber-300 mb-1">02 · Régua de preço</p>
        <p className="mb-3 text-[10px] text-gray-500">A mesma tabela alimenta a sugestão automática do formulário de propostas.</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4">
          <FieldNumber locale={locale} label={t('pricing.exchange')} sub={t('pricing.perUsd', { value: money(pricing.cotacao) })} value={pricing.cotacao} onChange={(v) => setPricingField('cotacao', v)} allowDecimals min={0} />
          <FieldNumber locale={locale} label={t('pricing.generalSetup')} sub={t('pricing.fixed', { value: money(pricing.precoSetupGeral) })} value={pricing.precoSetupGeral} onChange={(v) => setPricingField('precoSetupGeral', v)} min={0} />
          <FieldNumber locale={locale} label="Por pessoa / ciclo" sub={`${money(pricing.precoPessoaCiclo)} por pessoa`} value={pricing.precoPessoaCiclo} onChange={(v) => setPricingField('precoPessoaCiclo', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.perCluster')} sub={t('pricing.setupValue', { value: money(pricing.precoCluster) })} value={pricing.precoCluster} onChange={(v) => setPricingField('precoCluster', v)} min={0} />
          <FieldNumber locale={locale} label="Preço / matriz nova" sub={`${money(pricing.precoMatrizNova)} cobrado por matriz`} value={pricing.precoMatrizNova} onChange={(v) => setPricingField('precoMatrizNova', v)} min={0} />
          <FieldNumber locale={locale} label="Preço / matriz adaptada" sub={`${money(pricing.precoMatrizAdaptada)} cobrado por matriz`} value={pricing.precoMatrizAdaptada} onChange={(v) => setPricingField('precoMatrizAdaptada', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.workshopPerCluster')} sub={t('pricing.ifWorkshop', { value: money(pricing.adicionalWorkshop) })} value={pricing.adicionalWorkshop} onChange={(v) => setPricingField('adicionalWorkshop', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.discount')} sub={`piso: ${calc.descontoMaxPct.toFixed(1)}%`} value={pricing.descontoPct} onChange={(v) => setPricingField('descontoPct', v)} min={0} allowDecimals />
          <FieldNumber locale={locale} label="Margem-alvo (%)" sub="define o desconto máximo" value={pricing.margemAlvoPct} onChange={(v) => setPricingField('margemAlvoPct', v)} min={0} allowDecimals />
          <FieldNumber locale={locale} label="Impostos (%)" sub={pricing.impostosPct === 0 ? 'confirmar antes da proposta' : 'sobre a receita final'} value={pricing.impostosPct} onChange={(v) => setPricingField('impostosPct', v)} min={0} allowDecimals />
          <FieldNumber locale={locale} label="Contingência (%)" sub="sobre o custo operacional" value={pricing.contingenciaPct} onChange={(v) => setPricingField('contingenciaPct', v)} min={0} allowDecimals />
        </div>
      </div>

      {/* Custo de entrega — as linhas que faltavam para a margem significar algo */}
      <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 mb-5">
        <p className="text-xs uppercase tracking-widest text-amber-300 mb-1">03 · Custo de entrega</p>
        <p className="text-[10px] text-gray-500 mb-3">
          As horas são custo interno: entram no custo all-in e reduzem a margem, mas não são somadas
          novamente ao preço das matrizes. O valor cobrado ao cliente fica na régua acima.
        </p>
        <details className="mb-3 border-y border-white/[0.07] py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-gray-300">
            Cenário de modelos IA <span className="ml-2 font-normal text-amber-300">{presetLabel}</span>
          </summary>
          <p className="mt-2 text-[10px] leading-relaxed text-gray-500">O orçamento usa a configuração que está em produção. As alternativas abaixo servem apenas para análise de sensibilidade.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESET_KEYS.map((k) => (
              <button key={k} onClick={() => setPreset(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  preset === k ? 'bg-amber-400/15 border-amber-300/50 text-amber-200' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {k === 'atual' ? 'Atual' : PRESETS[k].label}
              </button>
            ))}
          </div>
        </details>
        <div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200">Comissão comercial</p>
              <p className="mt-0.5 text-[9px] text-gray-500">Escolha um canal por proposta · percentual sobre a receita final</p>
            </div>
            <p className="text-xs font-bold text-amber-100">{calc.comissaoLabel} · {calc.comissaoPct.toFixed(0)}%</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de comissão comercial">
            {OPCOES_COMISSAO_ORCAMENTO.map((opcao) => {
              const selecionada = tipoComissao === opcao.key;
              return (
                <button
                  key={opcao.key}
                  type="button"
                  role="radio"
                  aria-checked={selecionada}
                  onClick={() => setTipoComissao(opcao.key)}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${
                    selecionada
                      ? 'border-amber-300/55 bg-amber-300/10 text-amber-100'
                      : 'border-white/10 bg-black/10 text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <span className="text-[11px] font-semibold leading-tight">{opcao.label}</span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums">{opcao.percentual}%</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4">
          <FieldNumber locale={locale} label="Custo / hora" sub="aplicado às horas internas" value={pricing.custoHora} onChange={(v) => setPricingField('custoHora', v)} min={0} />
          <FieldNumber locale={locale} label="Horas de implantação" sub="custo interno, fora as matrizes" value={pricing.horasImplantacao} onChange={(v) => setPricingField('horasImplantacao', v)} min={0} />
          <FieldNumber locale={locale} label="Horas / matriz nova" sub={`custo interno · adaptada: ${pricing.horasMatrizAdaptada}h`} value={pricing.horasMatrizNova} onChange={(v) => setPricingField('horasMatrizNova', v)} min={0} />
          <FieldNumber locale={locale} label="Horas / workshop" sub="por unidade" value={pricing.horasWorkshop} onChange={(v) => setPricingField('horasWorkshop', v)} min={0} />
          <FieldNumber locale={locale} label="Mensagens / pessoa / ciclo" sub={`${moneyBRLUnit(pricing.custoMsgUnitario, locale)} cada · UTILITY`} value={pricing.msgsPorPessoaCiclo} onChange={(v) => setPricingField('msgsPorPessoaCiclo', v)} min={0} />
          <FieldNumber locale={locale} label="Clientes ativos" sub="rateio da infra fixa" value={pricing.clientesAtivos} onChange={(v) => setPricingField('clientesAtivos', v)} min={1} />
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">IA</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoIABrl)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">Horas · {calc.horasTotais}h</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoHorasBrl)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">Mensagens</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoMsgBrl)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">Infra · {calc.mesesPrograma} {calc.mesesPrograma === 1 ? 'mês' : 'meses'}</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoInfraBrl)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">Comissão · {calc.comissaoPct.toFixed(0)}%</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoComissoesBrl)}</p>
            <p className="text-[9px] text-gray-600">{calc.comissaoLabel}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">Impostos · {pricing.impostosPct}%</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoImpostosBrl)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] uppercase text-gray-500">Contingência · {pricing.contingenciaPct}%</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoContingenciaBrl)}</p>
          </div>
        </div>
        {pricing.impostosPct === 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-amber-300"><ShieldCheck size={12} /> Impostos ainda estão zerados; confirme a alíquota antes de transformar o cenário em proposta.</p>
        )}
        <p className="text-[10px] text-amber-300/80 mt-2">
          ⚠ A conta usa {moneyBRLUnit(pricing.custoMsgUnitario, locale)} por mensagem UTILITY. Se a Meta reclassificar
          como MARKETING, o cenário de segurança continua sendo 6×: {money(calc.custoMsgBrl * 6)}.
        </p>
      </div>

      {/* Geração de conteúdo (por colaborador + reúso) */}
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-purple-300 mb-1 flex items-center gap-1.5">
          <Film size={14} /> {t('content.title')}
        </p>
        <p className="text-[10px] text-gray-500 mb-3">{t('content.hint')}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <FieldNumber locale={locale} icon={<Clapperboard size={14} />} label={t('content.video')} value={conteudoColab.video} onChange={(v) => setConteudo('video', v)} min={0} />
          <FieldNumber locale={locale} icon={<Headphones size={14} />} label={t('content.podcast')} value={conteudoColab.podcast} onChange={(v) => setConteudo('podcast', v)} min={0} />
          <FieldNumber locale={locale} icon={<FileText size={14} />} label={t('content.text')} value={conteudoColab.texto} onChange={(v) => setConteudo('texto', v)} min={0} />
          <FieldNumber locale={locale} icon={<BookOpen size={14} />} label={t('content.case')} value={conteudoColab.case} onChange={(v) => setConteudo('case', v)} min={0} />
          <CalculatedField
            icon={<Users size={14} />}
            label={t('content.reuse')}
            value={reusoConteudo.toLocaleString(locale, { maximumFractionDigits: 1 })}
            sub={t('content.reuseHint')}
          />
          <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-1 min-h-[28px] text-[10px] uppercase tracking-widest text-gray-500">Avatar do vídeo</p>
            <button
              type="button"
              onClick={() => setComAvatar((v) => !v)}
              className={`rounded border px-2 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/70 ${comAvatar ? 'border-purple-400/50 bg-purple-500/20 text-purple-200' : 'border-white/10 text-gray-400'}`}
            >
              {comAvatar ? 'Com avatar' : 'Sem avatar'}
            </button>
            <p className="mt-1 text-[9px] text-gray-600">USD {calc.custoVideoGeradoPorVideo.toFixed(2)} / vídeo</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <span className="font-semibold text-purple-100">{calc.totalPecasPorColab.toLocaleString(locale)} peças / colab / ciclo</span>
          <span className="text-purple-300 font-semibold">{t('content.perColab')}: USD {calc.custoConteudoPorColab.toFixed(2)}</span>
          <span className="text-purple-200 font-semibold">{t('content.total')}: USD {calc.custoConteudoTotal.toFixed(2)}</span>
          <span className="font-semibold text-purple-200">{t('content.contractTotal')}: USD {calc.custoConteudoTotalAno.toFixed(2)}</span>
        </div>
      </div>

      {/* Extração de vídeo → Módulo-Base (one-time, matéria-prima reusada) */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-amber-300 mb-1 flex items-center gap-1.5">
          <Film size={14} /> Extração de vídeo → Módulo-Base
        </p>
        <p className="text-[10px] text-gray-500 mb-3">
          Vídeos da empresa/web viram matéria-prima canônica (módulos-base), reusada entre colaboradores e ciclos. Custo one-time por vídeo: áudio→texto (Gemini) + detecção + estruturação dos 4 blocos (Sonnet). ~70% do custo é fixo por vídeo, independe da duração.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <FieldNumber locale={locale} icon={<Film size={14} />} label="Vídeos a extrair" value={nVideosExtraidos} onChange={setNVideosExtraidos} min={0} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Auditoria Dual-IA</label>
            <button onClick={() => setAuditarExtracao((v) => !v)}
              className={`mt-1 px-2 py-1.5 rounded text-xs font-bold border ${auditarExtracao ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' : 'border-white/10 text-gray-400'}`}>
              {auditarExtracao ? 'Incluída (GPT-5.4)' : 'Sem auditoria'}
            </button>
            <p className="text-[9px] text-gray-600 mt-0.5">só ao submeter à revisão</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <span className="text-amber-300 font-semibold">Por vídeo (~10 min): USD {calc.custoExtracaoPorVideo.toFixed(2)}</span>
          <span className="text-amber-200 font-semibold">Total ({nVideosExtraidos.toLocaleString(locale)} vídeos): USD {calc.custoExtracaoTotal.toFixed(2)}</span>
        </div>
      </div>

        </main>

        {/* Folha de decisão sempre visível: preço, margem e risco de caixa. */}
        <aside className="xl:sticky xl:top-6">
      <div className="rounded-sm border border-amber-300/30 bg-[#17150e] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)]">
        <div className="mb-4 border-b border-amber-300/15 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Folha de decisão</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">Escopo → preço → margem → aprovação</p>
        </div>
        <div className="grid gap-3">
          <div className="border-l-2 border-amber-300 bg-white/[0.035] p-4">
            <p className="text-[10px] uppercase tracking-widest text-amber-300">Valor do projeto</p>
            <p className="text-3xl font-extrabold text-amber-100 mt-1">{money(calc.valorTotalFinal)}</p>
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              <div className="flex justify-between"><span>{t('financial.oneTime')}</span><span>{money(calc.oneTimeTabela)}</span></div>
              <div className="flex justify-between"><span>Programa · {calc.ciclos} {calc.ciclos === 1 ? 'ciclo' : 'ciclos'}</span><span>{money(calc.tabelaPrograma)}</span></div>
              {calc.descontoTotal > 0 && (
                <div className="flex justify-between text-amber-300"><span>{t('financial.discountPct', { value: pricing.descontoPct.toLocaleString(locale) })}</span><span>- {money(calc.descontoTotal)}</span></div>
              )}
              <div className="mt-3 grid grid-cols-2 border-t border-amber-300/15 pt-3">
                <div className="pr-3">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-300">Investimento / pessoa</p>
                  <p className="mt-0.5 text-sm font-extrabold text-amber-100 tabular-nums">{money(calc.investimentoPorPessoaBrl)}</p>
                  <p className="text-[9px] leading-relaxed text-gray-500">
                    <span className="tabular-nums">{money(calc.investimentoPorPessoaCicloBrl)}</span> / ciclo · inclui setup rateado
                  </p>
                </div>
                <div className="border-l border-white/10 pl-3">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Custo interno / pessoa</p>
                  <p className="mt-0.5 text-sm font-extrabold text-white tabular-nums">{money(calc.custoPorPessoaBrl)}</p>
                  <p className="text-[9px] text-gray-500"><span className="tabular-nums">{money(calc.custoPorPessoaCicloBrl)}</span> / ciclo</p>
                </div>
              </div>
            </div>
          </div>
          <div className="border-l-2 border-emerald-400 bg-white/[0.035] p-4">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300">Parcela · {calc.parcelas}×</p>
            <p className="text-3xl font-extrabold text-emerald-200 mt-1">{money(calc.mensalidadeFlat)}<span className="text-base text-gray-400 font-normal"> {t('financial.perMonth')}</span></p>
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              <div className="flex justify-between"><span>{money(calc.valorTotalFinal)} ÷ {calc.parcelas}</span><span>—</span></div>
              <div className="flex justify-between text-gray-500"><span>o prazo divide, não multiplica</span><span>—</span></div>
            </div>
          </div>
        </div>

        {/* Sub-stats */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <KpiBox label="Custo all-in" value={money(calc.custoTotalBrl)} sub={`operação ${money(calc.custoOperacionalBrl)}`} tone="gray" />
          <KpiBox label={t('kpis.marginValue')} value={money(calc.margemAbs)} tone={calc.margemPct < pricing.margemAlvoPct ? 'amber' : 'emerald'} />
          <KpiBox label={t('kpis.marginPct')} value={`${calc.margemPct.toFixed(1)}%`} sub={`alvo ${pricing.margemAlvoPct}%`} tone={calc.margemPct < pricing.margemAlvoPct ? 'amber' : 'emerald'} />
          <KpiBox label="Exposição máxima" value={money(calc.piorSaldo?.saldo ?? 0)} sub={`mês ${calc.piorSaldo?.mes ?? 1}`} tone={(calc.piorSaldo?.saldo ?? 0) < 0 ? 'amber' : 'emerald'} />
        </div>

        {/* Trava de desconto: o piso vem da margem-alvo, e barra antes de virar proposta */}
        <div className={`mt-4 rounded-xl border p-3 ${calc.acimaDoPiso ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className={`text-xs font-bold ${calc.acimaDoPiso ? 'text-red-300' : 'text-gray-300'}`}>
              {calc.acimaDoPiso
                ? `Desconto de ${pricing.descontoPct}% acima do piso — requer aprovação`
                : `Desconto disponível até ${calc.descontoMaxPct.toFixed(1)}%`}
            </p>
            <p className="text-[11px] text-gray-500">
              mantendo {pricing.margemAlvoPct}% de margem sobre o custo cheio
            </p>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full ${calc.acimaDoPiso ? 'bg-red-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, calc.descontoMaxPct > 0 ? (pricing.descontoPct / calc.descontoMaxPct) * 100 : 100)}%` }}
            />
          </div>
        </div>

        {/* Exposição por parcela — o fundo do poço é o risco de rescisão no meio */}
        {calc.exposicao.length > 1 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Caixa acumulado por parcela · recebido − entregue
            </p>
            <div className="flex items-end gap-1 h-16">
              {calc.exposicao.map((e) => {
                const maxAbs = Math.max(...calc.exposicao.map((x) => Math.abs(x.saldo)), 1);
                const alt = Math.max(4, (Math.abs(e.saldo) / maxAbs) * 100);
                return (
                  <div key={e.mes} className="flex-1 flex flex-col justify-end h-full" title={`Mês ${e.mes}: ${money(e.saldo)}`}>
                    <div className={`rounded-t ${e.saldo < 0 ? 'bg-red-400/60' : 'bg-emerald-400/50'}`} style={{ height: `${alt}%` }} />
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Implantação entregue no início, recebida ao longo das {calc.parcelas} parcelas.
              Pior mês: {money(calc.piorSaldo?.saldo ?? 0)}.
            </p>
          </div>
        )}
        {/* Salvar o cenário — congela a decisão com a régua deste dia */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Salvar orçamento</p>
          <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
            Grava os campos e congela esta folha de decisão. Reabrir o cenário recalcula com a régua
            vigente; o número salvo continua sendo o do dia.
          </p>
          <div className="mt-3 grid gap-2">
            <div>
              <label htmlFor="orc-nome" className="mb-1 block text-[9px] uppercase tracking-widest text-gray-500">
                Nome do cenário
              </label>
              <input
                id="orc-nome"
                type="text"
                value={ident.nome}
                maxLength={120}
                placeholder="ex.: Rede X · 3.000 pessoas · 6 ciclos"
                onChange={(e) => setIdent((i) => ({ ...i, nome: e.target.value }))}
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-300"
              />
            </div>
            <div>
              <label htmlFor="orc-cliente" className="mb-1 block text-[9px] uppercase tracking-widest text-gray-500">
                Cliente <span className="normal-case text-gray-600">(opcional)</span>
              </label>
              <input
                id="orc-cliente"
                type="text"
                value={ident.cliente}
                maxLength={120}
                placeholder="texto livre — não precisa estar no CRM"
                onChange={(e) => setIdent((i) => ({ ...i, cliente: e.target.value }))}
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-300"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={aoSalvar}
              disabled={ocupado || !ident.nome.trim()}
              className="inline-flex items-center justify-between gap-2 bg-amber-300 px-3 py-2.5 text-xs font-bold text-[#17150e] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ocupado ? 'Salvando…' : ident.id ? 'Atualizar orçamento' : 'Salvar orçamento'}
              <Save size={13} />
            </button>
            {ident.id && (
              <button
                type="button"
                onClick={aoSalvarComoNovo}
                disabled={ocupado}
                className="inline-flex items-center justify-between gap-2 border border-white/10 px-3 py-2 text-[11px] font-semibold text-gray-300 hover:border-amber-300/40 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Salvar como novo <Copy size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={aoRestaurarPadrao}
              disabled={ocupado}
              className="inline-flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-semibold text-gray-500 hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Restaurar padrão da régua
            </button>
          </div>
        </div>

        {/* Converter em proposta — só existe para cenário já salvo */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Virar proposta</p>
          {ident.propostaId ? (
            <>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                Este cenário já gerou uma proposta. Converter de novo é bloqueado no server.
              </p>
              <Link
                href={`/admin/comercial/propostas/${ident.propostaId}`}
                className="mt-3 inline-flex items-center justify-between gap-2 border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
              >
                Abrir proposta <ArrowRight size={13} />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                Cria uma proposta <strong className="font-semibold text-gray-400">sem RC</strong>, em
                nome da Vertho, com os números congelados deste cenário. Sem RC não há comissão.
              </p>
              <button
                type="button"
                onClick={aoAbrirConversao}
                disabled={ocupado || !ident.id}
                title={ident.id ? undefined : 'Salve o orçamento antes de converter'}
                className="mt-3 inline-flex w-full items-center justify-between gap-2 border border-white/10 px-3 py-2.5 text-xs font-semibold text-gray-300 hover:border-amber-300/40 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ident.id ? 'Converter em proposta' : 'Salvar para poder converter'} <Send size={13} />
              </button>
            </>
          )}

          {convAberta && ident.id && (
            <div className="mt-3 rounded-sm border border-amber-300/25 bg-amber-300/[0.04] p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                Conferir antes de criar
              </p>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Vigência (= parcelas do projeto)</dt>
                  <dd className="font-bold tabular-nums text-white">{previaProposta.vigencia}×</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Valor mensal de tabela</dt>
                  <dd className="font-bold tabular-nums text-white">{money(previaProposta.mensal)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Bruto · desconto {pricing.descontoPct}%</dt>
                  <dd className="tabular-nums text-gray-400">
                    {money(previaProposta.contract_value_gross)} − {money(previaProposta.discount_amount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-amber-300/15 pt-1">
                  <dt className="font-semibold text-amber-200">Total do contrato</dt>
                  <dd className="font-extrabold tabular-nums text-amber-100">
                    {money(previaProposta.total_contract_value)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[9px] leading-relaxed text-amber-300/70">
                O total tem de bater com o valor do projeto acima. A vigência são as parcelas da
                entrega ({calc.ciclos} {calc.ciclos === 1 ? 'ciclo' : 'ciclos'} × 2), não 12 meses.
              </p>

              <label htmlFor="conv-escopo" className="mt-3 mb-1 block text-[9px] uppercase tracking-widest text-gray-500">
                Escopo incluído — o cliente lê isto
              </label>
              <textarea
                id="conv-escopo"
                rows={9}
                value={convEscopo}
                onChange={(e) => setConvEscopo(e.target.value)}
                className="w-full resize-y rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] leading-relaxed text-white outline-none focus:border-amber-300"
              />
              <p className="mt-1 text-[9px] text-gray-600">
                Pré-preenchido a partir do cenário. Revise: uma linha vira um item da proposta.
              </p>

              <label htmlFor="conv-pagamento" className="mt-3 mb-1 block text-[9px] uppercase tracking-widest text-gray-500">
                Condições de pagamento
              </label>
              <input
                id="conv-pagamento"
                type="text"
                value={convPagamento}
                onChange={(e) => setConvPagamento(e.target.value)}
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white outline-none focus:border-amber-300"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="conv-tipo" className="mb-1 block text-[9px] uppercase tracking-widest text-gray-500">
                    Tipo de cliente
                  </label>
                  <select
                    id="conv-tipo"
                    value={convTipoCliente}
                    onChange={(e) => setConvTipoCliente(e.target.value)}
                    className="w-full rounded border border-white/10 bg-[#17150e] px-2 py-1.5 text-[11px] text-white outline-none focus:border-amber-300"
                  >
                    <option value="">—</option>
                    {CUSTOMER_TYPES.map((c) => (
                      <option key={c} value={c}>{CUSTOMER_TYPE_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="conv-pacote" className="mb-1 block text-[9px] uppercase tracking-widest text-gray-500">
                    Pacote
                  </label>
                  <select
                    id="conv-pacote"
                    value={convPacote}
                    onChange={(e) => setConvPacote(e.target.value)}
                    className="w-full rounded border border-white/10 bg-[#17150e] px-2 py-1.5 text-[11px] text-white outline-none focus:border-amber-300"
                  >
                    <option value="">—</option>
                    {PRODUCT_PACKAGES.map((p) => (
                      <option key={p} value={p}>{PRODUCT_PACKAGE_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 border-t border-amber-300/15 pt-3">
                <p className="text-[9px] uppercase tracking-widest text-gray-500">
                  Contato que assina a proposta — o cliente vê e responde aqui
                </p>
                <input
                  id="conv-contato-nome"
                  type="text"
                  value={convContatoNome}
                  onChange={(e) => setConvContatoNome(e.target.value)}
                  placeholder="Nome de quem assina"
                  aria-label="Nome do contato na Vertho"
                  className="mt-1.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-gray-600 focus:border-amber-300"
                />
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <input
                    id="conv-contato-email"
                    type="email"
                    value={convContatoEmail}
                    onChange={(e) => setConvContatoEmail(e.target.value)}
                    placeholder="e-mail"
                    aria-label="E-mail do contato na Vertho"
                    className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-gray-600 focus:border-amber-300"
                  />
                  <input
                    id="conv-contato-whats"
                    type="tel"
                    value={convContatoWhats}
                    onChange={(e) => setConvContatoWhats(e.target.value)}
                    placeholder="WhatsApp (11 91180-7809)"
                    aria-label="WhatsApp do contato na Vertho"
                    className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-gray-600 focus:border-amber-300"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={aoConverter}
                  disabled={ocupado || !convEscopo.trim() || !convContatoNome.trim() || !convContatoEmail.trim() || !convContatoWhats.trim()}
                  className="inline-flex items-center justify-center gap-1.5 bg-amber-300 px-3 py-2 text-[11px] font-bold text-[#17150e] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ocupado ? 'Criando…' : 'Criar proposta'} <Send size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setConvAberta(false)}
                  disabled={ocupado}
                  className="inline-flex items-center justify-center border border-white/10 px-3 py-2 text-[11px] font-semibold text-gray-400 hover:text-white disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-2 border-t border-white/10 pt-4">
          <Link href="/admin/comercial/propostas" className="inline-flex items-center justify-between bg-amber-300 px-3 py-2.5 text-xs font-bold text-[#17150e] hover:bg-amber-200">
            Ir para propostas <ArrowRight size={13} />
          </Link>
          <Link href="/admin/vertho/simulador-custo" className="inline-flex items-center justify-between border border-white/10 px-3 py-2.5 text-xs font-semibold text-gray-300 hover:border-cyan-300/40 hover:text-cyan-200">
            Auditar custo técnico <ArrowRight size={13} />
          </Link>
        </div>
      </div>
        </aside>
      </div>

      {/* Detalhamento */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Tabela */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-xs uppercase tracking-widest text-cyan-300 mb-3 flex items-center gap-1.5">
            <Building2 size={14} /> {t('breakdown.tableValue')}
          </h3>
          <div className="space-y-1.5 text-sm">
            <p className="text-[10px] uppercase text-gray-500 mb-1">{t('breakdown.oneTime')}</p>
            <Row label={t('breakdown.generalSetup')} value={money(calc.tabelaSetupGeral)} />
            <Row label={t('breakdown.clusterLine', { count: nClusters, value: money(pricing.precoCluster) })} value={money(calc.tabelaClusters)} />
            {calc.matrizesNovas > 0 && (
              <Row label={`Matrizes novas: ${calc.matrizesNovas} × ${money(pricing.precoMatrizNova)}`} value={money(calc.matrizesNovas * pricing.precoMatrizNova)} />
            )}
            {calc.matrizesAdaptadas > 0 && (
              <Row label={`Matrizes adaptadas: ${calc.matrizesAdaptadas} × ${money(pricing.precoMatrizAdaptada)}`} value={money(calc.matrizesAdaptadas * pricing.precoMatrizAdaptada)} />
            )}
            {metodo === 'workshop' && (
              <Row label={`Workshop: ${nClusters} × ${money(pricing.adicionalWorkshop)}`} value={money(calc.tabelaWorkshop)} />
            )}
            <div className="pt-1.5 border-t border-white/5">
              <Row label={t('breakdown.oneTimeSubtotal')} value={money(calc.oneTimeTabela)} bold />
            </div>

            <p className="text-[10px] uppercase text-gray-500 mb-1 mt-3">Programa</p>
            <Row label={`${nColabs.toLocaleString(locale)} pessoas × ${money(pricing.precoPessoaCiclo)} / ciclo`} value={money(calc.tabelaPessoasCiclo)} />
            <Row label={`× ${calc.ciclos} ${calc.ciclos === 1 ? 'ciclo' : 'ciclos'} de ${cfgJornada.semanas} semanas`} value={money(calc.tabelaPrograma)} />

            <div className="pt-1.5 border-t border-white/5 mt-2">
              <Row label="Valor do projeto (tabela)" value={money(calc.valorTotalTabela)} bold />
            </div>
            {calc.descontoTotal > 0 && <Row label={t('financial.discountPct', { value: pricing.descontoPct.toLocaleString(locale) })} value={`- ${money(calc.descontoTotal)}`} muted />}
            <Row label={t('breakdown.projectTotalFinal')} value={money(calc.valorTotalFinal)} bold tone="emerald" />
            <div className="pt-1.5 border-t border-white/5 mt-2">
              <Row label={`Parcela · ${calc.parcelas}×`} value={`${money(calc.mensalidadeFlat)} ${t('financial.perMonth')}`} bold tone="emerald" />
            </div>
          </div>
        </div>

        {/* Custo IA */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-xs uppercase tracking-widest text-amber-300 mb-3 flex items-center gap-1.5">
            <Calculator size={14} /> {t('breakdown.aiCost')}
          </h3>
          <p className="text-[10px] text-gray-500">Modelos: {presetLabel}</p>
          <p className="text-[10px] text-amber-300/70 mb-2">
            {t('ai.basis', { cycles: calc.ciclos, weeks: cfgJornada.semanas, installments: calc.parcelas })}
          </p>
          <div className="space-y-1.5 text-sm">
            <Row label={`${t('ai.setupLine', { clusters: nClusters, profiles: nPerfis, method: metodo })} ${t('ai.oneTimeTag')}`} value={`USD ${(nClusters * calc.custoSetupPorCluster).toFixed(2)}`} />
            <Row label={`${t('ai.tagging')} ${t('ai.oneTimeTag')}`} value={`USD ${calc.custoTaggingTotal.toFixed(2)}`} />
            <Row label={`${t('ai.mentorLine', { count: nColabs, value: calc.custoPorColab.toFixed(2) })}${calc.ciclos > 1 ? ` × ${calc.ciclos}` : ''}`} value={`USD ${calc.custoColabsTotalAno.toFixed(2)}`} />
            {calc.custoConteudoTotalAno > 0 && (
              <Row label={`${t('content.title')} · ${calc.totalPecasPorColab}/colab/ciclo${calc.ciclos > 1 ? ` × ${calc.ciclos}` : ''}`} value={`USD ${calc.custoConteudoTotalAno.toFixed(2)}`} />
            )}
            {calc.custoExtracaoTotal > 0 && (
              <Row label={`Extração de vídeo: ${nVideosExtraidos.toLocaleString(locale)} vídeo(s) ${t('ai.oneTimeTag')}`} value={`USD ${calc.custoExtracaoTotal.toFixed(2)}`} />
            )}
            <div className="pt-1.5 border-t border-white/5">
              <Row label={t('ai.totalUsd')} value={`USD ${calc.custoIAUsd.toFixed(2)}`} bold />
            </div>
            <Row label={t('ai.exchangeLine', { value: pricing.cotacao })} value={money(calc.custoIABrl)} bold tone="amber" />
          </div>
        </div>
      </div>

      {/* Notas */}
      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-gray-300 space-y-2">
        <p className="font-bold text-amber-300">{t('notes.title')}</p>
        <ul className="list-disc pl-5 space-y-1">
          {t.raw('notes.items').map((item: string, index: number) => <li key={index}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────

function CalculatedField({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-cyan-300/15 bg-cyan-300/[0.025] p-3">
      <div className="mb-1 flex min-h-[28px] items-start justify-between gap-2 text-[10px] uppercase leading-tight tracking-widest text-gray-500">
        <p className="flex items-start gap-1.5">
          {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
          <span>{label}</span>
        </p>
        <span className="shrink-0 rounded-sm border border-cyan-300/20 px-1 py-0.5 text-[8px] font-bold tracking-wider text-cyan-300/80">auto</span>
      </div>
      <output className="block w-full rounded border border-dashed border-cyan-300/20 bg-cyan-300/[0.035] px-2 py-1.5 text-sm font-semibold tabular-nums text-cyan-100">
        {value}
      </output>
      {sub && <p className="mt-0.5 min-h-[12px] text-[9px] text-gray-600">{sub}</p>}
    </div>
  );
}

function FieldNumber({
  icon, label, sub, value, onChange, min = 0, allowDecimals = false,
  locale,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  allowDecimals?: boolean;
  locale: string;
}) {
  const fmt = (n: number) =>
    n.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: allowDecimals ? 2 : 0,
    });

  function parseBR(s: string): number {
    // pt-BR: pontos = milhares, vírgula = decimal
    const cleaned = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const filtered = cleaned.replace(/[^\d.-]/g, '');
    const n = parseFloat(filtered);
    return isNaN(n) ? 0 : n;
  }

  const [text, setText] = useState(() => fmt(value));

  // Sincroniza quando value externo muda (ex: reset programático)
  useEffect(() => {
    if (parseBR(text) !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col">
      <label className="flex items-start gap-1.5 text-[10px] leading-tight uppercase tracking-widest text-gray-500 mb-1 min-h-[28px]">
        {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
        <span>{label}</span>
      </label>
      <input
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseBR(e.target.value);
          if (n >= min) onChange(n);
        }}
        onBlur={() => {
          const n = Math.max(min, parseBR(text));
          onChange(n);
          setText(fmt(n));
        }}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
      />
      {sub && <p className="text-[9px] text-gray-600 mt-0.5 min-h-[12px]">{sub}</p>}
    </div>
  );
}

function KpiBox({ label, value, sub, tone = 'white', big = false }: { label: string; value: string; sub?: string; tone?: 'white' | 'emerald' | 'amber' | 'gray'; big?: boolean }) {
  const toneColor = {
    white: 'text-white',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    gray: 'text-gray-300',
  }[tone];
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`${big ? 'text-3xl' : 'text-xl'} font-extrabold ${toneColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, value, bold = false, muted = false, tone }: { label: string; value: string; bold?: boolean; muted?: boolean; tone?: 'emerald' | 'amber' }) {
  const toneColor = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-white';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${muted ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${muted ? 'text-gray-500' : toneColor} text-sm tabular-nums`}>{value}</span>
    </div>
  );
}
