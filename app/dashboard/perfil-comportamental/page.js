'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, AlertCircle, Download, Zap, Users, Anchor, ListChecks, Sparkles } from 'lucide-react';
import { loadPerfilCIS, gerarInsightsExecutivos } from './perfil-comportamental-actions';
import {
  loadBehavioralReport,
  baixarRelatorioComportamentalPdf,
} from './relatorio/relatorio-actions';
import { PageContainer, PageHero } from '@/components/page-shell';
import { intensidadeQualitativa } from '@/lib/disc-arquetipos';

const COMP_GROUPS = {
  D: [
    { label: 'Ousadia', key: 'comp_ousadia' },
    { label: 'Comando', key: 'comp_comando' },
    { label: 'Objetividade', key: 'comp_objetividade' },
    { label: 'Assertividade', key: 'comp_assertividade' },
  ],
  I: [
    { label: 'Persuasão', key: 'comp_persuasao' },
    { label: 'Extroversão', key: 'comp_extroversao' },
    { label: 'Entusiasmo', key: 'comp_entusiasmo' },
    { label: 'Sociabilidade', key: 'comp_sociabilidade' },
  ],
  S: [
    { label: 'Empatia', key: 'comp_empatia' },
    { label: 'Paciência', key: 'comp_paciencia' },
    { label: 'Persistência', key: 'comp_persistencia' },
    { label: 'Planejamento', key: 'comp_planejamento' },
  ],
  C: [
    { label: 'Organização', key: 'comp_organizacao' },
    { label: 'Detalhismo', key: 'comp_detalhismo' },
    { label: 'Prudência', key: 'comp_prudencia' },
    { label: 'Concentração', key: 'comp_concentracao' },
  ],
};

// Paleta sem vermelho: D=amarelo, I=cinza, S=verde, C=azul
const DISC_COLORS = { D: '#EAB308', I: '#94A3B8', S: '#10B981', C: '#3B82F6' };
const DISC_LABELS = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };

function Bar({ label, value, max, color }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        <span className="text-sm font-extrabold" style={{ color }}>{Math.round(value || 0)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(100, (value || 0) / (max || 100) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function radarPoints(pct) {
  const r = pct, cx = 100, cy = 100;
  return [
    `${cx},${cy - r}`,
    `${cx + r},${cy}`,
    `${cx},${cy + r}`,
    `${cx - r},${cy}`,
  ].join(' ');
}

function discRadarPoints(disc) {
  const cx = 100, cy = 100;
  const scale = v => Math.min(100, Math.max(0, v || 0));
  return [
    `${cx},${cy - scale(disc.D)}`,
    `${cx + scale(disc.I)},${cy}`,
    `${cx},${cy + scale(disc.S)}`,
    `${cx - scale(disc.C)},${cy}`,
  ].join(' ');
}

// ── Análise Narrativa (ex-relatório) ─────────────────────────────────────
const DISC_QUAD = {
  D: { bar: '#EAB308', bg: 'rgba(234,179,8,0.10)', text: '#FDE68A' },
  I: { bar: '#94A3B8', bg: 'rgba(148,163,184,0.10)', text: '#CBD5E1' },
  S: { bar: '#10B981', bg: 'rgba(16,185,129,0.10)', text: '#6EE7B7' },
  C: { bar: '#3B82F6', bg: 'rgba(59,130,246,0.10)', text: '#93C5FD' },
};

function DiscBars({ scores, mutedColor }) {
  return (
    <div className="space-y-2">
      {['D', 'I', 'S', 'C'].map(d => {
        const v = Math.max(0, Math.min(100, scores[d] || 0));
        return (
          <div key={d} className="flex items-center gap-2">
            <span className="w-4 text-xs font-extrabold text-gray-400">{d}</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${v}%`, background: mutedColor || DISC_QUAD[d].bar }} />
            </div>
            <span className="w-7 text-right text-[11px] font-bold text-gray-300">{Math.round(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuadrantCard({ letter, title, n, a, traco, descricao, adaptacao }) {
  const q = DISC_QUAD[letter];
  return (
    <div className="rounded-xl p-4 border" style={{ background: q.bg, borderColor: 'rgba(255,255,255,0.08)', borderLeft: `4px solid ${q.bar}` }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
          <p className="text-base font-extrabold text-white mt-0.5">{traco || '—'}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-[9px] text-gray-500">Natural</p>
          <p className="text-xl font-black" style={{ color: q.text }}>{Math.round(n)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{descricao}</p>
      {adaptacao && (
        <p className="text-[10px] text-gray-400 italic mt-2 pt-2 border-t border-white/10">
          Adaptado {Math.round(a)} — {adaptacao}
        </p>
      )}
    </div>
  );
}

function AnaliseNarrativa({ data }) {
  if (!data) return null;
  const { raw, texts } = data;
  if (!raw || !texts) return null;

  return (
    <div className="space-y-5">
      {/* Síntese */}
      <div className="rounded-2xl p-5 border border-cyan-400/20" style={{ background: 'rgba(13,148,136,0.08)' }}>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 mb-2">Síntese do perfil</p>
        <p className="text-sm text-gray-200 leading-relaxed">{texts.sintese_perfil}</p>
      </div>

      {/* Snapshot DISC natural vs adaptado */}
      <div className="rounded-2xl p-5 border border-white/[0.06] grid grid-cols-1 md:grid-cols-2 gap-5"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-3 text-center">
            Natural — quem você é
          </p>
          <DiscBars scores={raw.disc_natural} />
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-3 text-center">
            Adaptado — exigência do ambiente
          </p>
          <DiscBars scores={raw.disc_adaptado} mutedColor="#94A3B8" />
        </div>
      </div>

      {/* 4 quadrantes DISC */}
      <div>
        <h2 className="text-base font-extrabold text-white mb-3">Como Você Funciona</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <QuadrantCard letter="D" title="Como lida com desafios"
            n={raw.disc_natural.D} a={raw.disc_adaptado.D}
            traco={texts.quadrante_D?.titulo_traco} descricao={texts.quadrante_D?.descricao} adaptacao={texts.quadrante_D?.adaptacao} />
          <QuadrantCard letter="I" title="Como lida com pessoas"
            n={raw.disc_natural.I} a={raw.disc_adaptado.I}
            traco={texts.quadrante_I?.titulo_traco} descricao={texts.quadrante_I?.descricao} adaptacao={texts.quadrante_I?.adaptacao} />
          <QuadrantCard letter="S" title="Como dita o ritmo"
            n={raw.disc_natural.S} a={raw.disc_adaptado.S}
            traco={texts.quadrante_S?.titulo_traco} descricao={texts.quadrante_S?.descricao} adaptacao={texts.quadrante_S?.adaptacao} />
          <QuadrantCard letter="C" title="Como lida com regras"
            n={raw.disc_natural.C} a={raw.disc_adaptado.C}
            traco={texts.quadrante_C?.titulo_traco} descricao={texts.quadrante_C?.descricao} adaptacao={texts.quadrante_C?.adaptacao} />
        </div>
      </div>

      {/* Top 5 forças/desenvolver */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 mb-3">5 maiores forças</p>
          <div className="space-y-2">
            {(texts.top5_forcas || []).map((f, i) => {
              const comp = raw.competencias.find(c => c.nome === f.competencia);
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-base font-black text-emerald-400 w-7 text-right">
                    {comp ? Math.round(comp.natural) : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{f.competencia}</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{f.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-3">5 oportunidades</p>
          <div className="space-y-2">
            {(texts.top5_desenvolver || []).map((d, i) => {
              const comp = raw.competencias.find(c => c.nome === d.competencia);
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-base font-black text-amber-400 w-7 text-right">
                    {comp ? Math.round(comp.natural) : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{d.competencia}</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{d.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Liderança narrativa */}
      <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-extrabold text-white mb-3">Estilo de Liderança</h2>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">{texts.lideranca_sintese}</p>
        <div className="rounded-lg p-3 border-l-2 border-amber-400" style={{ background: 'rgba(245,158,11,0.08)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-1">Oportunidades</p>
          <p className="text-xs text-gray-300">{texts.lideranca_trabalhar}</p>
        </div>
      </div>

      {/* Pontos sob pressão */}
      <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-extrabold text-white mb-1">Pontos a desenvolver sob pressão</h2>
        <p className="text-[10px] text-gray-500 mb-3">
          Comportamentos que perfis {raw.perfil_dominante} podem apresentar em momentos de estresse
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(texts.pontos_desenvolver_pressao || []).map((p, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-md" style={{ background: 'rgba(15,42,74,0.6)' }}>
              <div className="w-3 h-3 rounded-sm border-2 border-amber-400 mt-0.5 shrink-0" />
              <span className="text-[11px] text-gray-200 leading-relaxed">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Resumo Executivo ─────────────────────────────────────────────────────
const DISC_ICONS = { D: Zap, I: Users, S: Anchor, C: ListChecks };
const DISC_LABELS_FULL = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };

function inferLetraDominante(perfil) {
  return String(perfil || '').trim().toUpperCase()[0] || 'D';
}

// Render dos insights com **negrito** transformado em <strong>
function InsightText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="text-cyan-400 font-bold">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function ResumoExecutivo({ colaborador: c, arquetipo, tags, insights, insightsCached }) {
  const router = useRouter();
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsLocal, setInsightsLocal] = useState(insights);
  const [generated, setGenerated] = useState(insightsCached);

  // Dispara geração via IA na primeira visita após o mapeamento
  useEffect(() => {
    if (insightsCached || insightsLoading || generated) return;
    setInsightsLoading(true);
    gerarInsightsExecutivos(undefined).catch(() => {}); // best-effort, sem await
    // Não bloqueamos a UI — o fallback hardcoded já está visível.
    // Próximas visitas vão pegar o cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const letraDominante = inferLetraDominante(c.perfil_dominante);
  const discScores = [
    { letra: 'D', valor: c.d_natural || 0 },
    { letra: 'I', valor: c.i_natural || 0 },
    { letra: 'S', valor: c.s_natural || 0 },
    { letra: 'C', valor: c.c_natural || 0 },
  ];

  return (
    <div className="space-y-5">
      {/* Card 1: Identificação executiva */}
      <div className="rounded-2xl p-5 md:p-6 border border-cyan-400/15 relative overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        {/* glow decorativo */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-12 -mt-12"
          style={{ background: 'rgba(0,180,216,0.08)' }} />

        <div className="relative">
          <h2 className="font-extrabold text-xl md:text-2xl text-white">{c.nome_completo}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-cyan-400 font-bold text-base">{arquetipo?.nome || 'Profissional'}</span>
            <span className="h-1 w-1 rounded-full bg-gray-600" />
            <span className="text-gray-400 font-bold text-xs tracking-widest uppercase">
              {DISC_LABELS_FULL[letraDominante] || 'Perfil'} dominante
            </span>
          </div>
          {arquetipo?.desc && (
            <p className="text-sm text-gray-400 mt-2">{arquetipo.desc}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map(t => (
              <span key={t} className="border border-white/10 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-gray-300"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Card 2: DISC sintético */}
      <div className="rounded-2xl p-5 border border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-5 md:gap-6">
          {/* Letra dominante grande */}
          <div className="relative w-20 h-20 md:w-24 md:h-24 shrink-0 flex items-center justify-center rounded-full border border-cyan-400/30"
            style={{ background: 'rgba(0,180,216,0.08)' }}>
            <div className="flex flex-col items-center">
              <span className="text-4xl md:text-5xl font-black text-cyan-400" style={{ textShadow: '0 0 20px rgba(0,180,216,0.4)' }}>
                {letraDominante}
              </span>
              <span className="text-[8px] uppercase font-bold text-gray-400 tracking-[0.18em] -mt-1">
                Dominante
              </span>
            </div>
          </div>

          {/* 4 mini-itens DISC */}
          <div className="grid grid-cols-2 gap-y-3 gap-x-3 md:gap-x-4 flex-1 min-w-0">
            {discScores.map(({ letra, valor }) => {
              const Icon = DISC_ICONS[letra];
              return (
                <div key={letra} className="flex items-center gap-2 min-w-0">
                  <Icon size={18} className="text-cyan-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter truncate">
                      {DISC_LABELS_FULL[letra]}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {intensidadeQualitativa(valor)} {letra}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Card 3: Insights acionáveis */}
      <div className="rounded-2xl p-5 md:p-6 border border-white/[0.06] space-y-4"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-white">Insights acionáveis</h3>
          {!insightsCached && insightsLoading && (
            <Loader2 size={14} className="animate-spin text-cyan-400" />
          )}
        </div>

        <ul className="space-y-3">
          {insightsLocal.slice(0, 3).map((insight, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-cyan-400 shrink-0"
                style={{ boxShadow: '0 0 8px rgba(0,180,216,0.6)' }} />
              <p className="text-gray-300 text-sm leading-relaxed">
                <InsightText text={insight} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PerfilComportamentalPage() {
  const [data, setData] = useState(null);
  const [narrativa, setNarrativa] = useState(null); // { raw, texts } do loadBehavioralReport
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserEmail(user.email);

      // Carrega perfil (barras, 16 competências etc) e análise narrativa em paralelo
      const [result, narr] = await Promise.all([
        loadPerfilCIS(user.email),
        loadBehavioralReport(user.email).catch(() => null),
      ]);
      if (result.error) setError(result.error);
      else setData(result);
      if (narr && !narr.error) setNarrativa(narr);
      setLoading(false);
    }
    init();
  }, []);

  async function handleDownloadPdf() {
    if (!userEmail) return;
    setDownloading(true);
    const r = await baixarRelatorioComportamentalPdf(userEmail);
    setDownloading(false);
    if (r.error) { setError(r.error); return; }
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { colaborador: c } = data;
  const hasDISC = c.perfil_dominante && (c.d_natural || c.i_natural || c.s_natural || c.c_natural);

  if (!hasDISC) {
    return (
      <PageContainer>
        <PageHero
          eyebrow="PERFIL COMPORTAMENTAL"
          title="Mapeamento ainda não realizado"
          subtitle="Seu perfil comportamental ainda não foi mapeado. Leva cerca de 8 minutos."
        />
        <div className="flex justify-center">
          <div className="rounded-2xl border border-white/[0.06] p-8 text-center max-w-[520px] w-full"
            style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
            <AlertCircle size={40} className="text-cyan-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-5">
              O mapeamento identifica seu perfil DISC, estilo de liderança e preferências de aprendizagem.
            </p>
            <button onClick={() => router.push('/dashboard/perfil-comportamental/mapeamento')}
              className="px-6 py-3 rounded-full text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              Iniciar Mapeamento
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Montar estruturas a partir das colunas planas
  const disc = { D: c.d_natural || 0, I: c.i_natural || 0, S: c.s_natural || 0, C: c.c_natural || 0 };
  const dA = { D: c.d_adaptado || 0, I: c.i_adaptado || 0, S: c.s_adaptado || 0, C: c.c_adaptado || 0 };
  const lead = [
    { label: 'Executivo', value: c.lid_executivo || 0, color: DISC_COLORS.D },
    { label: 'Motivador', value: c.lid_motivador || 0, color: DISC_COLORS.I },
    { label: 'Metódico', value: c.lid_metodico || 0, color: DISC_COLORS.S },
    { label: 'Sistemático', value: c.lid_sistematico || 0, color: DISC_COLORS.C },
  ];

  // Flatten das 16 competências para forças/desenvolvimento
  const allComps = Object.entries(COMP_GROUPS).flatMap(([dim, arr]) =>
    arr.map(({ label, key }) => ({ name: label, value: c[key] || 0, dim }))
  );
  const sortedComps = [...allComps].sort((a, b) => b.value - a.value);
  const strengths = sortedComps.slice(0, 3);
  const gaps = sortedComps.slice(-3).reverse();

  // Resumo executivo (arquétipo + tags + insights) vem da action
  const arquetipo = data.arquetipo;
  const tags = data.tags || [];
  const insights = data.insights || [];

  return (
    <PageContainer className="space-y-5">
      <PageHero
        eyebrow="SEU PERFIL COMPORTAMENTAL"
        title="Resumo Executivo"
        actions={narrativa ? (
          <button onClick={handleDownloadPdf} disabled={downloading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-extrabold text-white transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)', boxShadow: '0 0 20px rgba(0,180,216,0.25)' }}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? 'Preparando...' : 'Baixar PDF'}
          </button>
        ) : null}
      />

      <ResumoExecutivo
        colaborador={c}
        arquetipo={arquetipo}
        tags={tags}
        insights={insights}
        insightsCached={data.insightsCached}
      />

      {/* Análise narrativa (quadrantes DISC, top5 forças/gaps, liderança, pressão) */}
      {narrativa && (
        <>
          <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mt-8 mb-1">
            Análise narrativa
          </p>
          <AnaliseNarrativa data={narrativa} />
        </>
      )}

      <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mt-8">
        Análise detalhada
      </p>

      {/* ── Radar DISC ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-gray-400 mb-4">DISC</p>
        <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto">
          {[25, 50, 75, 100].map(r => (
            <polygon key={r} points={radarPoints(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          ))}
          {[[100, 0], [200, 100], [100, 200], [0, 100]].map(([x, y], i) => (
            <line key={i} x1="100" y1="100" x2={x} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          ))}
          <polygon points={discRadarPoints(disc)} fill="rgba(45,212,191,0.12)" stroke="#2DD4BF" strokeWidth="2" />
          <polygon points={discRadarPoints(dA)} fill="rgba(252,211,77,0.08)" stroke="#FCD34D" strokeWidth="1.5" />
          {[{ f: 'D', x: 100, y: v => 100 - v }, { f: 'I', x: v => 100 + v, y: 100 }, { f: 'S', x: 100, y: v => 100 + v }, { f: 'C', x: v => 100 - v, y: 100 }].map(p => {
            const nv = disc[p.f], av = dA[p.f];
            const nx = typeof p.x === 'function' ? p.x(nv) : p.x, ny = typeof p.y === 'function' ? p.y(nv) : p.y;
            const ax = typeof p.x === 'function' ? p.x(av) : p.x, ay = typeof p.y === 'function' ? p.y(av) : p.y;
            return <g key={p.f}><circle cx={nx} cy={ny} r="3.5" fill="#2DD4BF" /><circle cx={ax} cy={ay} r="3.5" fill="#FCD34D" /></g>;
          })}
          <text x="100" y="10" textAnchor="middle" fill="#CBD5E1" fontSize="13" fontWeight="700">D</text>
          <text x="195" y="105" textAnchor="start" fill="#CBD5E1" fontSize="13" fontWeight="700">I</text>
          <text x="100" y="199" textAnchor="middle" fill="#CBD5E1" fontSize="13" fontWeight="700">S</text>
          <text x="5" y="105" textAnchor="end" fill="#CBD5E1" fontSize="13" fontWeight="700">C</text>
        </svg>
        <div className="flex justify-center gap-5 mt-3">
          <span className="text-xs font-bold text-gray-300"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2DD4BF] mr-1.5" />Natural</span>
          <span className="text-xs font-bold text-gray-300"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FCD34D] mr-1.5" />Adaptado</span>
        </div>
      </div>

      {/* ── Forças / Desenvolvimento ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-5 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[1.5px] text-green-400 mb-3">Forças</p>
          {strengths.map(s => (
            <p key={s.name} className="text-sm font-bold text-white mt-1.5">{s.name} <span className="text-green-400">{Math.round(s.value)}</span></p>
          ))}
        </div>
        <div className="rounded-2xl p-5 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[1.5px] text-amber-400 mb-3">Desenvolvimento</p>
          {gaps.map(g => (
            <p key={g.name} className="text-sm font-bold text-white mt-1.5">{g.name} <span className="text-amber-400">{Math.round(g.value)}</span></p>
          ))}
        </div>
      </div>

      {/* ── DISC Natural ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-gray-400 mb-4">DISC Natural</p>
        {[['Dominância', disc.D, DISC_COLORS.D], ['Influência', disc.I, DISC_COLORS.I], ['Estabilidade', disc.S, DISC_COLORS.S], ['Conformidade', disc.C, DISC_COLORS.C]].map(([l, v, col]) => (
          <Bar key={l} label={l} value={v} max={100} color={col} />
        ))}
      </div>

      {/* ── DISC Adaptado ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-amber-400 mb-1">DISC Adaptado</p>
        <p className="text-xs text-gray-400 mb-4">Como as pessoas esperam que você seja</p>
        {[['Dominância', dA.D, DISC_COLORS.D], ['Influência', dA.I, DISC_COLORS.I], ['Estabilidade', dA.S, DISC_COLORS.S], ['Conformidade', dA.C, DISC_COLORS.C]].map(([l, v, col]) => (
          <Bar key={l} label={l} value={v} max={100} color={col} />
        ))}
      </div>

      {/* ── Liderança ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-cyan-400 mb-4">Liderança</p>
        {lead.map(l => (
          <Bar key={l.label} label={l.label} value={l.value} max={50} color={l.color} />
        ))}
      </div>

      {/* ── Competências por dimensão ── */}
      {Object.entries(COMP_GROUPS).map(([dim, comps]) => (
        <div key={dim} className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[2px] mb-4" style={{ color: DISC_COLORS[dim] }}>
            Competências — {DISC_LABELS[dim]}
          </p>
          {comps.map(({ label, key }) => (
            <Bar key={key} label={label} value={c[key] || 0} max={100} color={DISC_COLORS[dim]} />
          ))}
        </div>
      ))}
    </PageContainer>
  );
}
