'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calculator, School, Users, Briefcase, Vote, Building2, Film, FileText, Headphones } from 'lucide-react';
import BackButton from '@/components/back-button';
import { CALLS, PRESETS, calcCost } from '@/lib/ia-cost-catalog';

type Metodo = 'votacao' | 'workshop';
type PresetKey = 'premium' | 'balanced' | 'cheap';

const PRESET_KEYS: PresetKey[] = ['premium', 'balanced', 'cheap'];

const PRECOS_DEFAULT = {
  cotacao: 5.30,              // USD → BRL
  precoSetupGeral: 5000,      // R$ taxa fixa de implantação (one-time, independente de clusters/colabs)
  precoColab: 300,            // R$ por colaborador / mês (Mentor IA — recorrente)
  precoCluster: 4000,         // R$ por cluster (setup do cluster, one-time)
  precoPerfil: 500,           // R$ por perfil (cargo) dentro do cluster (one-time)
  adicionalWorkshop: 15000,   // R$ por cluster quando método = workshop (one-time)
  manutencaoMensalColab: 100, // R$ por colaborador / mês (manutenção/suporte — recorrente)
  custoRenderVideoUsd: 36,    // USD por vídeo: 5 min 1080p × Veo 3.1 Fast ($0,12/s) = 300×0,12
  descontoPct: 0,
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

function custoIAPorColab(presetFn: (call: any) => string): number {
  let total = 0;
  for (const call of CALLS) {
    if (call.scaleType !== 'colab') continue;
    const model = presetFn(call);
    const c = calcCost(call, model, 1);
    if (c) total += c.usd;
  }
  return total;
}

/**
 * Custo de IA da geração de conteúdo (biblioteca reusada). Escala por nº de
 * peças autoradas por formato. Vídeo e podcast somam mídia (TTS + render Veo).
 * O render Veo usa o custo editável `custoRenderVideoUsd` (override do flatUsd).
 */
function custoIAConteudo(qtd: { texto: number; estudoCaso: number; podcast: number; video: number; personalizacao: number }, custoRenderVideoUsd: number): number {
  const byId = (id: string) => CALLS.find((c) => c.id === id);
  const cost = (id: string, units: number, overrideFlat?: number) => {
    const call = byId(id);
    if (!call || !units) return 0;
    const eff = overrideFlat != null ? { ...call, flatUsd: overrideFlat } : call;
    return calcCost(eff, (eff as any).defaultModel, units)?.usd || 0;
  };
  let total = 0;
  total += cost('conteudo-texto', qtd.texto);
  total += cost('conteudo-case', qtd.estudoCaso);
  total += cost('conteudo-podcast-roteiro', qtd.podcast) + cost('conteudo-podcast-tts', qtd.podcast);
  total += cost('conteudo-video-plano', qtd.video) + cost('conteudo-video-tts', qtd.video)
    + cost('conteudo-video-render', qtd.video, custoRenderVideoUsd);
  total += cost('conteudo-personalizacao', qtd.personalizacao);
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
  const [preset, setPreset] = useState<PresetKey>('balanced');
  // Geração de conteúdo (biblioteca) — default 0 (não afeta orçamentos atuais).
  const [qtdConteudo, setQtdConteudo] = useState({ texto: 0, estudoCaso: 0, podcast: 0, video: 0, personalizacao: 0 });
  function setQtd<K extends keyof typeof qtdConteudo>(k: K, v: number) {
    setQtdConteudo((q) => ({ ...q, [k]: v }));
  }

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
    const custoPorColab = custoIAPorColab(presetFn);
    const custoConteudoTotal = custoIAConteudo(qtdConteudo, pricing.custoRenderVideoUsd);

    const custoSetupTotal = nClusters * custoSetupPorCluster + custoTaggingTotal;
    const custoColabsTotal = nColabs * custoPorColab;
    const custoIAUsd = custoSetupTotal + custoColabsTotal + custoConteudoTotal;
    const custoIABrl = custoIAUsd * pricing.cotacao;

    // Valor de tabela (BRL)
    const tabelaSetupGeral = pricing.precoSetupGeral;
    const tabelaColabsMes = nColabs * pricing.precoColab;        // Mentor IA recorrente
    const tabelaClusters = nClusters * pricing.precoCluster;
    const tabelaPerfis = nClusters * nPerfis * pricing.precoPerfil;
    const tabelaWorkshop = metodo === 'workshop' ? nClusters * pricing.adicionalWorkshop : 0;
    const tabelaManutMes = nColabs * pricing.manutencaoMensalColab; // suporte/hosting recorrente
    const tabelaMensalidade = tabelaColabsMes + tabelaManutMes;     // total recorrente / mês

    const oneTimeTabela = tabelaSetupGeral + tabelaClusters + tabelaPerfis + tabelaWorkshop;
    const mes1Tabela = oneTimeTabela + tabelaMensalidade;
    const mesRecTabela = tabelaMensalidade;

    const fatorDesc = 1 - pricing.descontoPct / 100;
    const mes1Final = mes1Tabela * fatorDesc;
    const mesRecFinal = mesRecTabela * fatorDesc;
    const mes1Desc = mes1Tabela - mes1Final;
    const mesRecDesc = mesRecTabela - mesRecFinal;

    // Anual (mês 1 + 11 mensalidades) e total 12 meses para visão de margem
    const anualFinal = mes1Final + 11 * mesRecFinal;
    const margemAbs = anualFinal - custoIABrl;
    const margemPct = anualFinal > 0 ? (margemAbs / anualFinal) * 100 : 0;

    // Manter compat (referenciado em alguns lugares)
    const valorTabela = oneTimeTabela;
    const desconto = oneTimeTabela * (pricing.descontoPct / 100);
    const valorFinal = oneTimeTabela - desconto;

    return {
      custoSetupPorCluster,
      custoTaggingTotal,
      custoPorColab,
      custoConteudoTotal,
      custoSetupTotal,
      custoColabsTotal,
      custoIAUsd,
      custoIABrl,
      tabelaSetupGeral,
      tabelaColabsMes,
      tabelaClusters,
      tabelaPerfis,
      tabelaWorkshop,
      tabelaManutMes,
      tabelaMensalidade,
      oneTimeTabela,
      mes1Tabela,
      mesRecTabela,
      mes1Final,
      mesRecFinal,
      mes1Desc,
      mesRecDesc,
      anualFinal,
      valorTabela,
      desconto,
      valorFinal,
      margemAbs,
      margemPct,
    };
  }, [nClusters, nPerfis, metodo, nColabs, preset, pricing, qtdConteudo]);

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
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <FieldNumber locale={locale} icon={<School size={14} />} label={t('scope.clusters.label')} sub={t('scope.clusters.sub')}
            value={nClusters} onChange={setNClusters} min={1} />
          <FieldNumber locale={locale} icon={<Briefcase size={14} />} label={t('scope.profiles.label')} sub={t('scope.profiles.sub')}
            value={nPerfis} onChange={setNPerfis} min={1} />
          <FieldNumber locale={locale} icon={<Users size={14} />} label={t('scope.collaborators.label')} sub={t('scope.collaborators.sub')}
            value={nColabs} onChange={setNColabs} min={0} />
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
          <FieldNumber locale={locale} label={t('pricing.mentorPerColab')} sub={t('pricing.perColabMonth', { value: money(pricing.precoColab) })} value={pricing.precoColab} onChange={(v) => setPricingField('precoColab', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.perCluster')} sub={t('pricing.setupValue', { value: money(pricing.precoCluster) })} value={pricing.precoCluster} onChange={(v) => setPricingField('precoCluster', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.perProfile')} sub={t('pricing.perRole', { value: money(pricing.precoPerfil) })} value={pricing.precoPerfil} onChange={(v) => setPricingField('precoPerfil', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.workshopPerCluster')} sub={t('pricing.ifWorkshop', { value: money(pricing.adicionalWorkshop) })} value={pricing.adicionalWorkshop} onChange={(v) => setPricingField('adicionalWorkshop', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.maintenancePerColab')} sub={t('pricing.supportPerColabMonth', { value: money(pricing.manutencaoMensalColab) })} value={pricing.manutencaoMensalColab} onChange={(v) => setPricingField('manutencaoMensalColab', v)} min={0} />
          <FieldNumber locale={locale} label={t('pricing.discount')} sub={t('pricing.discountTotal', { value: pricing.descontoPct.toLocaleString(locale) })} value={pricing.descontoPct} onChange={(v) => setPricingField('descontoPct', v)} min={0} allowDecimals />
        </div>
      </div>

      {/* Geração de conteúdo (biblioteca reusada) */}
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-purple-300 mb-1 flex items-center gap-1.5">
          <Film size={14} /> {t('content.title')}
        </p>
        <p className="text-[10px] text-gray-500 mb-3">{t('content.hint')}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <FieldNumber locale={locale} icon={<FileText size={14} />} label={t('content.text')} value={qtdConteudo.texto} onChange={(v) => setQtd('texto', v)} min={0} />
          <FieldNumber locale={locale} icon={<FileText size={14} />} label={t('content.case')} value={qtdConteudo.estudoCaso} onChange={(v) => setQtd('estudoCaso', v)} min={0} />
          <FieldNumber locale={locale} icon={<Headphones size={14} />} label={t('content.podcast')} value={qtdConteudo.podcast} onChange={(v) => setQtd('podcast', v)} min={0} />
          <FieldNumber locale={locale} icon={<Film size={14} />} label={t('content.video')} value={qtdConteudo.video} onChange={(v) => setQtd('video', v)} min={0} />
          <FieldNumber locale={locale} label={t('content.personalization')} value={qtdConteudo.personalizacao} onChange={(v) => setQtd('personalizacao', v)} min={0} />
          <FieldNumber locale={locale} label={t('content.videoRenderUsd')} sub={t('content.videoRenderHint')} value={pricing.custoRenderVideoUsd} onChange={(v) => setPricingField('custoRenderVideoUsd', v)} min={0} allowDecimals />
        </div>
        {calc.custoConteudoTotal > 0 && (
          <p className="text-[11px] text-purple-300 mt-2 font-semibold">{t('content.subtotal')}: USD {calc.custoConteudoTotal.toFixed(2)}</p>
        )}
      </div>

      {/* Resumo financeiro — Mês 1 vs Mês 2+ */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white/[0.04] p-4 border border-emerald-400/20">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300">{t('financial.month1')}</p>
            <p className="text-3xl font-extrabold text-emerald-200 mt-1">{money(calc.mes1Final)}</p>
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              <div className="flex justify-between"><span>{t('financial.table')}</span><span>{money(calc.mes1Tabela)}</span></div>
              {calc.mes1Desc > 0 && (
                <div className="flex justify-between text-amber-300"><span>{t('financial.discountPct', { value: pricing.descontoPct.toLocaleString(locale) })}</span><span>- {money(calc.mes1Desc)}</span></div>
              )}
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-4 border border-cyan-400/20">
            <p className="text-[10px] uppercase tracking-widest text-cyan-300">{t('financial.month2')}</p>
            <p className="text-3xl font-extrabold text-cyan-200 mt-1">{money(calc.mesRecFinal)}<span className="text-base text-gray-400 font-normal"> {t('financial.perMonth')}</span></p>
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              <div className="flex justify-between"><span>{t('financial.table')}</span><span>{money(calc.mesRecTabela)}</span></div>
              {calc.mesRecDesc > 0 && (
                <div className="flex justify-between text-amber-300"><span>{t('financial.discountPct', { value: pricing.descontoPct.toLocaleString(locale) })}</span><span>- {money(calc.mesRecDesc)}</span></div>
              )}
              <div className="flex justify-between text-gray-500 pt-0.5"><span>{t('financial.includes')}</span><span>{nColabs.toLocaleString(locale)} × {money(pricing.precoColab + pricing.manutencaoMensalColab)}</span></div>
            </div>
          </div>
        </div>

        {/* Sub-stats */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiBox label={t('kpis.total12m')} value={money(calc.anualFinal)} tone="white" />
          <KpiBox label={t('kpis.aiCost')} value={money(calc.custoIABrl)} sub={`USD ${calc.custoIAUsd.toFixed(2)} × ${pricing.cotacao}`} tone="gray" />
          <KpiBox label={t('kpis.marginValue')} value={money(calc.margemAbs)} tone={calc.margemPct < 50 ? 'amber' : 'emerald'} />
          <KpiBox label={t('kpis.marginPct')} value={`${calc.margemPct.toFixed(1)}%`} tone={calc.margemPct < 50 ? 'amber' : 'emerald'} />
        </div>
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
            <Row label={t('breakdown.profilesLine', { count: nClusters * nPerfis, value: money(pricing.precoPerfil) })} value={money(calc.tabelaPerfis)} />
            {metodo === 'workshop' && (
              <Row label={`Workshop: ${nClusters} × ${money(pricing.adicionalWorkshop)}`} value={money(calc.tabelaWorkshop)} />
            )}
            <div className="pt-1.5 border-t border-white/5">
              <Row label={t('breakdown.oneTimeSubtotal')} value={money(calc.oneTimeTabela)} bold />
            </div>

            <p className="text-[10px] uppercase text-gray-500 mb-1 mt-3">{t('breakdown.recurring')}</p>
            <Row label={`Mentor IA: ${nColabs.toLocaleString(locale)} × ${money(pricing.precoColab)}`} value={money(calc.tabelaColabsMes)} />
            <Row label={`${t('breakdown.maintenance')}: ${nColabs.toLocaleString(locale)} × ${money(pricing.manutencaoMensalColab)}`} value={money(calc.tabelaManutMes)} />
            <div className="pt-1.5 border-t border-white/5">
              <Row label={t('breakdown.monthlyTotal')} value={money(calc.tabelaMensalidade)} bold />
            </div>

            <div className="pt-1.5 border-t border-white/5 mt-2">
              <Row label={t('breakdown.month1Table')} value={money(calc.mes1Tabela)} bold />
            </div>
            {calc.mes1Desc > 0 && <Row label={t('financial.discountPct', { value: pricing.descontoPct.toLocaleString(locale) })} value={`- ${money(calc.mes1Desc)}`} muted />}
            <Row label={t('breakdown.month1Final')} value={money(calc.mes1Final)} bold tone="emerald" />

            <div className="pt-1.5 border-t border-white/5 mt-2">
              <Row label={t('breakdown.month2Recurring')} value={`${money(calc.mesRecFinal)} ${t('financial.perMonth')}`} bold tone="emerald" />
            </div>
            <div className="pt-1.5 border-t border-white/5 mt-2">
              <Row label={t('kpis.total12m')} value={money(calc.anualFinal)} bold />
            </div>
          </div>
        </div>

        {/* Custo IA */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-xs uppercase tracking-widest text-amber-300 mb-3 flex items-center gap-1.5">
            <Calculator size={14} /> {t('breakdown.aiCost')}
          </h3>
          <p className="text-[10px] text-gray-500 mb-2">Preset: {PRESETS[preset].label}</p>
          <div className="space-y-1.5 text-sm">
            <Row label={t('ai.setupLine', { clusters: nClusters, profiles: nPerfis, method: metodo })} value={`USD ${(nClusters * calc.custoSetupPorCluster).toFixed(2)}`} />
            <Row label={t('ai.tagging')} value={`USD ${calc.custoTaggingTotal.toFixed(2)}`} />
            <Row label={t('ai.mentorLine', { count: nColabs, value: calc.custoPorColab.toFixed(2) })} value={`USD ${calc.custoColabsTotal.toFixed(2)}`} />
            {calc.custoConteudoTotal > 0 && (
              <Row label={t('content.title')} value={`USD ${calc.custoConteudoTotal.toFixed(2)}`} />
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
