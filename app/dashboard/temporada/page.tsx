'use client';

import DemoExplorationBeacon from '@/components/dashboard/demo-exploration-beacon';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, BookOpen, Target, Sparkles, Lock, Check, Play, Video, FileText, Headphones, Award, ArrowLeft, Eye, PartyPopper, ClipboardCheck } from 'lucide-react';
import { loadTemporada, loadTemporadaPorEmail } from '@/actions/temporadas';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';
import { semanaLiberadaPorData, formatarLiberacao, turnosIaNecessarios, contarTurnosIa } from '@/lib/season-engine/week-gating';
import { qualitativaDoPlano, semanaCenarioBDoPlano } from '@/lib/season-engine/trilha-runtime';
import FirstViewVideo from '@/components/first-view-video';
import { descritorParaHumano } from '@/lib/descritor-humano';
import { formatarAvanco, formatarValorAvanco, exibeAntesDepois, relatorioMedeEvolucao } from '@/lib/season-engine/convergencia';
import { corTela } from '@/lib/season-engine/convergencia-cores';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';
// Vídeo tutorial da Jornada (Bunny) — abre na 1ª vez que a pessoa abre a
// temporada. A constante mora em programa-config: a tela da semana trancada
// serve o MESMO vídeo, e duas cópias do GUID divergiriam sem erro visível.
import { JORNADA_VIDEO_ID } from '@/lib/season-engine/programa-config';
import { duracaoDaTrilha } from '@/lib/season-engine/duracao-trilha';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };
const TIPO_LABEL_KEY = { conteudo: 'episode', aplicacao: 'practice', avaliacao: 'assessment' };
const TIPO_COR = { conteudo: '#34C5CC', aplicacao: '#F59E0B', avaliacao: '#A78BFA', mapeamento: '#34D399' };

// Fase 4 = Temporada — disciplinado
const PHASE_NUM = 4;
const PHASE_VARS = {
  '--phase-accent': '#b888e8',
  '--phase-deep': '#1a0d33',
  '--phase-glow': 'rgba(184,136,232,0.26)',
} as React.CSSProperties;

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--vh-font-display)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export default function TemporadaPage() {
  const t = useTranslations('Season');
  const tMapeamento = useTranslations('SeasonMapping');
  const router = useRouter();
  const searchParams = useSearchParams();
  const colaboradorAlvo = searchParams.get('colaborador');
  // A presença do ID já implica consulta de terceiro. Não confia em `origem`
  // (parâmetro controlado pelo cliente) para decidir o modo somente leitura.
  const visaoGestor = !!colaboradorAlvo;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const sb = getSupabase();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      // A action por ID aplica o mesmo gate central da jornada: próprio usuário,
      // RH ou gestor responsável. Assim o gestor vê a temporada REAL do
      // colaborador, sem impersonar a conta nem trocar a sessão.
      // A própria pessoa recebe também a temporada ANTERIOR concluída: depois do
      // encadeamento a atual é a seguinte, e o relatório da que fechou sumia.
      const r: any = colaboradorAlvo
        ? await loadTemporada(colaboradorAlvo)
        : await loadTemporadaPorEmail(user.email, { incluirAnterior: true });
      if (r.error) { setError(r.error); setErrorCode(r.code || ''); } else setData(r);
      setLoading(false);
    })();
  }, [colaboradorAlvo, router, sb]);

  if (loading) return <Center><Loader2 className="animate-spin" style={{ color: 'var(--phase-accent, #b888e8)' }} /></Center>;
  // A pessoa entrou numa jornada NOVA (turma nova) que ainda não tem trilha. A
  // anterior ficou no histórico, só para leitura: sem este estado a tela dizia
  // "sua jornada ainda não foi montada" e não apontava o mapeamento, que é o
  // primeiro passo da jornada nova.
  if (errorCode === 'JORNADA_NOVA_SEM_TRILHA') return (
    <div data-phase={String(PHASE_NUM)} style={PHASE_VARS}>
      <PageContainer>
        <GlassCard className="mt-6" style={{ borderColor: 'color-mix(in oklab, var(--phase-accent) 28%, transparent)' }}>
          <div className="text-center py-4" data-temporada-estado="jornada-nova">
            <p className="text-base font-bold text-white mb-2">{t('newJourney.title')}</p>
            <p className="text-sm text-gray-300 leading-relaxed mb-5">{visaoGestor ? t('newJourney.managerBody') : t('newJourney.body')}</p>
            {!visaoGestor && (
              <div className="flex flex-col gap-2 max-w-xs mx-auto">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/assessment')}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                  style={{ background: 'var(--phase-accent)', color: '#062032' }}
                >
                  {t('newJourney.ctaAssessment')}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/jornada/historico')}
                  className="w-full py-3 rounded-xl text-sm font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition"
                >
                  {t('newJourney.ctaHistory')}
                </button>
              </div>
            )}
          </div>
        </GlassCard>
      </PageContainer>
    </div>
  );
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
  // O total sai do plano; sem plano, do PROGRAMA da trilha (`duracaoDaTrilha`),
  // nunca do literal 14. Uma jornada de 7 semanas com plano ausente exibia
  // "2/14", uma barra que contradiz o relatório de evolução logo abaixo dela.
  const totalSemanas = semanas.length || duracaoDaTrilha(trilha);
  // Última semana de avaliação = onde fica o wizard cenário B (regular=14, jornada=7, onboarding=12).
  // Como a rota é única (/sem14), redireciono pra ela tanto faz o número da semana.
  // `0` quando o plano não tem avaliação (Personalizado SEM fechamento): o fallback era
  // `totalSemanas`, que mandava a última semana de CONTEÚDO para o assistente do
  // Cenário B de um fechamento que não existe (R-124). Mesma régua da tela da semana.
  const semCenarioB = semanaCenarioBDoPlano(semanas, 0);
  const pct = Math.round((concluidas / Math.max(1, totalSemanas)) * 100);
  // Piloto: o slot de fechamento carrega calendario_semana (espelho) no plano.
  // A jornada "vendida" são as semanas de CONTEÚDO (2) — o fechamento é etapa.
  const isPiloto = semanas.some((s: any) => s.calendario_semana != null);
  const semanasJornada = isPiloto ? semanas.filter((s: any) => s.tipo === 'conteudo').length : totalSemanas;
  // Quantas competências ESTA trilha trabalha: o Onboarding tem 5 e o DUO 2, e o
  // subtítulo dizia "1 competência" para todos. A degustação (piloto) não mede
  // evolução, então o texto dela não promete "evoluir" (R-30).
  const numCompetencias = Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length
    ? trilha.competencias_foco.length
    : 1;
  const tituloConsulta = data.viewerRole === 'rh'
    ? t('managerView.titleRh')
    : t('managerView.title');

  return (
    // ✅ data-phase="4" + CSS vars — toda a página herda a cor violeta da Temporada
    <div data-phase={String(PHASE_NUM)} style={PHASE_VARS}>
      <DemoExplorationBeacon alvo="jornada" />
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
              {t.rich(isPiloto ? 'hero.subtitlePilot' : 'hero.subtitle', {
                weeks: semanasJornada,
                count: numCompetencias,
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

        {/* Temporada anterior concluída (R-16): o relatório dela continua a um
            toque, mesmo com a seguinte em curso. */}
        {!visaoGestor && data.anteriorConcluida && (
          <GlassCard className="mb-6 border-emerald-500/30 bg-emerald-500/[0.05]">
            <div className="flex items-start gap-3">
              <Award size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">
                  {t('previousSeason.title', { number: data.anteriorConcluida.numeroTemporada })}
                </p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {t('previousSeason.body', { competency: data.anteriorConcluida.competencia || '' })}
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/temporada/concluida?trilha=${encodeURIComponent(data.anteriorConcluida.id)}&origem=temporada`)}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-[#062032] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                >
                  {t('previousSeason.cta', { number: data.anteriorConcluida.numeroTemporada })}
                </button>
              </div>
            </div>
          </GlassCard>
        )}

        {trilha.status === 'concluida' && trilha.evolution_report && (
          <>
            <EvolutionReportCard report={trilha.evolution_report} t={t} />
            {!visaoGestor && <div className="mb-6">
              <button
                onClick={() => router.push(`/dashboard/temporada/concluida?trilha=${encodeURIComponent(trilha.id)}&origem=temporada`)}
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
            // A semana do Cenário B é a avaliação final (o assistente de cenário), e não
            // uma conversa de respostas contadas. Sem esta exceção ela abria na Jornada
            // dizendo "conversa não começou" (R-124): a régua de turnos lia o slot
            // errado e cobrava 6 respostas de uma tela que não as tem.
            const ehFechamento = s.semana === semCenarioB;
            const turnosFeitos = emAndamento && !ehFechamento ? contarTurnosIa(p, s.semana, s.tipo, semCenarioB) : 0;
            const faltam = emAndamento && !ehFechamento
              ? Math.max(turnosIaNecessarios(s.semana, s.tipo, p?.feedback?.modo, qualitativaDoPlano(semanas)) - turnosFeitos, 0)
              : 0;

            const ehMapeamento = s.tipo === 'mapeamento';
            const Icon = ehMapeamento ? ClipboardCheck : s.tipo === 'aplicacao' ? Target : s.tipo === 'avaliacao' ? Sparkles : (FORMAT_ICON[s.conteudo?.formato_core] || BookOpen);
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
                  title={ehMapeamento ? tMapeamento('label') : (descritorParaHumano(s.descritor) || t(`type.${TIPO_LABEL_KEY[s.tipo] || 'episode'}`))}
                  style={emAndamento ? { ...serifStyle, fontSize: 12, fontWeight: 400 } : undefined}
                >
                  {ehMapeamento ? tMapeamento('label') : (descritorParaHumano(s.descritor) || t(`type.${TIPO_LABEL_KEY[s.tipo] || 'episode'}`))}
                </div>
                {ehMapeamento && concluida && (
                  <div className="text-[9px] text-gray-500 mt-0.5">{tMapeamento('tileDone')}</div>
                )}
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
  // Sem fundo próprio: o DashboardShell já pinta o gradiente da marca do tenant,
  // e uma cor fixa aqui vira uma faixa preta por cima dele (era `#0a0e1a`, de
  // antes do white-label). `min-h-[60vh]` em vez de `min-h-screen` porque a tela
  // inteira já é do shell — somar 100vh aqui empurra o rodapé para fora.
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-white">
      {children}
    </div>
  );
}

// Sem veredito de regressão e sem nota absoluta (ver `avancoExibido` em
// lib/season-engine/convergencia.ts): o card mostra quanto cada comportamento
// andou, com piso em zero, e o veredito.
// Cores pela paleta única do veredito (`convergencia-cores`).
const CONVERGENCIA: Record<string, { icon: string }> = {
  evolucao_confirmada: { icon: '✅' },
  evolucao_parcial:    { icon: '🟢' },
  estagnacao:          { icon: '⚪' },
};

function EvolutionReportCard({ report, t }: { report: any; t: any }) {
  const descritores = report?.descritores || [];

  // Consolidado da COMPETENCIA: o card listava comportamento a comportamento e
  // nunca dizia como a competencia terminou. Quem le a tela tinha de somar de
  // cabeca. A media sai dos mesmos descritores exibidos, entao o consolidado e
  // sempre coerente com a lista logo abaixo dele.
  //
  // 🔴 UM consolidado POR competência (16/09/2026). Antes a média juntava os
  // descritores das DUAS competências da trilha DUO e rotulava o resultado com
  // o nome da primeira. As médias vêm de `agruparPorCompetencia`, a mesma
  // função do PDF, e só entram descritores com as duas notas.
  const consolidados = agruparPorCompetencia(descritores);

  // O relatório da degustação (`modo: 'piloto'`) e o do Personalizado SEM fechamento
  // guardam só o ponto de partida: não há nota de chegada, então "Estável" por
  // comportamento seria um veredito de evolução que ninguém mediu, exatamente o que
  // a variante existe para evitar (R-102). A tela de relatório completo já
  // tem a variante própria; aqui o card diz que o avanço não é medido e lista só o
  // que foi trabalhado, sem veredito.
  if (!relatorioMedeEvolucao(report)) {
    return (
      <GlassCard className="mb-6 border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-emerald-500/5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-brand-400" />
          <h2 className="text-sm uppercase font-bold text-brand-400">{t('report.title')}</h2>
        </div>
        <p className="text-sm text-gray-300 mb-3">{t('report.notMeasured')}</p>
        {descritores.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-brand-300/80 mb-1">{t('report.worked')}</p>
            <ul className="space-y-1">
              {descritores.map((d: any, i: number) => (
                <li key={i} className="text-xs text-gray-200">{descritorParaHumano(d.descritor)}</li>
              ))}
            </ul>
          </>
        )}
      </GlassCard>
    );
  }

  return (
    <GlassCard className="mb-6 border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-emerald-500/5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-brand-400" />
        <h2 className="text-sm uppercase font-bold text-brand-400">{t('report.title')}</h2>
      </div>
      {report.insight_geral && (
        <p className="text-sm text-gray-200 italic mb-4">"{report.insight_geral}"</p>
      )}
      {consolidados.length > 0 && (
        <div className="mb-3 rounded-lg border border-brand-400/25 bg-brand-400/[0.06] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-brand-300/80 mb-1">
            {t('report.consolidated')}
          </p>
          <div className="space-y-1">
            {consolidados.map((c, i) => {
              const avanco = formatarValorAvanco(c.avancoMedio);
              return (
                <div key={i} className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="text-sm font-bold text-white">
                    {c.competencia || '-'}
                    {c.nivelFinal != null && c.subiuDeNivel && (
                      <span className="ml-2 text-[11px] font-normal text-gray-400">
                        <b className="text-white">{t('report.level', { n: c.nivelInicial })} → {t('report.level', { n: c.nivelFinal })}</b>
                        <span className="ml-1.5 inline-flex items-center gap-1 text-amber-300 font-bold">
                          <PartyPopper size={12} /> {t('report.levelUp')}
                        </span>
                      </span>
                    )}
                    {c.nivelFinal != null && !c.subiuDeNivel && (
                      <span className="ml-2 text-[11px] font-normal text-gray-400">
                        <b className="text-white">{t('report.level', { n: c.nivelFinal })}</b>
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-300">
                    {avanco && <span className="text-brand-300 font-bold">{avanco} · </span>}
                    <span className="text-gray-400">{c.descritores.length} {t('report.behaviors')}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-2 mb-3">
        {descritores.map((d: any, i: number) => {
          const conv = CONVERGENCIA[d.convergencia] || CONVERGENCIA.estagnacao;
          // Avanço com piso em zero: "0.0" é ESTÁVEL, e é assim que se diz. Um
          // "(-0.1)" na tela lê-se como o programa tendo piorado a pessoa,
          // quando a diferença está dentro do ruído da própria medida.
          const avanco = formatarAvanco(d.nota_pre, d.nota_pos);
          const estavel = avanco == null || avanco === '0.0';
          return (
            <div key={i} className={`p-2 rounded-lg bg-white/5 border ${corTela(d.convergencia).borda}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">{conv.icon} {descritorParaHumano(d.descritor)}</div>
                <div className={`text-[10px] font-bold ${estavel ? 'text-gray-400' : corTela(d.convergencia).tinta}`}>
                  {estavel ? t('report.stable') : avanco}
                </div>
              </div>
              {/* Relato só quando a conversa sustenta: ver `exibeAntesDepois`. */}
              {exibeAntesDepois(d) && d.depois && <div className="text-[11px] text-gray-400 mt-1">{d.depois}</div>}
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
