'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calculator, School, Users, Briefcase, Vote, Building2, Film, FileText, Headphones, Clapperboard, Route } from 'lucide-react';
import BackButton from '@/components/back-button';
import { CALLS, PRESETS, calcCost, custoColabNaJornada, infraFixaTotal } from '@/lib/ia-cost-catalog';
import { calcularProjeto } from '@/lib/orcamento/precificacao';
import {
  PROGRAMA_JORNADA, PROGRAMA_REGULAR_DUO, PROGRAMA_REGULAR,
  PROGRAMA_ONBOARDING, PROGRAMA_PILOTO,
} from '@/lib/season-engine/programa-config';

type Metodo = 'votacao' | 'workshop';
type PresetKey = 'premium' | 'balanced' | 'cheap';

const PRESET_KEYS: PresetKey[] = ['premium', 'balanced', 'cheap'];

/**
 * A jornada contratada muda o custo por pessoa mais do que qualquer outro campo
 * desta tela: 7 semanas com 1 competência não paga o que 14 com 2 pagam.
 * Até 01/09/2026 o orçamento somava o `exec` fixo do catálogo (que descreve só o
 * Regular DUO) para qualquer proposta — uma jornada de 7 semanas entrava na conta
 * pelo dobro do que custa. Default = DUO, que é o default global da engine.
 */
const JORNADAS = [
  { key: 'regular_duo', rotulo: 'Regular DUO', sub: '14 sem · 2 comp', cfg: PROGRAMA_REGULAR_DUO },
  { key: 'jornada', rotulo: 'Jornada', sub: '7 sem · 1 comp', cfg: PROGRAMA_JORNADA },
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
 * Agora o preço recorrente é por pessoa e por CICLO, e `parcelas` só divide.
 * `precoPessoaCiclo` nasce em 1.200 = os 100/mês × 12 de antes, para o cenário
 * base sair no MESMO valor (R$ 125.500): a mecânica muda, o preço praticado não.
 */
const PRECOS_DEFAULT = {
  // PTAX de fechamento do BCB em 10/09/2026: R$ 5,1149; arredondada na tela.
  // Continua editável para o orçamento aplicar margem cambial quando necessário.
  cotacao: 5.12,              // USD → BRL
  // ── Preço (o que a Vertho cobra) ──
  precoSetupGeral: 2000,      // R$ implantação (one-time)
  precoPessoaCiclo: 1200,     // R$ por pessoa por ciclo de programa
  precoCluster: 2000,         // R$ por unidade (setup da unidade, one-time)
  precoMatrizNova: 500,       // R$ por matriz criada do zero
  precoMatrizAdaptada: 250,   // R$ por matriz adaptada do catálogo canônico
  adicionalWorkshop: 15000,   // R$ por unidade quando o mapeamento é por workshop
  descontoPct: 0,
  margemAlvoPct: 60,          // piso de margem que decide o desconto máximo
  // ── Custo (o que a Vertho gasta) ──
  // R$/hora informado pelo dono em 07/09/2026. É a linha que faltava: sem ela o
  // workshop entrava com R$ 15.000 de preço e ZERO de custo, e por isso aparecia
  // como o item de maior margem da tela.
  custoHora: 500,
  horasImplantacao: 8,        // horas base do projeto, independentes de matriz
  horasMatrizNova: 6,
  horasMatrizAdaptada: 2,
  horasWorkshop: 16,          // por unidade, quando o método é workshop
  // Mensagens: medido em 20 dias (17/08–06/09), 1.181 templates; Ibipeba fecha
  // 11,9 por pessoa no período, o que projeta ~16 no ciclo de 7 semanas.
  // ⚠️ R$ 0,09 é o teto do UTILITY. Template que a Meta reclassifique como
  // MARKETING custa 6× — 4 de 8 já voltaram assim em 14/08.
  msgsPorPessoaCiclo: 16,
  custoMsgUnitario: 0.09,
  // Infra da plataforma (INFRA_FIXA no catálogo) rateada entre os clientes ativos.
  clientesAtivos: 2,
  reusoConteudo: 5,           // colaboradores que compartilham cada peça (1 = único por colab)
};

function moneyBRL(v: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v);
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
 * ⚠️ VÍDEO NÃO ENTRA AQUI. O fluxo Veo foi descontinuado, e até 01/09/2026 esta
 * função ainda recebia `porColab.video` e `custoRenderVideoUsd` para multiplicar
 * por um `uVideo` fixado em zero: os dois campos existiam na tela, aceitavam
 * número e não moviam nada na conta. Vídeo hoje é o bloco "Vídeo gerado do
 * Módulo-Base", que escala por VÍDEO e não por pessoa.
 */
function custoIAConteudo(
  porColab: { podcast: number; texto: number },
  nColabs: number,
  reuso: number,
) {
  const byId = (id: string) => CALLS.find((c) => c.id === id);
  const unit = (id: string) => {
    const call = byId(id);
    if (!call) return 0;
    return calcCost(call, (call as any).defaultModel, 1)?.usd || 0;
  };
  const uPodcast = unit('conteudo-podcast-roteiro') + unit('conteudo-podcast-tts');
  // Um PDF de texto percorre as três etapas. A expansão é condicional no código,
  // mas entra 1× aqui como premissa conservadora de orçamento.
  const uTexto = unit('conteudo-texto') + unit('conteudo-expansao-pdf') + unit('conteudo-layout-plan');
  const r = Math.max(1, reuso || 1);
  const perColab = (porColab.podcast * uPodcast + porColab.texto * uTexto) / r;
  return { perColab, total: perColab * nColabs, uPodcast, uTexto };
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
 * Custo de geração de VÍDEO a partir do Módulo-Base (Opus batch + HeyGen +
 * Remotion Hetzner + narração TTS). One-time por vídeo. Avatar opcional (sem
 * ele, sai só cenas animadas e o custo cai ~$0,47).
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
  // Quantas das pessoas da base entram de fato na trilha. Com preço fechado é
  // risco de CUSTO, e o pior caso é 100% — por isso o default não é a média.
  const [adesaoPct, setAdesaoPct] = useState(100);
  // Das `nPerfis` matrizes, quantas nascem do zero e quantas adaptam o catálogo
  // canônico. O resto é reuso puro, que não custa nem é cobrado.
  const [matrizNovas, setMatrizNovas] = useState(3);
  const [matrizAdaptadas, setMatrizAdaptadas] = useState(0);
  const [periodoMeses, setPeriodoMeses] = useState(12); // parcelas do pagamento
  const [ciclosPorAno, setCiclosPorAno] = useState(1); // ciclos de programa entregues
  const [preset, setPreset] = useState<PresetKey>('balanced');
  const [jornada, setJornada] = useState<string>('regular_duo');
  const cfgJornada = useMemo(
    () => (JORNADAS.find((j) => j.key === jornada) || JORNADAS[0]).cfg,
    [jornada],
  );
  // Geração de conteúdo — peças que CADA colaborador recebe por formato.
  const [conteudoColab, setConteudoColab] = useState({ podcast: 9, texto: 9 });
  function setConteudo<K extends keyof typeof conteudoColab>(k: K, v: number) {
    setConteudoColab((q) => ({ ...q, [k]: v }));
  }
  // Extração de vídeo → módulo-base (one-time, matéria-prima reusada).
  const [nVideosExtraidos, setNVideosExtraidos] = useState(0);
  const [auditarExtracao, setAuditarExtracao] = useState(true);
  // Geração de vídeo a partir do módulo-base (one-time por vídeo; avatar opcional).
  const [nVideosGerados, setNVideosGerados] = useState(0);
  const [comAvatar, setComAvatar] = useState(true);

  // Inputs de pricing
  const [pricing, setPricing] = useState(PRECOS_DEFAULT);

  function setPricingField<K extends keyof typeof PRECOS_DEFAULT>(k: K, v: number) {
    setPricing((p) => ({ ...p, [k]: v }));
  }

  const calc = useMemo(() => {
    const presetFn = PRESETS[preset].model;

    // Custo IA (USD)
    const custoSetupPorCluster = custoIASetupCluster(nPerfis, metodo, presetFn);
    const custoTaggingTotal = custoIATaggingTotal(presetFn);
    const custoPorColab = custoIAPorColab(presetFn, cfgJornada);
    const conteudo = custoIAConteudo(conteudoColab, nColabs, pricing.reusoConteudo);
    const custoConteudoTotal = conteudo.total;
    const custoConteudoPorColab = conteudo.perColab;

    // Extração de vídeo → módulo-base (one-time, não escala por ciclo).
    const custoExtracaoTotal = custoIAExtracao(nVideosExtraidos, auditarExtracao);
    const custoExtracaoPorVideo = custoIAExtracao(1, auditarExtracao);

    // Geração de vídeo a partir do módulo-base (one-time por vídeo).
    const custoVideoGeradoTotal = custoIAVideoGerado(nVideosGerados, comAvatar);
    const custoVideoGeradoPorVideo = custoIAVideoGerado(1, comAvatar);

    // Setup + tagging: uma vez (implantação). Mentor IA + Conteúdo: por ciclo.
    // ⚠️ Só as pessoas que ENTRAM na trilha consomem IA e mensagens: com preço
    // fechado, a adesão é risco de custo, e o pior caso é 100% (todo mundo
    // participa). Medido em 07/09: Macaé 29%, Ibipeba 69%.
    const ciclos = Math.max(1, ciclosPorAno || 1);
    const adesao = Math.min(1, Math.max(0, (adesaoPct || 0) / 100));
    const pessoasAtivas = nColabs * adesao;
    const custoSetupTotal = nClusters * custoSetupPorCluster + custoTaggingTotal;
    const custoColabsTotalAno = pessoasAtivas * custoPorColab * ciclos;
    const custoConteudoTotalAno = custoConteudoTotal * ciclos;
    const custoIAUsd = custoSetupTotal + custoColabsTotalAno + custoConteudoTotalAno + custoExtracaoTotal + custoVideoGeradoTotal;
    const custoIABrl = custoIAUsd * pricing.cotacao;

    // ── Custo cheio: IA + horas + mensagens + infra ──
    const matrizesNovas = Math.max(0, Math.min(nPerfis, matrizNovas));
    const matrizesAdaptadas = Math.max(0, Math.min(nPerfis - matrizesNovas, matrizAdaptadas));
    const matrizesReusadas = Math.max(0, nPerfis - matrizesNovas - matrizesAdaptadas);
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
    const custoTotalBrl = custoIABrl + custoHorasBrl + custoMsgBrl + custoInfraBrl;

    // ── Valor do projeto — pelo ESCOPO, nunca pelo prazo ──
    // A conta vive em `lib/orcamento/precificacao.ts` (pura, com teste): ela teve
    // um erro de MODELO, e modelo só não regride com guard.
    const custoOneTime = custoHorasBrl + custoSetupTotal * pricing.cotacao
      + (custoExtracaoTotal + custoVideoGeradoTotal) * pricing.cotacao;
    const parcelas = Math.max(1, periodoMeses || 1);

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
      { totalBrl: custoTotalBrl, oneTimeBrl: custoOneTime, mesesPrograma },
    );

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
      adesao,
      pessoasAtivas,
      matrizesNovas,
      matrizesAdaptadas,
      matrizesReusadas,
      horasTotais,
      custoHorasBrl,
      custoMsgBrl,
      custoInfraBrl,
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
      custoExtracaoTotal,
      custoExtracaoPorVideo,
      custoVideoGeradoTotal,
      custoVideoGeradoPorVideo,
      custoSetupTotal,
      custoColabsTotalAno,
      ciclos,
      custoIAUsd,
      custoIABrl,
      tabelaSetupGeral,
      tabelaClusters,
      tabelaPerfis,
      tabelaWorkshop,
      periodo: parcelas,
    };
  }, [nClusters, nPerfis, metodo, nColabs, periodoMeses, ciclosPorAno, adesaoPct, matrizNovas, matrizAdaptadas, preset, cfgJornada, pricing, conteudoColab, nVideosExtraidos, auditarExtracao, nVideosGerados, comAvatar]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-full">
      <BackButton href="/admin/dashboard" />
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator size={20} className="text-cyan-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Escopo do orçamento */}
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-cyan-300 mb-3">{t('scope.title')}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <FieldNumber locale={locale} icon={<School size={14} />} label={t('scope.clusters.label')} sub={t('scope.clusters.sub')}
            value={nClusters} onChange={setNClusters} min={1} />
          <FieldNumber locale={locale} icon={<Briefcase size={14} />} label={t('scope.profiles.label')} sub={t('scope.profiles.sub')}
            value={nPerfis} onChange={setNPerfis} min={1} />
          <FieldNumber locale={locale} icon={<Users size={14} />} label={t('scope.collaborators.label')} sub={t('scope.collaborators.sub')}
            value={nColabs} onChange={setNColabs} min={0} />
          <FieldNumber locale={locale} icon={<Users size={14} />} label="Adesão orçada (%)"
            sub={`${Math.round(calc.pessoasAtivas)} em trilha · pior caso = 100%`}
            value={adesaoPct} onChange={setAdesaoPct} min={0} />
          <FieldNumber locale={locale} icon={<Calculator size={14} />} label="Parcelas"
            sub="só divide o valor — não o multiplica"
            value={periodoMeses} onChange={setPeriodoMeses} min={1} />
          <FieldNumber locale={locale} icon={<Calculator size={14} />} label="Ciclos entregues"
            sub={`programa de ~${calc.mesesPrograma} ${calc.mesesPrograma === 1 ? 'mês' : 'meses'}`}
            value={ciclosPorAno} onChange={setCiclosPorAno} min={1} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              <Vote size={14} /> {t('scope.mapping')}
            </label>
            <div className="flex gap-1.5">
              {(['votacao', 'workshop'] as Metodo[]).map((m) => (
                <button key={m} onClick={() => setMetodo(m)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-bold border ${
                    metodo === m ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
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
                  jornada === j.key ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {j.rotulo} <span className="font-normal opacity-70">· {j.sub}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-gray-600 mt-1">
            Move o custo de IA por pessoa (USD {calc.custoPorColab.toFixed(2)}/colab nesta jornada), não o valor de tabela.
          </p>
        </div>

        {/* Matrizes: criar, adaptar ou reusar — o item de maior variação de custo */}
        <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-4">
          <FieldNumber locale={locale} icon={<Briefcase size={14} />} label="Matrizes novas"
            sub={`R$ ${pricing.precoMatrizNova} · ${pricing.horasMatrizNova}h cada`}
            value={matrizNovas} onChange={setMatrizNovas} min={0} />
          <FieldNumber locale={locale} icon={<Briefcase size={14} />} label="Matrizes adaptadas"
            sub={`R$ ${pricing.precoMatrizAdaptada} · ${pricing.horasMatrizAdaptada}h cada`}
            value={matrizAdaptadas} onChange={setMatrizAdaptadas} min={0} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Reusadas do catálogo</p>
            <p className="text-lg font-bold text-emerald-300 tabular-nums">{calc.matrizesReusadas}</p>
            <p className="text-[9px] text-gray-600">custo e preço zero</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Horas de gente</p>
            <p className="text-lg font-bold text-white tabular-nums">{calc.horasTotais} h</p>
            <p className="text-[9px] text-gray-600">{money(calc.custoHorasBrl)} a {money(pricing.custoHora)}/h</p>
          </div>
        </div>

        {/* Preset IA */}
        <div className="mt-3">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">{t('preset')}</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_KEYS.map((k) => (
              <button key={k} onClick={() => setPreset(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  preset === k ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {PRESETS[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de preços */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('pricing.title')}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          <FieldNumber locale={locale} label={t('pricing.exchange')} sub={t('pricing.perUsd', { value: money(pricing.cotacao) })} value={pricing.cotacao} onChange={(v) => setPricingField('cotacao', v)} allowDecimals min={0} />
          <FieldNumber locale={locale} label={t('pricing.generalSetup')} sub={t('pricing.fixed', { value: money(pricing.precoSetupGeral) })} value={pricing.precoSetupGeral} onChange={(v) => setPricingField('precoSetupGeral', v)} min={0} />
          <FieldNumber locale={locale} label="Por pessoa / ciclo" sub={`${money(pricing.precoPessoaCiclo)} por pessoa`} value={pricing.precoPessoaCiclo} onChange={(v) => setPricingField('precoPessoaCiclo', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.perCluster')} sub={t('pricing.setupValue', { value: money(pricing.precoCluster) })} value={pricing.precoCluster} onChange={(v) => setPricingField('precoCluster', v)} min={0} />
          <FieldNumber locale={locale} label="Matriz nova" sub={`${money(pricing.precoMatrizNova)} cada`} value={pricing.precoMatrizNova} onChange={(v) => setPricingField('precoMatrizNova', v)} min={0} />
          <FieldNumber locale={locale} label="Matriz adaptada" sub={`${money(pricing.precoMatrizAdaptada)} cada`} value={pricing.precoMatrizAdaptada} onChange={(v) => setPricingField('precoMatrizAdaptada', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.workshopPerCluster')} sub={t('pricing.ifWorkshop', { value: money(pricing.adicionalWorkshop) })} value={pricing.adicionalWorkshop} onChange={(v) => setPricingField('adicionalWorkshop', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.discount')} sub={`piso: ${calc.descontoMaxPct.toFixed(1)}%`} value={pricing.descontoPct} onChange={(v) => setPricingField('descontoPct', v)} min={0} allowDecimals />
        </div>
      </div>

      {/* Custo de entrega — as linhas que faltavam para a margem significar algo */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-amber-300 mb-1">Custo de entrega</p>
        <p className="text-[10px] text-gray-500 mb-3">
          Até 07/09/2026 a margem olhava só a IA e respondia 96–99% em qualquer cenário. Estas são as
          linhas que faltavam — o workshop, em especial, tinha preço e nenhum custo.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <FieldNumber locale={locale} label="Custo / hora" sub="implantação e workshop" value={pricing.custoHora} onChange={(v) => setPricingField('custoHora', v)} min={0} />
          <FieldNumber locale={locale} label="Horas de implantação" sub="base, fora as matrizes" value={pricing.horasImplantacao} onChange={(v) => setPricingField('horasImplantacao', v)} min={0} />
          <FieldNumber locale={locale} label="Horas / matriz nova" sub={`${pricing.horasMatrizAdaptada}h se adaptada`} value={pricing.horasMatrizNova} onChange={(v) => setPricingField('horasMatrizNova', v)} min={0} />
          <FieldNumber locale={locale} label="Horas / workshop" sub="por unidade" value={pricing.horasWorkshop} onChange={(v) => setPricingField('horasWorkshop', v)} min={0} />
          <FieldNumber locale={locale} label="Mensagens / pessoa" sub={`${money(pricing.custoMsgUnitario)} cada · UTILITY`} value={pricing.msgsPorPessoaCiclo} onChange={(v) => setPricingField('msgsPorPessoaCiclo', v)} min={0} />
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
        </div>
        <p className="text-[10px] text-amber-300/80 mt-2">
          ⚠ Mensagem em MARKETING custa 6× o UTILITY, e 4 de 8 templates já voltaram assim (14/08).
          Nesse caso esta linha vai a {money(calc.custoMsgBrl * 6)}.
        </p>
      </div>

      {/* Geração de conteúdo (por colaborador + reúso) */}
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-purple-300 mb-1 flex items-center gap-1.5">
          <Film size={14} /> {t('content.title')}
        </p>
        <p className="text-[10px] text-gray-500 mb-3">{t('content.hint')}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <FieldNumber locale={locale} icon={<Headphones size={14} />} label={t('content.podcast')} value={conteudoColab.podcast} onChange={(v) => setConteudo('podcast', v)} min={0} />
          <FieldNumber locale={locale} icon={<FileText size={14} />} label={t('content.text')} value={conteudoColab.texto} onChange={(v) => setConteudo('texto', v)} min={0} />
          <FieldNumber locale={locale} icon={<Users size={14} />} label={t('content.reuse')} sub={t('content.reuseHint')} value={pricing.reusoConteudo} onChange={(v) => setPricingField('reusoConteudo', v)} min={1} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <span className="text-purple-300 font-semibold">{t('content.perColab')}: USD {calc.custoConteudoPorColab.toFixed(2)}</span>
          <span className="text-purple-200 font-semibold">{t('content.total')}: USD {calc.custoConteudoTotal.toFixed(2)}</span>
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

      {/* Geração de vídeo a partir do Módulo-Base (avatar HeyGen + cenas Remotion + narração TTS) */}
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-violet-300 mb-1 flex items-center gap-1.5">
          <Clapperboard size={14} /> Vídeo gerado do Módulo-Base
        </p>
        <p className="text-[10px] text-gray-500 mb-3">
          Vídeo com avatar falante, cenas animadas e narração própria (voz Aoede). One-time por vídeo. O HeyGen é a maior linha (~64%); o render Remotion roda em Hetzner efêmero (~USD 0,022/vídeo). Sem avatar, o custo cai ~USD 0,47.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <FieldNumber locale={locale} icon={<Clapperboard size={14} />} label="Vídeos a gerar" value={nVideosGerados} onChange={setNVideosGerados} min={0} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Avatar falante</label>
            <button onClick={() => setComAvatar((v) => !v)}
              className={`mt-1 px-2 py-1.5 rounded text-xs font-bold border ${comAvatar ? 'bg-violet-500/20 border-violet-400/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>
              {comAvatar ? 'Com avatar (HeyGen)' : 'Só cenas animadas'}
            </button>
            <p className="text-[9px] text-gray-600 mt-0.5">HeyGen ≈ USD 0,47/vídeo</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <span className="text-violet-300 font-semibold">Por vídeo (~90s): USD {calc.custoVideoGeradoPorVideo.toFixed(2)}</span>
          <span className="text-violet-200 font-semibold">Total ({nVideosGerados.toLocaleString(locale)} vídeos): USD {calc.custoVideoGeradoTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Resumo financeiro — o valor é do PROJETO; a parcela é forma de pagamento */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white/[0.04] p-4 border border-cyan-400/20">
            <p className="text-[10px] uppercase tracking-widest text-cyan-300">Valor do projeto</p>
            <p className="text-3xl font-extrabold text-cyan-200 mt-1">{money(calc.valorTotalFinal)}</p>
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              <div className="flex justify-between"><span>{t('financial.oneTime')}</span><span>{money(calc.oneTimeTabela)}</span></div>
              <div className="flex justify-between"><span>Programa · {calc.ciclos} {calc.ciclos === 1 ? 'ciclo' : 'ciclos'}</span><span>{money(calc.tabelaPrograma)}</span></div>
              {calc.descontoTotal > 0 && (
                <div className="flex justify-between text-amber-300"><span>{t('financial.discountPct', { value: pricing.descontoPct.toLocaleString(locale) })}</span><span>- {money(calc.descontoTotal)}</span></div>
              )}
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-4 border border-emerald-400/20">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300">Parcela · {calc.parcelas}×</p>
            <p className="text-3xl font-extrabold text-emerald-200 mt-1">{money(calc.mensalidadeFlat)}<span className="text-base text-gray-400 font-normal"> {t('financial.perMonth')}</span></p>
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              <div className="flex justify-between"><span>{money(calc.valorTotalFinal)} ÷ {calc.parcelas}</span><span>—</span></div>
              <div className="flex justify-between text-gray-500"><span>o prazo divide, não multiplica</span><span>—</span></div>
            </div>
          </div>
        </div>

        {/* Sub-stats */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiBox label="Custo cheio" value={money(calc.custoTotalBrl)} sub={`IA ${money(calc.custoIABrl)} + ${money(calc.custoTotalBrl - calc.custoIABrl)}`} tone="gray" />
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
            {calc.matrizesReusadas > 0 && (
              <Row label={`Reusadas do catálogo: ${calc.matrizesReusadas}`} value={money(0)} muted />
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
          <p className="text-[10px] text-gray-500">Preset: {PRESETS[preset].label}</p>
          <p className="text-[10px] text-amber-300/70 mb-2">{t('ai.basis', { cycles: calc.ciclos })}</p>
          <div className="space-y-1.5 text-sm">
            <Row label={`${t('ai.setupLine', { clusters: nClusters, profiles: nPerfis, method: metodo })} ${t('ai.oneTimeTag')}`} value={`USD ${(nClusters * calc.custoSetupPorCluster).toFixed(2)}`} />
            <Row label={`${t('ai.tagging')} ${t('ai.oneTimeTag')}`} value={`USD ${calc.custoTaggingTotal.toFixed(2)}`} />
            <Row label={`${t('ai.mentorLine', { count: nColabs, value: calc.custoPorColab.toFixed(2) })}${calc.ciclos > 1 ? ` × ${calc.ciclos}` : ''}`} value={`USD ${calc.custoColabsTotalAno.toFixed(2)}`} />
            {calc.custoConteudoTotalAno > 0 && (
              <Row label={`${t('content.title')}${calc.ciclos > 1 ? ` × ${calc.ciclos}` : ''}`} value={`USD ${calc.custoConteudoTotalAno.toFixed(2)}`} />
            )}
            {calc.custoExtracaoTotal > 0 && (
              <Row label={`Extração de vídeo: ${nVideosExtraidos.toLocaleString(locale)} vídeo(s) ${t('ai.oneTimeTag')}`} value={`USD ${calc.custoExtracaoTotal.toFixed(2)}`} />
            )}
            {calc.custoVideoGeradoTotal > 0 && (
              <Row label={`Vídeo gerado${comAvatar ? ' (c/ avatar)' : ' (s/ avatar)'}: ${nVideosGerados.toLocaleString(locale)} vídeo(s) ${t('ai.oneTimeTag')}`} value={`USD ${calc.custoVideoGeradoTotal.toFixed(2)}`} />
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
