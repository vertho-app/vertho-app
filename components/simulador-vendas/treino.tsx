'use client';
import { VENDAS_SESSAO } from '@/lib/status';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Send, RotateCcw } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { PageContainer, PageHero } from '@/components/page-shell';
import {
  FASES,
  RETENCAO_MESES,
  type Comando,
  type Config,
  type Estado,
} from '@/lib/simulador-vendas/schema';
import type { SessaoPublica } from '@/lib/simulador-vendas/core';
import type { ResumoTreino } from '@/lib/simulador-vendas/historico';
import { formatarNotaPace } from '@/lib/simulador-vendas/nota';
import {
  comporPlano,
  MAXIMO_POR_RESPOSTA,
  MINIMO_RESPOSTAS_PLANO,
  PERGUNTAS_PLANO,
  respostasValidas,
  respostasVazias,
} from '@/lib/simulador-vendas/plano-guiado';
import { evolucaoPorCompetencia, treinosComNiveis } from '@/lib/simulador-vendas/evolucao';
import Relatorio from './relatorio';
import Avaliacao from './avaliacao';
import Gestao from './gestao';
import Configuracao from './configuracao';
import Processamento from './processamento';
import Ditado from './ditado';
import styles from './treino.module.css';

type Dados = {
  empresaId: string;
  empresaNome: string;
  habilitado: boolean;
  configurado: boolean;
  admin: boolean;
  podeTreinar: boolean;
  podeConfigurar: boolean;
  podeVerEquipe: boolean;
  /** Gestor e RH: acompanham a equipe e não treinam (17/09/2026). */
  soAcompanha: boolean;
  config?: Config | null;
  sessao: SessaoPublica | null;
  prazo: { inicio: string | null; fim: string | null; vigente: boolean };
  historico: ResumoTreino[];
  proximoCursor: string | null;
};
type Feedback = NonNullable<Estado['feedback']>;
const feedbackVazio: Feedback = {
  realismo: 0,
  desafio: 0,
  interacao: 0,
  utilidade: 0,
  aprendizado: 0,
  comentario: '',
};

export default function TreinoVendas({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  const empresaUrl = useSearchParams().get('empresa');
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string; slug: string }>>([]);
  const [empresaId, setEmpresaId] = useState(''),
    [dados, setDados] = useState<Dados | null>(null);
  const [sessao, setSessao] = useState<SessaoPublica | null>(null),
    [nivel, setNivel] = useState<1 | 2 | 3>(1);
  const [aba, setAba] = useState<'treino' | 'config' | 'gestao'>('treino');
  const [carregando, setCarregando] = useState(true),
    [ocupado, setOcupado] = useState(''),
    [erro, setErro] = useState('');
  const [respostas, setRespostas] = useState<string[]>(respostasVazias);
  const [texto, setTexto] = useState(''),
    [confirmar, setConfirmar] = useState<'encerrar' | 'abandonar' | null>(null),
    [feedback, setFeedback] = useState(feedbackVazio);
  const pending = useRef<{ key: string; id: string } | null>(null),
    running = useRef(false),
    generation = useRef(0),
    leitura = useRef(0);
  const fim = useRef<HTMLDivElement>(null);
  const data = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  async function api(url: string, init?: RequestInit) {
    const response = await fetchAuth(url, { ...init, cache: 'no-store' }),
      body = await response.json();
    if (!response.ok) throw new Error(body.error || t('genericError'));
    return body;
  }
  function params(id = empresaId, sessaoId?: string) {
    const q = new URLSearchParams();
    if (admin && id) q.set('empresaId', id);
    if (sessaoId) q.set('sessaoId', sessaoId);
    return q;
  }
  async function carregar(id = empresaId, sessaoId?: string, ticket = generation.current) {
    const request = ++leitura.current;
    const d: Dados = await api('/api/simulador-vendas?' + params(id, sessaoId));
    if (ticket !== generation.current || request !== leitura.current) return;
    setDados((prev) => {
      if (!prev || prev.empresaId !== d.empresaId || prev.historico.length <= 30) return d;
      const ids = new Set(d.historico.map((h) => h.id));
      return {
        ...d,
        historico: [...d.historico, ...prev.historico.filter((h) => !ids.has(h.id))],
        proximoCursor: prev.proximoCursor,
      };
    });
    setSessao(d.sessao);
    setFeedback(d.sessao?.feedback || feedbackVazio);
  }
  // Rascunho do plano na aba (sessionStorage): seis respostas não se perdem num
  // recarregamento, e não ficam no aparelho depois de fechar a aba.
  const chaveRascunho = sessao?.id ? `vertho:pace-plano:${sessao.id}` : '';
  useEffect(() => {
    if (!chaveRascunho || !sessao?.planejamentoPendente) return;
    try {
      const salvo: unknown = JSON.parse(sessionStorage.getItem(chaveRascunho) || 'null');
      if (Array.isArray(salvo) && salvo.length === PERGUNTAS_PLANO)
        setRespostas(salvo.map((v) => (typeof v === 'string' ? v.slice(0, MAXIMO_POR_RESPOSTA) : '')));
    } catch {
      // Sem armazenamento da aba: o formulário funciona sem rascunho.
    }
  }, [chaveRascunho, sessao?.planejamentoPendente]);
  function responderPergunta(i: number, valor: string) {
    setRespostas((prev) => {
      const next = prev.map((v, j) => (j === i ? valor : v));
      try {
        if (chaveRascunho) sessionStorage.setItem(chaveRascunho, JSON.stringify(next));
      } catch {
        // Idem: rascunho é conveniência.
      }
      return next;
    });
  }
  const titulosPlano = Array.from({ length: PERGUNTAS_PLANO }, (_, i) => t(`planningField${i + 1}`));
  useEffect(() => {
    let alive = true;
    if (admin)
      api('/api/simulador-vendas/config')
        .then((d) => {
          if (alive) setEmpresas(d.empresas);
        })
        .catch((e) => {
          if (alive) setErro(e.message);
        })
        .finally(() => {
          if (alive) setCarregando(false);
        });
    return () => {
      alive = false;
      generation.current++;
    };
  }, [admin]);
  useEffect(() => {
    if (admin && empresaUrl && empresas.some((e) => e.id === empresaUrl)) setEmpresaId(empresaUrl);
  }, [admin, empresaUrl, empresas]);
  useEffect(() => {
    const ticket = ++generation.current;
    // O contexto novo é dono da ocupação. O finally de uma resposta antiga não pode limpá-lo.
    running.current = false;
    setOcupado('');
    setDados(null);
    setSessao(null);
    setTexto('');
    setRespostas(respostasVazias());
    pending.current = null;
    setConfirmar(null);
    setAba('treino');
    setErro('');
    if (admin && !empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    carregar(empresaId, undefined, ticket)
      .catch((e) => {
        if (ticket === generation.current) setErro(e.message);
      })
      .finally(() => {
        if (ticket === generation.current) setCarregando(false);
      });
  }, [admin, empresaId]);
  useEffect(() => {
    if (!admin && dados?.podeVerEquipe && !dados.podeTreinar) setAba('gestao');
  }, [dados?.podeVerEquipe, dados?.podeTreinar, admin]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [sessao?.mensagens.length, ocupado]);
  useEffect(() => {
    if (!sessao?.processando || ocupado) return;
    const ticket = generation.current;
    const timer = window.setInterval(() => {
      void carregar(empresaId, sessao.id, ticket).catch((e) => {
        if (ticket === generation.current) setErro(e.message);
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [sessao?.id, sessao?.processando, ocupado, empresaId]);
  async function agir(acao: Comando['acao']) {
    if (
      running.current ||
      (acao === 'responder' && !texto.trim()) ||
      (acao === 'planejar' && respostasValidas(respostas) < MINIMO_RESPOSTAS_PLANO)
    )
      return;
    const ticket = generation.current;
    running.current = true;
    setOcupado(acao);
    setErro('');
    setConfirmar(null);
    const conteudo =
      acao === 'planejar'
        ? { planejamento: comporPlano(respostas, titulosPlano) }
        : acao === 'responder'
          ? { mensagem: texto.trim() }
          : acao === 'feedback'
            ? { feedback }
            : acao === 'iniciar'
              ? {
                  nivel: sessao?.status === VENDAS_SESSAO.PREPARANDO ? sessao.nivel : nivel,
                }
              : {};
    const key = JSON.stringify([empresaId, acao, acao === 'iniciar' ? null : sessao?.id, conteudo]);
    if (!pending.current || pending.current.key !== key)
      pending.current = {
        key,
        id:
          acao === 'iniciar' && sessao?.status === VENDAS_SESSAO.PREPARANDO
            ? sessao.id
            : crypto.randomUUID(),
      };
    const body = {
      acao,
      ...conteudo,
      requestId: pending.current.id,
      ...(admin ? { empresaId } : {}),
      ...(acao !== 'iniciar' ? { sessaoId: sessao?.id, revisao: sessao?.revisao } : {}),
    };
    try {
      const d = await api('/api/simulador-vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (ticket !== generation.current) return;
      setSessao(d.sessao);
      pending.current = null;
      if (acao === 'responder' || acao === 'iniciar') setTexto('');
      if (acao === 'iniciar') setRespostas(respostasVazias());
      if (acao === 'planejar' && chaveRascunho)
        try {
          sessionStorage.removeItem(chaveRascunho);
        } catch {
          // O rascunho expira com a aba.
        }
      await carregar(empresaId, d.sessao.id, ticket).catch(() => {
        if (ticket === generation.current) setErro(t('savedRefresh'));
      });
    } catch (e) {
      if (ticket === generation.current) {
        setErro(e instanceof Error ? e.message : t('genericError'));
        await carregar(empresaId, sessao?.id, ticket).catch(() => {});
      }
    } finally {
      if (ticket === generation.current) {
        running.current = false;
        setOcupado('');
      }
    }
  }
  async function abrir(id: string) {
    if (running.current) return;
    const ticket = ++generation.current;
    running.current = true;
    setOcupado('historico');
    setErro('');
    try {
      await carregar(empresaId, id, ticket);
      if (ticket === generation.current) {
        setTexto('');
        setRespostas(respostasVazias());
        pending.current = null;
        setConfirmar(null);
      }
    } catch (e) {
      if (ticket === generation.current)
        setErro(e instanceof Error ? e.message : t('genericError'));
    } finally {
      if (ticket === generation.current) {
        running.current = false;
        setOcupado('');
      }
    }
  }
  async function maisHistorico() {
    if (running.current || !dados?.proximoCursor) return;
    const ticket = generation.current;
    running.current = true;
    setOcupado('historico');
    setErro('');
    try {
      const q = params();
      q.set('historico', '1');
      q.set('cursor', dados.proximoCursor);
      const d: { historico: ResumoTreino[]; proximoCursor: string | null } = await api(
        '/api/simulador-vendas?' + q,
      );
      if (ticket === generation.current)
        setDados((prev) =>
          prev
            ? {
                ...prev,
                historico: [
                  ...prev.historico,
                  ...d.historico.filter((h) => !prev.historico.some((p) => p.id === h.id)),
                ],
                proximoCursor: d.proximoCursor,
              }
            : prev,
        );
    } catch (e) {
      if (ticket === generation.current)
        setErro(e instanceof Error ? e.message : t('genericError'));
    } finally {
      if (ticket === generation.current) {
        running.current = false;
        setOcupado('');
      }
    }
  }
  const travado = !!ocupado || sessao?.processando === true;
  const aberto = sessao?.status === VENDAS_SESSAO.EM_ANDAMENTO,
    preparando = sessao?.status === VENDAS_SESSAO.PREPARANDO;
  const temTreinoAberto = !!(
    aberto ||
    preparando ||
    dados?.historico.some((h) =>
      [VENDAS_SESSAO.EM_ANDAMENTO, VENDAS_SESSAO.PREPARANDO].some((status) => status === h.status),
    )
  );
  const podeNovo = !temTreinoAberto;
  // Descartar (18/09/2026): só antes da primeira fala do vendedor (cenário que
  // não serviu, preparação travada). Depois dela, conclui-se e recebe a devolutiva.
  const podeDescartar =
    !!sessao &&
    (aberto || preparando) &&
    !sessao.mensagens.some((m) => m.autor === 'vendedor') &&
    !!dados?.podeTreinar;
  // No celular, com treino em curso, a conversa vem antes do histórico.
  const chatPrimeiro = aberto || preparando;
  const evolucao =
    dados && treinosComNiveis(dados.historico) >= 2 ? evolucaoPorCompetencia(dados.historico) : null;
  const focoSugerido = dados?.historico.find((h) => h.foco)?.foco || null;
  const respondidas = respostasValidas(respostas);
  const terminou =
    sessao &&
    [VENDAS_SESSAO.CONCLUIDA, VENDAS_SESSAO.INTERROMPIDA].some(
      (status) => status === sessao.status,
    );
  return (
    <PageContainer className={styles.root}>
      <PageHero
        showBack={false}
        eyebrow={t('eyebrow')}
        title={t('title')}
        titleAccent={t('titleAccent')}
        subtitle={t('subtitle')}
      />
      {admin && (
        <div className={styles.admin}>
          <label>
            {t('company')}
            <select
              value={empresaId}
              disabled={travado}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">{t('selectCompany')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          {dados && <p className={styles.muted}>{t(dados.habilitado ? 'enabled' : 'adminOnly')}</p>}
        </div>
      )}
      {dados && (admin || dados.podeVerEquipe) && (
        <nav aria-label={t('areas')} className={styles.tabs}>
          {/* Gestor e RH acompanham a equipe e não treinam (17/09/2026). */}
          {(admin || !dados.soAcompanha) && (
            <button
              className={aba === 'treino' ? styles.tabActive : undefined}
              disabled={travado}
              aria-current={aba === 'treino' ? 'page' : undefined}
              onClick={() => setAba('treino')}
            >
              {t('trainTab')}
            </button>
          )}
          {dados.podeConfigurar && (
            <button
              className={aba === 'config' ? styles.tabActive : undefined}
              disabled={travado}
              aria-current={aba === 'config' ? 'page' : undefined}
              onClick={() => setAba('config')}
            >
              {t('configTab')}
            </button>
          )}
          {dados.podeVerEquipe && (
            <button
              className={aba === 'gestao' ? styles.tabActive : undefined}
              disabled={travado}
              aria-current={aba === 'gestao' ? 'page' : undefined}
              onClick={() => setAba('gestao')}
            >
              {t('teamTab')}
            </button>
          )}
        </nav>
      )}
      {erro && (
        <div role="alert" className={styles.error}>
          <p className="flex-1">{erro}</p>
          {dados && (
            <button
              disabled={!!ocupado}
              onClick={() =>
                void carregar(empresaId, sessao?.id)
                  .then(() => setErro(''))
                  .catch((e) => setErro(e.message))
              }
            >
              <RotateCcw size={15} />
              {t('refresh')}
            </button>
          )}
        </div>
      )}
      {carregando ? (
        <div role="status" className={styles.empty}>
          {t('loading')}
        </div>
      ) : !dados ? (
        <div className={styles.empty}>{t(admin && !empresaId ? 'selectFirst' : 'unavailable')}</div>
      ) : aba === 'config' ? (
        <Configuracao
          key={dados.empresaId + ':' + (dados.config?.revisao ?? 0)}
          empresaId={dados.empresaId}
          config={dados.config || null}
          onSalvou={async () => {
            await carregar(empresaId, sessao?.id);
          }}
        />
      ) : aba === 'gestao' ? (
        <Gestao key={dados.empresaId} empresaId={dados.empresaId} />
      ) : (
        <>
          {!dados.configurado && (
            <div className={styles.card}>
              <h2 className="text-lg mb-2">{t('prepareTitle')}</h2>
              <p className={styles.muted}>{t('prepareDescription')}</p>
              {dados.podeConfigurar && (
                <button className="mt-4" onClick={() => setAba('config')}>
                  {t('configureBrief')}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
          {!admin && (
            <div className={`${styles.card} mb-4`}>
              <p className={styles.muted}>
                {dados.prazo.vigente && dados.prazo.inicio && dados.prazo.fim
                  ? t('periodNotice', {
                      start: data(dados.prazo.inicio),
                      end: data(dados.prazo.fim),
                    })
                  : t('periodClosed')}
              </p>
            </div>
          )}
          <div className={`${styles.workspace} ${chatPrimeiro ? styles.chatPrimeiro : ''} mt-5`}>
            <aside className={styles.card}>
              <div className={styles.fichaAside}>
                <h2 className="text-lg mb-3">
                  {t(sessao?.cenario ? 'beforeChat' : 'nextChallenge')}
                </h2>
                {sessao?.cenario && (
                  <>
                    <p className="font-semibold">{sessao.cenario.nome}</p>
                    <p className={styles.muted}>
                      {sessao.cenario.cargo} · {sessao.cenario.empresa}
                    </p>
                    <p className="text-sm leading-relaxed my-4 whitespace-pre-wrap">
                      {sessao.cenario.contexto}
                    </p>
                  </>
                )}
              </div>
              {podeNovo && (
                <>
                  {focoSugerido && (
                    <p className={styles.focus}>
                      <span>{t('suggestedFocus')}</span>
                      <strong>{focoSugerido}</strong>
                    </p>
                  )}
                  <label>
                    {t('level')}
                    <select
                      value={nivel}
                      disabled={travado}
                      onChange={(e) => setNivel(Number(e.target.value) as 1 | 2 | 3)}
                    >
                      {([1, 2, 3] as const).map((n) => (
                        <option key={n} value={n}>
                          {t(`level${n}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={`${styles.muted} my-3`}>{t('levelHelp')}</p>
                  <button
                    className={styles.primary}
                    disabled={travado || !dados.configurado || !dados.podeTreinar}
                    onClick={() => void agir('iniciar')}
                  >
                    {t(dados.historico.length ? 'newSimulation' : 'start')}
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
              {sessao && (
                <p className={`${styles.muted} mt-4`}>
                  {t(`level${sessao.nivel}`)} · {t(`status_${sessao.status}`)}
                </p>
              )}
              {temTreinoAberto && (
                <div className={styles.newSimulationLocked}>
                  <button className={styles.newSimulationButton} disabled>
                    {t('newSimulation')}
                    <ArrowRight size={16} />
                  </button>
                  <p className={styles.muted}>{t('newSimulationLocked')}</p>
                </div>
              )}
              {evolucao && (
                <section aria-labelledby="pace-evolucao" className={styles.evolution}>
                  <h3 id="pace-evolucao">{t('evolutionTitle')}</h3>
                  <p className={styles.muted}>{t('evolutionHelp')}</p>
                  <ul>
                    {evolucao.map((c) => (
                      <li key={c.codigo}>
                        <span>{t(`matrix_${c.codigo}`)}</span>
                        <span className={styles.evolutionLevel}>
                          {c.nivelAlcancado === null
                            ? t('evolutionNone')
                            : t('evolutionLevel', { n: c.nivelAlcancado })}
                          {c.subiu && <em>{t('evolutionUp')}</em>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {dados.historico.length > 0 && (
                <nav aria-label={t('history')} className={styles.history}>
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {t('history')}
                  </h3>
                  {dados.historico.map((h) => (
                    <button
                      className={`${styles.historyItem} ${sessao?.id === h.id ? styles.historyActive : ''}`}
                      aria-current={sessao?.id === h.id ? 'true' : undefined}
                      disabled={travado}
                      key={h.id}
                      onClick={() => void abrir(h.id)}
                    >
                      <span className={styles.historyTitle}>
                        <span>{h.nome || t('preparing')}</span>
                        <span className={styles.historyScore}>
                          {t('score')} {formatarNotaPace(h.nota, locale)}
                        </span>
                      </span>
                      <small className={styles.historyMeta}>
                        <span>
                          {t('historyDifficulty', {
                            level: t(`level${h.nivel}`),
                          })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {new Date(h.criadoEm).toLocaleDateString(locale)} ·{' '}
                          {t(`status_${h.status}`)}
                        </span>
                      </small>
                    </button>
                  ))}
                  {dados.proximoCursor && (
                    <button disabled={travado} onClick={() => void maisHistorico()}>
                      {t('more')}
                    </button>
                  )}
                </nav>
              )}
              <p className={`${styles.muted} mt-5`}>{t('retention', { months: RETENCAO_MESES })}</p>
            </aside>
            <div className={styles.card}>
              <ol aria-label={t('phases')} className={styles.rail}>
                {FASES.map((f, i) => (
                  <li
                    key={f}
                    className={sessao?.fase === f ? styles.phaseActive : undefined}
                    aria-current={sessao?.fase === f ? 'step' : undefined}
                  >
                    <b>{'PACE'[i]}</b>
                    <span>{t(`phase_${f}`)}</span>
                  </li>
                ))}
              </ol>
              {chatPrimeiro && sessao?.cenario && (
                <details className={styles.fichaCelular} open={!!sessao.planejamentoPendente}>
                  <summary>
                    {t('beforeChat')} · {sessao.cenario.nome}
                  </summary>
                  <p className={styles.muted}>
                    {sessao.cenario.cargo} · {sessao.cenario.empresa}
                  </p>
                  <p className="text-sm leading-relaxed mt-3 whitespace-pre-wrap">
                    {sessao.cenario.contexto}
                  </p>
                </details>
              )}
              {sessao?.processando && !ocupado && <Processamento ate={sessao.processandoAte} />}
              {!sessao ? (
                <div className={styles.empty}>
                  <p className="text-lg text-white mb-2">{t('emptyTitle')}</p>
                  <p>{t('emptyDescription')}</p>
                </div>
              ) : (
                <>
                  {preparando && (
                    <div className={styles.empty}>
                      <p>{t('preparing')}</p>
                      {!travado && (
                        <button
                          className="mt-3"
                          disabled={!dados.podeTreinar}
                          onClick={() => void agir('iniciar')}
                        >
                          {t('resume')}
                        </button>
                      )}
                    </div>
                  )}
                  {sessao.aviso && (
                    <p role="status" className="text-sm text-amber-200 mb-4">
                      {sessao.aviso}
                    </p>
                  )}
                  {sessao.dadosMascarados && (
                    <p role="status" className={`${styles.muted} mb-3`}>
                      {t('piiApplied')}
                    </p>
                  )}
                  {aberto && sessao.planejamentoPendente && (
                    <form
                      className="mb-6 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void agir('planejar');
                      }}
                    >
                      <h2 className="text-lg font-semibold">{t('planningTitle')}</h2>
                      <p className="text-sm text-slate-300">
                        {t('planningHelp', { min: MINIMO_RESPOSTAS_PLANO, total: PERGUNTAS_PLANO })}
                      </p>
                      <fieldset className={styles.plan}>
                        <legend>{t('planningLabel')}</legend>
                        {titulosPlano.map((titulo, i) => (
                          <label key={i}>
                            <span>{titulo}</span>
                            <textarea
                              rows={3}
                              maxLength={MAXIMO_POR_RESPOSTA}
                              value={respostas[i]}
                              disabled={travado || !dados.podeTreinar}
                              onChange={(e) => responderPergunta(i, e.target.value)}
                              placeholder={t(`planningHint${i + 1}`)}
                            />
                          </label>
                        ))}
                      </fieldset>
                      <p className={styles.muted} role="status">
                        {t('planningProgress', {
                          n: respondidas,
                          total: PERGUNTAS_PLANO,
                          min: MINIMO_RESPOSTAS_PLANO,
                        })}
                      </p>
                      <p className={styles.muted}>{t('piiHelp')}</p>
                      <button
                        type="submit"
                        className={styles.primary}
                        disabled={
                          travado || respondidas < MINIMO_RESPOSTAS_PLANO || !dados.podeTreinar
                        }
                      >
                        {ocupado === 'planejar' ? t('planningSaving') : t('planningStart')}
                        <ArrowRight size={16} />
                      </button>
                    </form>
                  )}
                  {sessao.planejamento && (
                    <details className="mb-5 text-sm">
                      <summary className="cursor-pointer">{t('planningSaved')}</summary>
                      <p className="mt-3 whitespace-pre-wrap text-slate-300">
                        {sessao.planejamento}
                      </p>
                    </details>
                  )}
                  {!sessao.planejamentoPendente && (
                    <div
                      className={styles.chat}
                      role="log"
                      aria-label={t('chat')}
                      aria-live="polite"
                    >
                      {aberto && !sessao.planejamentoPendente && sessao.mensagens.length === 0 && (
                        <p className={styles.muted}>
                          {t('openChat', {
                            name: sessao.cenario?.nome || t('client'),
                          })}
                        </p>
                      )}
                      {sessao.mensagens.map((m) => (
                        <article
                          className={`${styles.message} ${m.autor === 'vendedor' ? styles.seller : ''}`}
                          key={m.id}
                          data-author={m.autor}
                        >
                          <small>
                            {m.autor === 'vendedor'
                              ? t('you')
                              : sessao.cenario?.nome || t('client')}{' '}
                            · {t('turn', { n: m.turno })}
                          </small>
                          <p>{m.texto}</p>
                        </article>
                      ))}
                      {ocupado && ['iniciar', 'responder', 'encerrar'].includes(ocupado) && (
                        <p role="status" className="text-sm text-brand-200 flex gap-2 items-center">
                          <Loader2 size={16} className="motion-safe:animate-spin" />
                          {t(
                            ocupado === 'encerrar'
                              ? 'analyzing'
                              : ocupado === 'iniciar'
                                ? 'creating'
                                : 'responding',
                          )}
                        </p>
                      )}
                      <div ref={fim} />
                    </div>
                  )}
                  {aberto && !sessao.planejamentoPendente && (
                    <form
                      className={styles.composer}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void agir('responder');
                      }}
                    >
                      <label htmlFor="pace-mensagem">{t('message')}</label>
                      <textarea
                        id="pace-mensagem"
                        className="mt-2"
                        rows={3}
                        maxLength={4000}
                        value={texto}
                        disabled={travado || !sessao.turnosRestantes || !dados.podeTreinar}
                        onChange={(e) => setTexto(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            if (!travado && dados.podeTreinar && sessao.turnosRestantes)
                              void agir('responder');
                          }
                        }}
                        placeholder={t('messagePlaceholder')}
                      />
                      <div className={styles.actions}>
                        <Ditado
                          disabled={travado || !sessao.turnosRestantes || !dados.podeTreinar}
                          onTexto={(valor) =>
                            setTexto((prev) => (prev + (prev ? ' ' : '') + valor).slice(0, 4000))
                          }
                        />
                        <button
                          className={styles.primary}
                          type="submit"
                          disabled={
                            travado ||
                            !texto.trim() ||
                            !sessao.turnosRestantes ||
                            !dados.podeTreinar
                          }
                        >
                          <Send size={16} />
                          {t('send')}
                        </button>
                      </div>
                      <p className={`${styles.muted} mt-2`}>{t('composerHelp')}</p>
                      <p className={`${styles.muted} mt-2`}>{t('piiHelp')}</p>
                    </form>
                  )}
                  {aberto && !sessao.planejamentoPendente && (
                    <div className="mt-6">
                      <button
                        disabled={travado || !sessao.mensagens.length || !dados.podeTreinar}
                        onClick={() => setConfirmar('encerrar')}
                      >
                        {t('finish')}
                      </button>
                      {sessao.sugerirEncerramento && (
                        <p className={`${styles.muted} mt-2`}>{t('suggestFinish')}</p>
                      )}
                      {!sessao.turnosRestantes && (
                        <p className={`${styles.muted} mt-2`}>{t('turnLimit')}</p>
                      )}
                    </div>
                  )}
                  {podeDescartar && (
                    <div className={styles.discard}>
                      <button disabled={travado} onClick={() => setConfirmar('abandonar')}>
                        {t('discard')}
                      </button>
                      <span className={styles.muted}>{t('discardHelp')}</span>
                    </div>
                  )}
                  {confirmar && (
                    <div className="rounded-2xl border border-brand-300/30 p-4 mt-4">
                      <p className="text-sm mb-3">
                        {t(confirmar === 'abandonar' ? 'confirmDiscard' : 'confirmFinish')}
                      </p>
                      <div className="flex gap-3">
                        <button onClick={() => void agir(confirmar)} disabled={travado}>
                          {t(confirmar === 'abandonar' ? 'discardConfirm' : 'confirm')}
                        </button>
                        <button onClick={() => setConfirmar(null)}>{t('continue')}</button>
                      </div>
                    </div>
                  )}
                  {sessao.status === VENDAS_SESSAO.INTERROMPIDA && (
                    <p className="text-sm text-amber-200 mt-4">{t('interrupted')}</p>
                  )}
                  {terminou && (
                    <Avaliacao
                      feedback={feedback}
                      salvo={!!sessao.feedback}
                      comDevolutiva={sessao.status === VENDAS_SESSAO.CONCLUIDA}
                      desabilitado={travado}
                      onChange={setFeedback}
                      onSubmit={() => void agir('feedback')}
                    />
                  )}
                  {sessao.feedback && sessao.relatorio && (
                    <div className="border-t border-white/10 pt-6 mt-6">
                      <Relatorio relatorio={sessao.relatorio} versao={sessao.versaoRegua} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
