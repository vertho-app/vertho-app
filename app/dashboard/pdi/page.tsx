'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Target, AlertCircle, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, BookOpen, Calendar, Lightbulb, Star, Download } from 'lucide-react';
import { loadPDI, baixarMeuPdiPdf } from './pdi-actions';
import { PageContainer, PageHero } from '@/components/page-shell';

const nivelColor = n => n >= 4 ? '#10B981' : n >= 3 ? '#06B6D4' : n >= 2 ? '#F59E0B' : '#EAB308';
const nivelBg    = n => n >= 4 ? 'rgba(16,185,129,0.15)' : n >= 3 ? 'rgba(6,182,212,0.15)' : n >= 2 ? 'rgba(245,158,11,0.15)' : 'rgba(234,179,8,0.15)';
const nivelLabel = (n, t) => n >= 4 ? t('level.excellent') : n >= 3 ? t('level.good') : n >= 2 ? t('level.developing') : t('level.attention');

function SectionTitle({ children, icon: Icon, color = '#06B6D4' }: { children?: any; icon?: any; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon size={14} style={{ color }} />}
      <p className="text-[10px] font-extrabold uppercase tracking-[2px]" style={{ color }}>{children}</p>
    </div>
  );
}

function CompetencyBlock({ comp, idx, t }: { comp?: any; idx?: any; t: any }) {
  const [open, setOpen] = useState(idx === 0);
  const nivel = comp.nivel || comp.nivel_atual || 0;
  const color = nivelColor(nivel);
  const isFlag = comp.flag || nivel <= 1;

  return (
    <div className="rounded-xl border overflow-hidden" style={{
      background: '#0F2A4A',
      borderColor: isFlag ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.06)',
    }}>
      {/* Header clicável */}
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: nivelBg(nivel) }}>
          <Target size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white">{comp.nome}</p>
            {isFlag && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-amber-400 bg-amber-400/10">{t('priority')}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-bold" style={{ color }}>N{nivel}</span>
            <span className="text-[10px] text-gray-500">{nivelLabel(nivel, t)}</span>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-500 shrink-0" /> : <ChevronDown size={18} className="text-gray-500 shrink-0" />}
      </button>

      {/* Conteúdo expandido */}
      {open && (
        <div className="px-4 pb-4 border-t border-white/[0.04] space-y-4">
          {/* Descritores em desenvolvimento */}
          {comp.descritores_desenvolvimento?.length > 0 && (
            <div className="mt-4 rounded-xl p-3 border-l-4" style={{ background: 'rgba(245,158,11,0.05)', borderLeftColor: '#F59E0B' }}>
              <SectionTitle icon={AlertTriangle} color="#F59E0B">{t('sections.developingDescriptors')}</SectionTitle>
              <ul className="space-y-1">
                {comp.descritores_desenvolvimento.map((d, i) => (
                  <li key={i} className="text-xs text-gray-200 leading-relaxed">• {d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Fez Bem / Melhorar */}
          <div className="grid grid-cols-1 gap-3">
            {comp.fez_bem?.length > 0 && (
              <div className="rounded-xl p-3 border-l-4" style={{ background: 'rgba(16,185,129,0.05)', borderLeftColor: '#10B981' }}>
                <SectionTitle icon={CheckCircle} color="#10B981">{t('sections.didWell')}</SectionTitle>
                <ul className="space-y-1">
                  {comp.fez_bem.map((e, i) => (
                    <li key={i} className="text-xs text-gray-200 leading-relaxed">+ {e}</li>
                  ))}
                </ul>
              </div>
            )}
            {comp.melhorar?.length > 0 && (
              <div className="rounded-xl p-3 border-l-4" style={{ background: 'rgba(245,158,11,0.05)', borderLeftColor: '#F59E0B' }}>
                <SectionTitle icon={AlertTriangle} color="#F59E0B">{t('sections.canImprove')}</SectionTitle>
                <ul className="space-y-1">
                  {comp.melhorar.map((e, i) => (
                    <li key={i} className="text-xs text-gray-200 leading-relaxed">! {e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Feedback / Análise */}
          {comp.feedback && (
            <div className="rounded-xl p-3 border-l-4" style={{ background: 'rgba(6,182,212,0.05)', borderLeftColor: '#06B6D4' }}>
              <SectionTitle color="#06B6D4">{t('sections.analysis')}</SectionTitle>
              <p className="text-xs text-gray-200 leading-relaxed italic">{comp.feedback}</p>
            </div>
          )}

          {/* Plano 30 dias */}
          {comp.plano_30_dias && (
            <div>
              <SectionTitle icon={Calendar}>{t('sections.thirtyDayPlan')}</SectionTitle>
              <div className="space-y-2">
                {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((k, i) => {
                  const sem = comp.plano_30_dias[k];
                  if (!sem) return null;
                  return (
                    <div key={k} className="rounded-xl p-3 flex gap-3" style={{ background: 'rgba(15,42,74,0.6)' }}>
                      <div className="w-7 h-7 rounded-full bg-[#0F2B54] flex items-center justify-center shrink-0 text-[11px] font-bold text-white">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-cyan-400 mb-1">{sem.foco}</p>
                        {sem.acoes?.map((a, j) => (
                          <p key={j} className="text-[11px] text-gray-300 leading-relaxed">• {a}</p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dicas */}
          {comp.dicas_desenvolvimento?.length > 0 && (
            <div className="rounded-xl p-3 border-l-4" style={{ background: 'rgba(13,148,136,0.05)', borderLeftColor: '#0D9488' }}>
              <SectionTitle icon={Lightbulb} color="#0D9488">{t('sections.developmentTips')}</SectionTitle>
              <ul className="space-y-1">
                {comp.dicas_desenvolvimento.map((d, i) => (
                  <li key={i} className="text-xs text-gray-200 leading-relaxed">• {d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Estudo recomendado */}
          {comp.estudo_recomendado?.length > 0 && (
            <div className="rounded-xl p-3 border-l-4" style={{ background: 'rgba(139,92,246,0.05)', borderLeftColor: '#8B5CF6' }}>
              <SectionTitle icon={BookOpen} color="#8B5CF6">{t('sections.recommendedStudy')}</SectionTitle>
              <ul className="space-y-1">
                {comp.estudo_recomendado.map((e, i) => (
                  <li key={i} className="text-xs text-gray-200 leading-relaxed">• {typeof e === 'string' ? e : e.titulo + (e.por_que_ajuda ? ' — ' + e.por_que_ajuda : '')}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Checklist tático */}
          {comp.checklist_tatico?.length > 0 && (
            <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: 'rgba(15,42,74,0.4)' }}>
              <SectionTitle icon={Star}>{t('sections.tacticalChecklist')}</SectionTitle>
              <ul className="space-y-1">
                {comp.checklist_tatico.map((t, i) => (
                  <li key={i} className="text-xs text-gray-200 leading-relaxed">☐ {t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PDIPage() {
  const t = useTranslations('Pdi');
  const locale = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadErr, setDownloadErr] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadPDI();
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    })();
  }, []);

  async function handleDownloadPdf() {
    setDownloading(true);
    setDownloadErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await baixarMeuPdiPdf();
      if (r.error) { setDownloadErr(r.error); return; }
      // Download direto via signed URL (sem passar pelo server action)
      window.location.href = r.url;
    } catch (e) {
      setDownloadErr(e?.message || t('download.error'));
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  // Estados sem PDI ativo
  if (!data.pdiAtivo) {
    return (
      <PageContainer>
        <PageHero
          eyebrow={t('eyebrowShort')}
          title={data.concluiuAvaliacao ? t('empty.preparingTitle') : t('empty.assessmentTitle')}
          subtitle={data.concluiuAvaliacao
            ? t('empty.preparingSubtitle')
            : data.totalAvaliacao > 0
              ? t('empty.progressSubtitle', { done: data.respondidas, total: data.totalAvaliacao })
              : t('empty.notStartedSubtitle')}
        />
        <div className="flex justify-center">
          <div className="rounded-2xl border border-white/[0.06] p-8 text-center max-w-[520px] w-full"
            style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
            <AlertCircle size={40} className="text-gray-500 mx-auto mb-4" />
            {data.concluiuAvaliacao ? (
              <button onClick={() => router.push('/dashboard')}
                className="px-6 py-3 rounded-full text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {t('empty.backDashboard')}
              </button>
            ) : (
              <button onClick={() => router.push('/dashboard/assessment')}
                className="px-6 py-3 rounded-full text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {data.respondidas > 0 ? t('empty.continueAssessment') : t('empty.goAssessment')}
              </button>
            )}
          </div>
        </div>
      </PageContainer>
    );
  }

  const c = data.conteudo || {};
  const competencias = c.competencias || [];
  const perfil = c.perfil_comportamental || c.perfil_disc || null;
  const pontosFortes = perfil?.pontos_forca || perfil?.pontos_fortes || [];
  const pontosAtencao = perfil?.pontos_atencao || [];

  return (
    <PageContainer className="space-y-4">
      <PageHero
        eyebrow={t('eyebrowFull')}
        title={data.colaborador.nome_completo}
        subtitle={[
          data.colaborador.cargo,
          data.criadoEm && t('generatedAt', { date: new Date(data.criadoEm).toLocaleDateString(locale) }),
        ].filter(Boolean).join(' · ')}
        actions={(
          <button onClick={handleDownloadPdf} disabled={downloading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-extrabold text-white transition disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)', boxShadow: '0 0 20px rgba(0,180,216,0.25)' }}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? t('download.preparing') : t('download.button')}
          </button>
        )}
      />
      {downloadErr && (
        <div className="rounded-lg p-2 border border-red-400/30 text-[11px] text-red-400 text-center" style={{ background: 'rgba(239,68,68,0.05)' }}>
          {downloadErr}
        </div>
      )}

      {/* Acolhimento */}
      {c.acolhimento && (
        <div className="rounded-xl p-4 border border-cyan-400/20" style={{ background: 'rgba(6,182,212,0.05)' }}>
          <p className="text-sm text-gray-200 italic leading-relaxed">{c.acolhimento}</p>
        </div>
      )}

      {/* Resumo Geral */}
      {c.resumo_geral && (
        <div className="rounded-xl p-4 border-l-4 border-white/[0.06]" style={{ background: '#0F2A4A', borderLeftColor: '#0F2B54' }}>
          <SectionTitle>{t('sections.generalSummary')}</SectionTitle>
          <p className="text-sm text-gray-200 leading-relaxed">{typeof c.resumo_geral === 'string' ? c.resumo_geral : c.resumo_geral.leitura}</p>
          {typeof c.resumo_geral === 'object' && c.resumo_geral.principais_forcas?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {c.resumo_geral.principais_forcas.map((f, i) => (
                <li key={i} className="text-xs text-emerald-400 leading-relaxed">+ {f}</li>
              ))}
            </ul>
          )}
          {typeof c.resumo_geral === 'object' && c.resumo_geral.principal_ponto_de_atencao && (
            <p className="text-xs text-amber-400 mt-2">! {c.resumo_geral.principal_ponto_de_atencao}</p>
          )}
        </div>
      )}

      {/* Perfil Comportamental */}
      {perfil && (
        <div className="rounded-xl p-4 border-l-4" style={{ background: 'rgba(6,182,212,0.05)', borderLeftColor: '#06B6D4' }}>
          <SectionTitle color="#06B6D4">{t('sections.behavioralProfile')}</SectionTitle>
          {perfil.descricao && <p className="text-sm text-gray-200 leading-relaxed mb-3">{perfil.descricao}</p>}
        </div>
      )}

      {/* Pontos Fortes / Atenção */}
      {(pontosFortes.length > 0 || pontosAtencao.length > 0) && (
        <div className="grid grid-cols-1 gap-3">
          {pontosFortes.length > 0 && (
            <div className="rounded-xl p-4 border-l-4" style={{ background: 'rgba(16,185,129,0.05)', borderLeftColor: '#10B981' }}>
              <SectionTitle icon={CheckCircle} color="#10B981">{t('sections.strengths')}</SectionTitle>
              <ul className="space-y-1">
                {pontosFortes.map((p, i) => <li key={i} className="text-xs text-gray-200 leading-relaxed">+ {p}</li>)}
              </ul>
            </div>
          )}
          {pontosAtencao.length > 0 && (
            <div className="rounded-xl p-4 border-l-4" style={{ background: 'rgba(245,158,11,0.05)', borderLeftColor: '#F59E0B' }}>
              <SectionTitle icon={AlertTriangle} color="#F59E0B">{t('sections.attentionPoints')}</SectionTitle>
              <ul className="space-y-1">
                {pontosAtencao.map((p, i) => <li key={i} className="text-xs text-gray-200 leading-relaxed">! {p}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Resumo de Desempenho */}
      {c.resumo_desempenho?.length > 0 && (
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <SectionTitle>{t('sections.performanceSummary')}</SectionTitle>
          <div className="space-y-2">
            {c.resumo_desempenho.map((rd, i) => {
              const n = rd.nivel || rd.nivel_atual || 0;
              return (
                <div key={i} className="flex items-center justify-between rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="text-xs text-white font-semibold truncate">{rd.competencia || rd.nome}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ color: nivelColor(n), background: nivelBg(n) }}>N{n}</span>
                    <span className="text-[10px]" style={{ color: nivelColor(n) }}>{nivelLabel(n, t)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competências (blocos individuais) */}
      {competencias.length > 0 && (
        <div className="space-y-3">
          <SectionTitle>{t('sections.competencyPlan')}</SectionTitle>
          {competencias.map((comp, idx) => <CompetencyBlock key={idx} comp={comp} idx={idx} t={t} />)}
        </div>
      )}

      {/* Mensagem Final */}
      {c.mensagem_final && (
        <div className="rounded-xl p-5 border border-cyan-400/20 mt-6" style={{ background: 'rgba(6,182,212,0.05)' }}>
          <SectionTitle color="#06B6D4">{t('sections.finalMessage')}</SectionTitle>
          <p className="text-sm text-gray-200 leading-relaxed italic">{c.mensagem_final}</p>
        </div>
      )}
    </PageContainer>
  );
}
