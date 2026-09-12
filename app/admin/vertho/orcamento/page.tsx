'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight, BookOpen, Calculator, School, Users, Briefcase, Vote, Building2, Film, FileText, Headphones, Clapperboard, Route, ShieldCheck } from 'lucide-react';
import BackButton from '@/components/back-button';
import { CALLS, PRESETS, calcCost, custoColabNaJornada, infraFixaTotal } from '@/lib/ia-cost-catalog';
import {
  ORCAMENTO_DEFAULTS,
  CONTEUDO_POR_FORMATO_DEFAULT,
  calcularProjeto,
  custoConteudoComReuso,
  distribuirMatrizes,
  parcelasPorCiclos,
  reusoConteudoPorCelula,
} from '@/lib/orcamento/precificacao';
import { COMMISSION_RATES } from '@/lib/sales/constants';
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
    const comissaoRate = COMMISSION_RATES.acquisition + COMMISSION_RATES.recurring;
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
      comissaoPct: comissaoRate * 100,
      custoTotalBrl,
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
  }, [nClusters, nPerfis, metodo, nColabs, ciclosPorAno, matrizNovas, preset, cfgJornada, pricing, conteudoColab, nVideosExtraidos, auditarExtracao, comAvatar, reusoConteudo]);

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
            sub={`R$ ${pricing.precoMatrizNova} · ${pricing.horasMatrizNova}h cada`}
            value={matrizNovas} onChange={(v) => setMatrizNovas(Math.min(nPerfis, v))} min={0} />
          <CalculatedField
            icon={<Briefcase size={14} />}
            label="Matrizes adaptadas"
            value={calc.matrizesAdaptadas.toLocaleString(locale)}
            sub={`R$ ${pricing.precoMatrizAdaptada} · ${pricing.horasMatrizAdaptada}h cada`}
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Horas de gente</p>
            <p className="text-lg font-bold text-white tabular-nums">{calc.horasTotais} h</p>
            <p className="text-[9px] text-gray-600">{money(calc.custoHorasBrl)} a {money(pricing.custoHora)}/h</p>
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
          <FieldNumber locale={locale} label="Matriz nova" sub={`${money(pricing.precoMatrizNova)} cada`} value={pricing.precoMatrizNova} onChange={(v) => setPricingField('precoMatrizNova', v)} min={0} />
          <FieldNumber locale={locale} label="Matriz adaptada" sub={`${money(pricing.precoMatrizAdaptada)} cada`} value={pricing.precoMatrizAdaptada} onChange={(v) => setPricingField('precoMatrizAdaptada', v)} min={0} />
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
          Até 07/09/2026 a margem olhava só a IA e respondia 96–99% em qualquer cenário. Estas são as
          linhas que faltavam — o workshop, em especial, tinha preço e nenhum custo.
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
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4">
          <FieldNumber locale={locale} label="Custo / hora" sub="implantação e workshop" value={pricing.custoHora} onChange={(v) => setPricingField('custoHora', v)} min={0} />
          <FieldNumber locale={locale} label="Horas de implantação" sub="base, fora as matrizes" value={pricing.horasImplantacao} onChange={(v) => setPricingField('horasImplantacao', v)} min={0} />
          <FieldNumber locale={locale} label="Horas / matriz nova" sub={`${pricing.horasMatrizAdaptada}h se adaptada`} value={pricing.horasMatrizNova} onChange={(v) => setPricingField('horasMatrizNova', v)} min={0} />
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
            <p className="text-[9px] uppercase text-gray-500">Comissões · {calc.comissaoPct.toFixed(0)}%</p>
            <p className="text-sm font-bold text-white tabular-nums">{money(calc.custoComissoesBrl)}</p>
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
