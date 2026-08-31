'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, BookOpen, Target, Sparkles, Lock, Check, Play, Video, FileText, Headphones, Award, ArrowLeft, Eye } from 'lucide-react';
import { loadTemporada, loadTemporadaPorEmail } from '@/actions/temporadas';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';
import { semanaLiberadaPorData, formatarLiberacao, turnosIaNecessarios, contarTurnosIa } from '@/lib/season-engine/week-gating';
import FirstViewVideo from '@/components/first-view-video';
import { descritorParaHumano } from '@/lib/descritor-humano';
// Vídeo tutorial da Jornada (Bunny) — abre na 1ª vez que a pessoa abre a
// temporada. A constante mora em programa-config: a tela da semana trancada
// serve o MESMO vídeo, e duas cópias do GUID divergiriam sem erro visível.
import { JORNADA_VIDEO_ID } from '@/lib/season-engine/programa-config';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };
const TIPO_LABEL_KEY = { conteudo: 'episode', aplicacao: 'practice', avaliacao: 'assessment' };
const TIPO_COR = { conteudo: '#06B6D4', aplicacao: '#F59E0B', avaliacao: '#A78BFA' };

// Fase 4 = Temporada — disciplinado
const PHASE_NUM = 4;
const PHASE_VARS = {
  '--phase-accent': '#b888e8',
  '--phase-deep': '#1a0d33',
  '--phase-glow': 'rgba(184,136,232,0.26)',
} as React.CSSProperties;

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export default function TemporadaPage() {
  const t = useTranslations('Season');
  const router = useRouter();
  const searchParams = useSearchParams();
  const colaboradorAlvo = searchParams.get('colaborador');
  // A presença do ID já implica consulta de terceiro. Não confia em `origem`
  // (parâmetro controlado pelo cliente) para decidir o modo somente leitura.
  const visaoGestor = !!colaboradorAlvo;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sb = getSupabase();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      // A action por ID aplica o mesmo gate central da jornada: próprio usuário,
      // RH, gestor responsável ou tutor. Assim o gestor vê a temporada REAL do
      // colaborador, sem impersonar a conta nem trocar a sessão.
      const r = colaboradorAlvo
        ? await loadTemporada(colaboradorAlvo)
        : await loadTemporadaPorEmail(user.email);
      if (r.error) setError(r.error); else setData(r);
      setLoading(false);
    })();
  }, [colaboradorAlvo, router, sb]);

  if (loading) return <Center><Loader2 className="animate-spin" style={{ color: 'var(--phase-accent, #b888e8)' }} /></Center>;
  if (error || !data?.trilha) return (
    <Center>
      <div className="text-center">
        <p className="text-gray-400 mb-2">{error || t('empty.title')}</p>
        <p className="text-xs text-gray-500">{t('empty.subtitle')}</p>
      </div>
    </Center>
  );

  const { trilha, progresso } = data;
  const pausada = trilha.status === 'pausada';
  const semanas = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  const progressoMap = Object.fromEntries((progresso || []).map((p: any) => [p.semana, p]));
  const concluidas = (progresso || []).filter((p: any) => p.status === 'concluido').length;
  const totalSemanas = semanas.length || 14;
  // Última semana de avaliação = onde fica o wizard cenário B (regular=14, onboarding=10).
  // Como a rota é única (/sem14), redireciono pra ela tanto faz o número da semana.
  const semanasAvaliacao = semanas.filter((s: any) => s.tipo === 'avaliacao').map((s: any) => s.semana);
  const semCenarioB = semanasAvaliacao.length ? Math.max(...semanasAvaliacao) : totalSemanas;
  const pct = Math.round((concluidas / Math.max(1, totalSemanas)) * 100);
  // Piloto: o slot de fechamento carrega calendario_semana (espelho) no plano.
  // A jornada "vendida" são as semanas de CONTEÚDO (2) — o fechamento é etapa.
  const isPiloto = semanas.some((s: any) => s.calendario_semana != null);
  const semanasJornada = isPiloto ? semanas.filter((s: any) => s.tipo === 'conteudo').length : totalSemanas;
  const tituloConsulta = data.viewerRole === 'rh'
    ? t('managerView.titleRh')
    : t('managerView.title');

  return (
    // ✅ data-phase="4" + CSS vars — toda a página herda a cor violeta da Temporada
    <div data-phase={String(PHASE_NUM)} style={PHASE_VARS}>
      <PageContainer>
        {visaoGestor && (
          <button
            type="button"
            onClick={() => router.push('/dashboard/gestor')}
            className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <ArrowLeft size={14} /> {t('managerView.back')}
          </button>
        )}
        <PageHero
          eyebrow={visaoGestor
            ? t('managerView.eyebrow', { name: data.colaborador?.nome_completo || '—' })
            : t('hero.eyebrow', { number: trilha.numero_temporada })}
          title={Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length > 1
            ? trilha.competencias_foco.join(' + ')
            : trilha.competencia_foco}
          // ✅ subtítulo com ênfase serif em "evoluir" e "próximo nível"
          subtitle={
            <span>
              {t.rich('hero.subtitle', {
                weeks: semanasJornada,
                evolve: (chunks) => <em style={{ ...serifStyle, color: 'var(--phase-accent)', fontSize: 'inherit' }}>{chunks}</em>,
                level: (chunks) => <em style={{ ...serifStyle, color: 'var(--phase-accent)', fontSize: 'inherit' }}>{chunks}</em>,
              })}
            </span>
          }
        />

        {visaoGestor ? (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border bg-white/[0.025] px-4 py-3" style={{ borderColor: 'color-mix(in oklab, var(--phase-accent) 28%, transparent)' }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: 'color-mix(in oklab, var(--phase-accent) 14%, transparent)', color: 'var(--phase-accent)' }}>
              <Eye size={17} />
            </span>
            <div>
              <p className="text-xs font-bold text-white">{tituloConsulta}</p>
              <p className="text-[10px] leading-relaxed text-white/45">{t('managerView.subtitle')}</p>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <FirstViewVideo videoId={JORNADA_VIDEO_ID} title={t('video.title')} label={t('video.label')} sectionKey="jornada" colabId={trilha.colaborador_id} />
          </div>
        )}

        {pausada && (
          <GlassCard className="mb-4 border-amber-500/30 bg-amber-500/5">
            <div className="text-xs text-amber-300">{t('paused')}</div>
          </GlassCard>
        )}

        {trilha.status === 'concluida' && trilha.evolution_report && (
          <>
            <EvolutionReportCard report={trilha.evolution_report} t={t} />
            {!visaoGestor && <div className="mb-6">
              <button
                onClick={() => router.push('/dashboard/temporada/concluida')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                style={{ background: 'var(--phase-accent)', color: '#062032' }}
              >
                {t('viewFullReport')}
              </button>
            </div>}
          </>
        )}

        {/* ✅ Progresso com tokens de fase */}
        <GlassCard className="mb-6" style={{ borderColor: 'color-mix(in oklab, var(--phase-accent) 22%, transparent)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.2em' }}>
              {t('progress.title')}
            </span>
            {/* ✅ "X/N semanas" em serif itálico na cor da fase */}
            <span style={{ ...serifStyle, fontSize: 16, color: 'var(--phase-accent)', letterSpacing: '-.01em' }}>
              {concluidas}<span style={{ opacity: 0.5, fontStyle: 'normal', fontSize: 13 }}>/{totalSemanas}</span> {t('progress.weeks')}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--phase-accent)' }}
            />
          </div>
        </GlassCard>

        {/* Timeline de semanas */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
          {semanas.map((s: any) => {
            const p = progressoMap[s.semana];
            const concluida = p?.status === 'concluido';
            const emAndamento = p?.status === 'em_andamento';
            // Piloto: o fechamento herda o calendário da sem 2 (calendario_semana
            // no plano) — o gate real vira "anterior concluída". Demais modos:
            // calendario_semana ausente → comportamento vanilla.
            const semanaCal = s.calendario_semana ?? s.semana;
            const liberadaPorData = semanaLiberadaPorData(trilha.data_inicio, semanaCal);
            const anteriorConcluida = s.semana === 1
              ? true
              : progressoMap[s.semana - 1]?.status === 'concluido';
            const liberada = concluida || (liberadaPorData && (emAndamento || anteriorConcluida));
            const motivoBloqueio = !liberada
              ? (!liberadaPorData
                  ? t('locked.releaseAt', { date: formatarLiberacao(trilha.data_inicio, semanaCal) })
                  : t('locked.completePrevious'))
              : '';

            /*
              QUANTO FALTA PARA A SEMANA FECHAR — na tela onde a pessoa ESCOLHE
              para onde ir.
              🔴 Antes, a semana começada e não terminada se distinguia das
              outras só por uma BORDA colorida. Cor sozinha lê-se como "você
              está aqui", não como "falta terminar" — e "falta terminar" é o
              estado de 13 das 61 pessoas travadas em 25/08/2026, seis delas a
              uma única resposta de distância (medido).
              Mesma régua da tela da semana e das rotas (`turnosIaNecessarios`),
              nunca um número escrito aqui: era assim que esta base colecionava
              portas com critérios diferentes para a mesma decisão.
            */
            const turnosFeitos = emAndamento ? contarTurnosIa(p, s.semana, s.tipo) : 0;
            const faltam = emAndamento
              ? Math.max(turnosIaNecessarios(s.semana, s.tipo, p?.feedback?.modo) - turnosFeitos, 0)
              : 0;

            const Icon = s.tipo === 'aplicacao' ? Target : s.tipo === 'avaliacao' ? Sparkles : (FORMAT_ICON[s.conteudo?.formato_core] || BookOpen);
            const avaliacaoFinalSomenteLeitura = visaoGestor && s.semana === semCenarioB;
            const urlSemana = `/dashboard/temporada/semana/${s.semana}`;
            const urlConsulta = colaboradorAlvo
              ? `${urlSemana}?colaborador=${encodeURIComponent(colaboradorAlvo)}&origem=gestor`
              : urlSemana;

            return (
              <button
                key={s.semana}
                onClick={() => {
                  if (!liberada || avaliacaoFinalSomenteLeitura) return;
                  router.push(s.semana === semCenarioB ? '/dashboard/temporada/sem14' : urlConsulta);
                }}
                disabled={!liberada || avaliacaoFinalSomenteLeitura}
                title={avaliacaoFinalSomenteLeitura ? t('managerView.finalAssessmentReadOnly') : motivoBloqueio}
                className={`relative rounded-xl p-3 text-left transition-all border ${
                  concluida
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400'
                    : emAndamento
                    ? 'border-2 hover:border-opacity-80'
                    : liberada
                    ? 'bg-white/5 border-white/10 hover:border-white/30'
                    : 'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
                } ${avaliacaoFinalSomenteLeitura ? 'disabled:cursor-default' : ''}`}
                style={emAndamento ? {
                  background: 'color-mix(in oklab, var(--phase-accent) 10%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--phase-accent) 45%, transparent)',
                  boxShadow: '0 0 0 3px color-mix(in oklab, var(--phase-accent) 14%, transparent)',
                } : undefined}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">
                    {s.calendario_semana != null ? t('pilotClosing') : t('weekShort', { number: s.semana })}
                  </span>
                  {concluida ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : !liberada ? (
                    <Lock size={12} className="text-gray-600" />
                  ) : (
                    <Icon size={14} style={{ color: emAndamento ? 'var(--phase-accent)' : TIPO_COR[s.tipo] }} />
                  )}
                </div>
                {/* ✅ Semana em andamento ganha nome em serif */}
                <div
                  className="text-[11px] font-bold text-white truncate"
                  title={s.descritor || t(`type.${TIPO_LABEL_KEY[s.tipo] || 'episode'}`)}
                  style={emAndamento ? { ...serifStyle, fontSize: 12, fontWeight: 400 } : undefined}
                >
                  {s.descritor || t(`type.${TIPO_LABEL_KEY[s.tipo] || 'episode'}`)}
                </div>
                {s.conteudo?.formato_core && liberada && (
                  <div className="text-[9px] text-gray-500 mt-0.5">{s.conteudo.formato_core}</div>
                )}
                {!liberada && motivoBloqueio && (
                  <div className="text-[9px] text-gray-500 mt-0.5 truncate">{motivoBloqueio}</div>
                )}
                {emAndamento && faltam > 0 && (
                  <div className="text-[9px] text-amber-300 mt-0.5 truncate font-medium">
                    {turnosFeitos === 0
                      ? t('week.notStarted')
                      : faltam === 1
                        ? t('week.incompleteOne')
                        : t('week.incomplete', { count: faltam })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </PageContainer>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-white"
      style={{ background: '#0a0e1a' }}>
      {children}
    </div>
  );
}

const CONVERGENCIA: Record<string, { label: string; cor: string; icon: string }> = {
  evolucao_confirmada: { label: 'Evolução confirmada', cor: 'emerald', icon: '✅' },
  evolucao_parcial:    { label: 'Evolução parcial',    cor: 'amber',   icon: '🟡' },
  estagnacao:          { label: 'Estagnação',          cor: 'gray',    icon: '⚪' },
  regressao:           { label: 'Regressão',           cor: 'red',     icon: '🔻' },
};

function EvolutionReportCard({ report, t }: { report: any; t: any }) {
  const descritores = report?.descritores || [];
  return (
    <GlassCard className="mb-6 border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-emerald-500/5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-brand-400" />
        <h2 className="text-sm uppercase font-bold text-brand-400">{t('report.title')}</h2>
      </div>
      {report.insight_geral && (
        <p className="text-sm text-gray-200 italic mb-4">"{report.insight_geral}"</p>
      )}
      <div className="space-y-2 mb-3">
        {descritores.map((d: any, i: number) => {
          const conv = CONVERGENCIA[d.convergencia] || CONVERGENCIA.estagnacao;
          const delta = Number((d.nota_pos - d.nota_pre).toFixed(1));
          return (
            <div key={i} className={`p-2 rounded-lg bg-white/5 border border-${conv.cor}-500/20`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">{conv.icon} {descritorParaHumano(d.descritor)}</div>
                <div className="text-[10px] text-gray-400">
                  {d.nota_pre} → <span className={`text-${conv.cor}-400 font-bold`}>{d.nota_pos}</span> ({delta > 0 ? '+' : ''}{delta})
                </div>
              </div>
              {d.depois && <div className="text-[11px] text-gray-400 mt-1">{d.depois}</div>}
            </div>
          );
        })}
      </div>
      {report.proximo_passo && (
        <div className="text-xs text-gray-300 mt-4 pt-3 border-t border-white/10">
          <strong className="text-brand-400">{t('report.nextStep')} </strong>{report.proximo_passo}
        </div>
      )}
    </GlassCard>
  );
}
