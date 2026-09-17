'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { TrendingUp, ChevronDown, ChevronRight, X, FileDown, PartyPopper } from 'lucide-react';
import { loadEvolutionReportsEmpresa } from '@/actions/evolution-report';
import BackButton from '@/components/back-button';
import AdminPageHeader from '@/components/admin/page-header';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { rotuloConvergencia, qualitativaSustenta, formatarAvanco, formatarValorAvanco, CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';
import { COR_VEREDITO_TELA } from '@/lib/season-engine/convergencia-cores';
import { normalizarResumoAvaliacao } from '@/lib/season-engine/resumo-avaliacao';
import { descritorParaHumano } from '@/lib/descritor-humano';

/**
 * Os vereditos que a régua PRODUZ (`lib/season-engine/convergencia.ts`).
 *
 * 🔴 `regressao` saiu daqui em 14/09/2026. O veredito foi removido da régua em
 * 01/09 por decisão do dono do produto (ninguém desaprende uma competência:
 * queda entre o diagnóstico e o fechamento é variação do instrumento, e entra
 * em "Estável"), mas a tela seguiu mostrando o card e a coluna. `Medido:` 234
 * descritores com veredito em toda a base, ZERO com `regressao`. Era um número
 * que não podia sair de 0, ocupando um quarto do resumo.
 */
// Cores pela paleta única do veredito (`convergencia-cores`).
const CONV = {
  evolucao_confirmada: COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA],
  evolucao_parcial: COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL],
  estagnacao: COR_VEREDITO_TELA[CONVERGENCIA.ESTAVEL],
};

export default function EvolucaoAdminPage() {
  const t = useTranslations('AdminEvolution');
  // Contexto de empresa unificado (path → ?empresa= → filtro do header)
  const { empresaId } = useEmpresaContexto();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  // O relatório INTEIRO de cada pessoa já vem no payload da lista
  // (`loadEvolutionReportsEmpresa` seleciona `evolution_report`), então abrir o
  // detalhe é estado de tela: nenhuma ida ao banco, nenhum spinner.
  const [trilhaAberta, setTrilhaAberta] = useState(null);

  useEffect(() => {
    (async () => {
      if (!empresaId) { setLoading(false); return; }
      setLoading(true);
      const r = await loadEvolutionReportsEmpresa(empresaId);
      setData(r);
      setLoading(false);
    })();
  }, [empresaId]);

  if (loading) return <Center>{t('loading')}</Center>;
  if (!empresaId) return <Center>{t('missingCompanyParam')}</Center>;
  if (!data?.success || data.total === 0) {
    return (
      <Wrapper>
        <Header total={0} />
        <div className="text-center py-16 text-gray-500 text-sm">
          {t('empty.title')}<br />
          {t('empty.description')}
        </div>
      </Wrapper>
    );
  }

  const competencias = Object.keys(data.por_competencia);

  return (
    <Wrapper>
      <Header total={data.total} />

      {/* Resumo geral (agregado) */}
      <ResumoGeral porCompetencia={data.por_competencia} />

      {/* Por competência + descritor */}
      <div className="space-y-4">
        {competencias.map(comp => (
          <CompetenciaCard key={comp}
            nome={comp}
            descritores={data.por_competencia[comp]}
            expanded={expanded === comp}
            onToggle={() => setExpanded(expanded === comp ? null : comp)} />
        ))}
      </div>

      {/* Lista de colabs */}
      <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm uppercase text-gray-400">{t('evaluatedCollaborators', { count: data.trilhas.length })}</h2>
        {/* Link, não fetch: a rota autentica por cookie e devolve
            `Content-Disposition: attachment`, então o browser baixa sozinho. */}
        <a
          href={`/api/relatorios/evolucao/pdf?empresa=${encodeURIComponent(empresaId)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200 transition-colors hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          <FileDown size={12} aria-hidden="true" /> {t('consolidatedPdf')}
        </a>
      </div>
        <div className="grid md:grid-cols-2 gap-3">
          {data.trilhas.map(t => (
            <ColabRow key={t.id} trilha={t} onAbrir={() => setTrilhaAberta(t)} />
          ))}
        </div>
      </div>

      {trilhaAberta && <DetalheDaPessoa trilha={trilhaAberta} onClose={() => setTrilhaAberta(null)} />}
    </Wrapper>
  );
}

function Wrapper({ children }) {
  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">{children}</div>
    </div>
  );
}

function Center({ children }) {
  return <Wrapper><div className="text-center py-16 text-gray-400 text-sm">{children}</div></Wrapper>;
}

function Header({ total }) {
  const t = useTranslations('AdminEvolution');
  return (
    <>
      <BackButton />
      <AdminPageHeader icon={TrendingUp} title={t('title')} subtitle={t('subtitle', { count: total })} />
    </>
  );
}

function ResumoGeral({ porCompetencia }: { porCompetencia: any }) {
  const t = useTranslations('AdminEvolution');
  const stats: Record<string, number> = Object.fromEntries(Object.keys(CONV).map((k) => [k, 0]));
  for (const comp of Object.values(porCompetencia) as any[]) {
    for (const d of Object.values(comp) as any[]) {
      for (const k of Object.keys(stats)) stats[k] += d[k] || 0;
    }
  }
  const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0) || 1;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {Object.entries(CONV).map(([k, c]: [string, any]) => (
        <div key={k} className={`rounded-xl p-4 border ${c.fundo} ${c.borda}`}>
          <div className={`text-2xl font-bold ${c.tinta}`}>{stats[k]}</div>
          <div className="text-xs text-gray-400 mt-1">{t(`statuses.${k}`)}</div>
          <div className="text-[10px] text-gray-500">{Math.round(stats[k] / total * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

function CompetenciaCard({ nome, descritores, expanded, onToggle }: { nome?: any; descritores: any; expanded?: any; onToggle?: any }) {
  const t = useTranslations('AdminEvolution');
  const descs = Object.entries(descritores) as [string, any][];
  const totalAvaliacoes = descs.reduce((sum: number, [, d]: [string, any]) => sum + (d.evolucao_confirmada + d.evolucao_parcial + d.estagnacao), 0);

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-cyan-400">{nome}</div>
          <div className="text-[11px] text-gray-500">{t('descriptorSummary', { descriptors: descs.length, evaluations: totalAvaliacoes })}</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-2">
          {descs.map(([desc, d]: [string, any]) => {
            const total = d.evolucao_confirmada + d.evolucao_parcial + d.estagnacao;
            return (
              <div key={desc} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">{desc}</span>
                  {d.media_pre != null && d.media_pos != null && (
                    <span className="text-[10px] text-gray-400">
                      {t('average')}: {d.media_pre.toFixed(1)} → <span className="text-cyan-400 font-bold">{d.media_pos.toFixed(1)}</span>
                    </span>
                  )}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                  {Object.entries(CONV).map(([k, c]: [string, any]) => {
                    const pct = total > 0 ? (d[k] / total * 100) : 0;
                    return <div key={k} className={c.solido} style={{ width: `${pct}%` }} title={`${t(`statuses.${k}`)}: ${d[k]}`} />;
                  })}
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                  {Object.entries(CONV).map(([k, c]: [string, any]) => (
                    <span key={k} className={c.tinta}>{t(`statuses.${k}`)}: {d[k]}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColabRow({ trilha, onAbrir }) {
  const locale = useLocale();
  const t = useTranslations('AdminEvolution');
  const resumo = trilha.evolution_report?.resumo || {};
  const grupos = agruparPorCompetencia(trilha.evolution_report?.descritores);
  const nome = trilha.colab?.nome_completo || '—';
  return (
    // `button`, não `div` com onClick: o card abre o relatório de uma pessoa, e
    // quem navega por teclado precisa chegar nele e acioná-lo.
    <button
      type="button"
      onClick={onAbrir}
      aria-label={t('detail.open', { name: nome })}
      className="w-full p-3 text-left rounded-lg bg-white/5 border border-white/10 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-white">{nome}</div>
        <span className="text-[10px] text-gray-500 shrink-0">{new Date(trilha.evolution_generated_at).toLocaleDateString(locale)}</span>
      </div>
      <div className="text-[11px] text-gray-400">{trilha.colab?.cargo}</div>
      {/* Uma linha POR competência, com o nível e o parabéns quando subiu
          (16/09/2026: o card citava só a competência foco e não dizia se o
          nível subiu). Nível da MÉDIA da competência, que nunca cai. */}
      <div className="mt-0.5 mb-2 space-y-0.5">
        {(grupos.length ? grupos : [{ competencia: trilha.competencia_foco, nivelFinal: null } as any]).map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-gray-400">
            <span>{g.competencia || trilha.competencia_foco}</span>
            {g.nivelFinal != null && (g.subiuDeNivel ? (
              <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                · {t('level', { n: g.nivelInicial })} → {t('level', { n: g.nivelFinal })} <PartyPopper size={11} aria-hidden="true" /> {t('levelUp')}
              </span>
            ) : (
              <span className="text-gray-500">· {t('level', { n: g.nivelFinal })}</span>
            ))}
          </div>
        ))}
      </div>
      {/* Símbolo sozinho não se explica, e o card é a primeira coisa que se lê
          nesta tela: o rótulo do veredito vai ao lado, com a palavra da régua. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span className={COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA].tinta}>✓ {resumo.confirmadas || 0} {t('statuses.evolucao_confirmada')}</span>
        <span className={COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL].tinta}>~ {resumo.parciais || 0} {t('statuses.evolucao_parcial')}</span>
        <span className="text-gray-400">= {resumo.estagnacoes || 0} {t('statuses.estagnacao')}</span>
        <span className="ml-auto text-cyan-300">{t('detail.cta')}</span>
      </div>
    </button>
  );
}

/** Cores por veredito, para o detalhe. Mesmas famílias do resumo agregado. */
const TINTA_VEREDITO = {
  evolucao_confirmada: COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA],
  evolucao_parcial: COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL],
  estagnacao: { borda: 'border-white/10', fundo: 'bg-white/[0.03]', tinta: 'text-gray-300' },
};

/**
 * O relatório de UMA pessoa, descritor a descritor.
 *
 * A tela mostrava só os contadores, e a pergunta que eles levantam ("4 parciais
 * em quê?") não tinha resposta em lugar nenhum do /admin: era preciso entrar no
 * painel do gestor do tenant, ou gerar o PDF. O dado já estava no payload.
 */
/**
 * Cabeçalho de uma competência no detalhe: nível da média (N1 → N2 com parabéns
 * quando subiu; nunca cai) e avanço médio dos descritores exibidos. Mesma função
 * (`agruparPorCompetencia`) do PDF e da tela da pessoa.
 */
function CabecalhoCompetencia({ grupo, t }) {
  if (!grupo.competencia) return null;
  const avanco = formatarValorAvanco(grupo.avancoMedio);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 pt-1">
      <div>
        <p className="text-xs font-bold text-cyan-300">{grupo.competencia}</p>
        {grupo.nivelFinal != null && (grupo.subiuDeNivel ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-amber-300">
            {t('level', { n: grupo.nivelInicial })} → {t('level', { n: grupo.nivelFinal })} <PartyPopper size={12} aria-hidden="true" /> {t('levelUp')}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-gray-400">{t('level', { n: grupo.nivelFinal })}</p>
        ))}
      </div>
      {avanco && (
        <span className="text-[11px] text-gray-400">{t('competencyProgress')} <b className="text-cyan-300">{avanco}</b></span>
      )}
    </div>
  );
}

function DetalheDaPessoa({ trilha, onClose }) {
  const locale = useLocale();
  const t = useTranslations('AdminEvolution');
  const report = trilha.evolution_report || {};
  const descritores = Array.isArray(report.descritores) ? report.descritores : [];
  const resumoAvaliacao = normalizarResumoAvaliacao(report.resumo_avaliacao);

  // Esc fecha. Sem isto, um overlay sem borda de scroll prende quem abriu por
  // teclado, que é justamente quem não vai clicar no fundo.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onClose(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  return (
    // 🔴 Quem ROLA é o painel, não o fundo. Com `overflow-y-auto` no backdrop, o
    // cabeçalho `sticky` para na borda de conteúdo do container e o padding dele
    // (`p-2 md:p-6`) vira uma faixa por onde o texto do relatório aparece ACIMA
    // do nome da pessoa, cortado. Visto no harness, em 14/09/2026.
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/80 p-2 backdrop-blur-sm md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t('detail.title', { name: trilha.colab?.nome_completo || '' })}
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-3xl overflow-y-auto overscroll-contain rounded-[24px] border border-white/[0.1] bg-[#071829] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-[24px] border-b border-white/[0.08] bg-[#071829] p-4 md:px-6">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300">{t('detail.eyebrow')}</p>
            <h2
              className="mt-0.5 truncate text-xl text-white"
              style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
            >
              {trilha.colab?.nome_completo || '—'}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {trilha.colab?.email && (
              <a
                href={`/api/temporada/concluida/pdf?email=${encodeURIComponent(trilha.colab.email)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200 transition-colors hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <FileDown size={12} aria-hidden="true" /> {t('detail.pdf')}
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('detail.close')}
              className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5 md:px-6">
          <section className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <span className="text-gray-400">{trilha.colab?.cargo || '—'}</span>
            <span className="text-gray-400">
              {t('detail.competency')}: <span className="text-cyan-300">{trilha.competencia_foco || '—'}</span>
            </span>
            {/* A nota média do fechamento saiu do cabeçalho (decisão do dono,
                14/09/2026): número absoluto numa régua de 4, sem a régua ao
                lado, não diz o que a pessoa desenvolveu e convida a comparar
                gente por um ponto de partida que ninguém escolheu. O que fica é
                o avanço por descritor e o veredito. */}
            <span className="text-gray-500">
              {t('detail.generatedAt')} {new Date(trilha.evolution_generated_at).toLocaleDateString(locale)}
            </span>
          </section>

          {report.insight_geral && (
            <section>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-cyan-400">{t('detail.insight')}</p>
              <p className="border-l-2 border-cyan-500/40 pl-3 text-xs italic leading-relaxed text-gray-200">{report.insight_geral}</p>
            </section>
          )}

          {resumoAvaliacao && (
            <section>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-gray-500">{t('detail.closingSummary')}</p>
              <p className="text-xs leading-relaxed text-gray-200">{resumoAvaliacao.mensagem}</p>
              {resumoAvaliacao.avanco && (
                <p className="mt-2 text-xs text-gray-300">
                  <span className="font-bold text-emerald-300">{t('detail.mainAdvance')}: </span>{resumoAvaliacao.avanco}
                </p>
              )}
              {resumoAvaliacao.atencao && (
                <p className="mt-1 text-xs text-gray-300">
                  <span className="font-bold text-amber-300">{t('detail.attention')}: </span>{resumoAvaliacao.atencao}
                </p>
              )}
              {resumoAvaliacao.evidencias.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {resumoAvaliacao.evidencias.map((evidencia, i) => (
                    <li key={i} className="border-l border-white/15 pl-2 text-[11px] italic text-gray-400">{evidencia}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-gray-500">{t('detail.byDescriptor')}</p>
            {descritores.length === 0 ? (
              <p className="text-xs text-gray-500">{t('detail.noDescriptors')}</p>
            ) : (
              <div className="space-y-2">
                {agruparPorCompetencia(descritores).map((grupo, g) => (
                  <div key={g} className="space-y-2">
                    <CabecalhoCompetencia grupo={grupo} t={t} />
                    {grupo.descritores.map((d, i) => {
                      const cfg = TINTA_VEREDITO[d.convergencia] || TINTA_VEREDITO.estagnacao;
                      const avanco = formatarAvanco(d.nota_pre, d.nota_pos);
                      return (
                        <div key={i} className={`rounded-lg border p-3 ${cfg.borda} ${cfg.fundo}`}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-xs font-bold text-white">{descritorParaHumano(d.descritor)}</p>
                            {/* Só o AVANÇO e o veredito. O par "2,0 → 2,3" saiu, e o
                                avanço tem piso em zero: a régua não afirma queda. */}
                            <span className={`shrink-0 text-[11px] font-bold ${cfg.tinta}`}>
                              {avanco && <>{avanco} · </>}
                              {rotuloConvergencia(d.convergencia)}
                            </span>
                          </div>
                          {/* Evidência fraca: a conversa não tocou neste descritor, então
                              o "Antes/Depois" abaixo tem pouca base. Informação para quem
                              lê; o veredito é só pelo avanço desde 17/09/2026. */}
                          {!qualitativaSustenta(d) && (
                            <p className="mt-1 text-[10px] text-amber-200/70">{t('detail.weakEvidence')}</p>
                          )}
                          {d.antes && (
                            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                              <span className="font-bold text-gray-500">{t('detail.before')}: </span>{d.antes}
                            </p>
                          )}
                          {d.depois && (
                            <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
                              <span className="font-bold text-gray-500">{t('detail.after')}: </span>{d.depois}
                            </p>
                          )}
                          {d.justificativa_cenario && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-300">
                                {t('detail.justification')}
                              </summary>
                              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{d.justificativa_cenario}</p>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>

          {report.proximo_passo && (
            <section>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-emerald-400">{t('detail.nextStep')}</p>
              <p className="text-xs leading-relaxed text-gray-200">{report.proximo_passo}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
