'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, Trophy, Target, CheckCircle2, TrendingUp, Minus, PartyPopper } from 'lucide-react';
import { GlassCard } from '@/components/page-shell';
import ReactMarkdown from 'react-markdown';
import { descritorParaHumano } from '@/lib/descritor-humano';
import { formatarAvanco, formatarValorAvanco, CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { COR_VEREDITO_TELA, corTela } from '@/lib/season-engine/convergencia-cores';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';

// Sem veredito de regressão (a régua não tem desde 01/09) e sem nota absoluta:
// cada descritor mostra só o AVANÇO, com piso em zero, e o veredito. Decisão do
// dono aplicada às telas de admin e do gestor em 14/09; esta tela, que é a da
// própria pessoa e a que baixa o PDF, ficou para trás até 16/09.
// Cores pela paleta única do veredito (`convergencia-cores`).
const VEREDITO = {
  evolucao_confirmada: { icon: TrendingUp, labelKey: 'confirmed' },
  evolucao_parcial:    { icon: TrendingUp, labelKey: 'partial' },
  estagnacao:          { icon: Minus,      labelKey: 'stagnation' },
};

/**
 * O relatório da temporada concluída (variante regular), na MESMA ORDEM do PDF
 * (`lib/temporada-concluida-pdf.tsx`), decisão do dono em 16/09/2026:
 *
 *   1. "<nome>, veja o que mudou em você" + a devolutiva da avaliação final,
 *      que "já traz de bate pronto o resumo da evolução";
 *   2. as competências em destaque (nível e "Avanço"), o indicador da régua de
 *      maturidade;
 *   3. descritor a descritor, abrindo com os contadores;
 *   4. momentos, missões, cenário e resposta, próximos passos;
 *   5. "Mensagem final" (`insight_geral`, que antes abria a tela).
 *
 * Vive fora da página para ser renderizável sem sessão: é assim que o teste
 * confere a ordem e que a captura de tela usa a marcação real.
 */
export default function RelatorioTemporadaConcluida({ data }: { data: any }) {
  const t = useTranslations('SeasonDone');
  const { colab, trilha, evolutionReport, momentos = [], missoes = [], sem14 } = data;
  const firstName = (colab?.nome || '').split(' ')[0];
  const descritores = evolutionReport?.descritores || [];
  const resumo = evolutionReport?.resumo || {};
  const grupos = agruparPorCompetencia(descritores);
  const comCompetencia = grupos.filter((g) => g.competencia);
  const devolutiva = sem14?.resumo_avaliacao?.mensagem_geral;

  return (
    <>
      {/* Hero + devolutiva da avaliação final */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="text-xs uppercase text-amber-400 tracking-widest font-bold">{t('hero.eyebrow', { number: trilha.numeroTemporada })}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-2">
          {t('hero.title', { name: firstName })}
        </h1>
        <p className="text-sm text-gray-400">
          {t.rich('hero.subtitle', {
            weeks: trilha.totalSemanas || 14,
            competency: trilha.competencia,
            strong: (chunks) => <span className="text-brand-400">{chunks}</span>,
          })}
        </p>
        {devolutiva && (
          <p className="mt-5 text-[15px] leading-relaxed text-gray-200 whitespace-pre-line">{devolutiva}</p>
        )}
      </div>

      {/* Competências em destaque: nível da MÉDIA (nunca a nota) e avanço */}
      {comCompetencia.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.competencies', { count: comCompetencia.length })}</h2>
          <div className="space-y-2">
            {comCompetencia.map((grupo, g) => {
              const avanco = formatarValorAvanco(grupo.avancoMedio);
              return (
                <GlassCard key={g} className="border-brand-500/25 bg-brand-500/[0.05] border-l-4 border-l-brand-400">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-white">{grupo.competencia}</p>
                      {grupo.nivelFinal != null && grupo.subiuDeNivel && (
                        <p className="text-sm text-gray-300 mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap">
                          <b className="text-white">{t('level', { n: grupo.nivelInicial })} → {t('level', { n: grupo.nivelFinal })}</b>
                          <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                            <PartyPopper size={14} /> {t('levelUp')}
                          </span>
                        </p>
                      )}
                      {grupo.nivelFinal != null && !grupo.subiuDeNivel && (
                        <p className="text-sm text-gray-300 mt-1">{t('level', { n: grupo.nivelFinal })}</p>
                      )}
                    </div>
                    {avanco && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase tracking-widest text-gray-400">{t('competencyProgress')}</p>
                        <p className="text-3xl font-extrabold text-brand-300">{avanco}</p>
                      </div>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </section>
      )}

      {/* Descritor a descritor, abrindo com os contadores (contam descritores) */}
      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.descriptor')}</h2>
        <GlassCard className="mb-4 border-brand-500/20 bg-brand-500/[0.03]">
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t('stats.confirmed')} valor={resumo.confirmadas || 0} cor={COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA].tinta} />
            <Stat label={t('stats.partial')} valor={resumo.parciais || 0} cor={COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL].tinta} />
            {/* Relatório anterior a 01/09 ainda pode ter `regressoes`: manteve o patamar, conta como estável. */}
            <Stat label={t('stats.stagnated')} valor={(resumo.estagnacoes || 0) + (resumo.regressoes || 0)} cor="text-gray-400" />
          </div>
        </GlassCard>
        {/* Agrupado por competência: na trilha DUO são duas. Nível e avanço estão
            no destaque acima; aqui só o nome, para não repetir. */}
        {grupos.map((grupo, g) => (
          <div key={g} className="mb-4">
            {grupo.competencia && (
              <p className="text-sm font-bold text-brand-300 mb-2">{grupo.competencia}</p>
            )}
            <div className="space-y-2">
              {grupo.descritores.map((d, i) => {
                const conv = VEREDITO[d.convergencia] || VEREDITO.estagnacao;
                const cor = corTela(d.convergencia);
                const Icon = conv.icon;
                const avanco = formatarAvanco(d.nota_pre, d.nota_pos);
                return (
                  <GlassCard key={i} className={`${cor.borda} ${cor.fundo}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cor.icone}`}>
                        <Icon size={18} className={cor.tinta} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <p className="text-sm font-bold text-white">{descritorParaHumano(d.descritor)}</p>
                          {avanco && (
                            <span className={`text-xs font-bold shrink-0 ${cor.tinta}`}>{avanco}</span>
                          )}
                        </div>
                        <p className={`text-[10px] uppercase mt-1 ${cor.tinta}`}>{t(`classification.${conv.labelKey}`)}</p>
                        {d.antes && d.depois && (
                          <div className="mt-2 text-xs space-y-0.5">
                            <p className="text-gray-500"><span className="text-gray-400">{t('before')}</span> {d.antes}</p>
                            <p className="text-gray-200"><span className="text-brand-400">{t('after')}</span> {d.depois}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Momentos da temporada */}
      {momentos.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.insights')}</h2>
          <div className="space-y-2">
            {momentos.map((m, i) => (
              <GlassCard key={i} className="border-brand-500/15">
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[9px] uppercase text-gray-500">{t('weekShort')}</p>
                    <p className="text-lg font-extrabold text-brand-300">{m.semana}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{descritorParaHumano(m.descritor)}</p>
                    <p className="text-sm text-gray-200 italic">💡 {m.insight}</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Missões práticas */}
      {missoes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.missions')}</h2>
          <div className="space-y-2">
            {missoes.map((m, i) => (
              <GlassCard key={i} className="border-amber-500/15">
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[9px] uppercase text-gray-500">{t('weekShort')}</p>
                    <p className="text-lg font-extrabold text-amber-400">{m.semana}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 uppercase mb-1 tracking-widest">
                      {m.modo === 'pratica' ? t('mission.real') : t('mission.written')}
                    </p>
                    {m.compromisso && (
                      <p className="text-xs text-gray-200 mb-1"><span className="text-amber-400">{t('mission.commitment')}</span> {m.compromisso}</p>
                    )}
                    {m.sintese && (
                      <p className="text-xs text-gray-400"><span className="text-gray-500">{t('mission.synthesis')}</span> {m.sintese}</p>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Cenário e resposta da avaliação final (a devolutiva abre a tela) */}
      {(sem14?.cenario || sem14?.resposta) && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.finalAssessment')}</h2>
          <GlassCard className="border-purple-500/20 bg-purple-500/[0.03]">
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-purple-400" />
              <span className="text-xs uppercase text-purple-400 font-bold tracking-widest">{t('final.cardTitle')}</span>
            </div>
            {sem14.cenario && (
              <details className="mb-3">
                <summary className="text-xs text-brand-400 cursor-pointer">{t('final.viewScenario')}</summary>
                <div className="prose prose-invert prose-sm max-w-none mt-2 text-xs text-gray-300">
                  <ReactMarkdown>{sem14.cenario}</ReactMarkdown>
                </div>
              </details>
            )}
            {sem14.resposta && (
              <details>
                <summary className="text-xs text-brand-400 cursor-pointer">{t('final.viewAnswer')}</summary>
                <p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap border-l-2 border-brand-500/30 pl-3">{sem14.resposta}</p>
              </details>
            )}
          </GlassCard>
        </section>
      )}

      {/* Próximos passos */}
      {evolutionReport?.proximo_passo && (
        <GlassCard className="border-emerald-500/20 bg-emerald-500/[0.03] mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-xs uppercase text-emerald-400 font-bold tracking-widest">{t('sections.nextSteps')}</span>
          </div>
          <p className="text-sm text-gray-200">{evolutionReport.proximo_passo}</p>
        </GlassCard>
      )}

      {/* Mensagem final */}
      {evolutionReport?.insight_geral && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-brand-400" />
            <h2 className="text-xs uppercase tracking-widest text-gray-400">{t('sections.finalMessage')}</h2>
          </div>
          <p className="text-sm text-gray-200 italic border-l-2 border-brand-500/50 pl-3">{evolutionReport.insight_geral}</p>
        </section>
      )}
    </>
  );
}

function Stat({ label, valor, cor }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}
