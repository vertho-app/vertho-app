'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowRight,
  Check,
  LockKeyhole,
  RotateCcw,
  Send,
  Loader2,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { CONTEXTO, EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import {
  MIN_TURNOS,
  MAX_TURNOS,
  type Comando,
} from '@/lib/simulador-lideranca/schema';
import type { Dados } from '@/lib/simulador-lideranca/service';
import { resumoAvaliacao } from '@/lib/simulador-lideranca/core';
import Ditado from '@/components/simulador-vendas/ditado';
import styles from './treino.module.css';

async function api(url: string, body?: unknown): Promise<Dados> {
  const res = await fetchAuth(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(
      new Error(data.error || 'Não foi possível recuperar o encontro.'),
      { status: res.status },
    );
  return data;
}
type Acao = Comando['acao'];
export default function TreinoLideranca({
  admin = false,
  empresaId,
}: {
  admin?: boolean;
  empresaId?: string;
}) {
  const t = useTranslations('SimuladorLideranca'),
    locale = useLocale();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [plano, setPlano] = useState(''),
    [texto, setTexto] = useState(''),
    [reflexao, setReflexao] = useState('');
  const [refletindo, setRefletindo] = useState(false);
  const pending = useRef<{ key: string; body: unknown } | null>(null),
    running = useRef(false),
    generation = useRef(0),
    reads = useRef(0);
  const chat = useRef<HTMLDivElement>(null),
    passos = useRef<HTMLOListElement>(null);
  const url = `/api/simulador-lideranca${empresaId ? `?empresaId=${empresaId}` : ''}`;
  const carregar = useCallback(
    async (id?: string, pagina = 0) => {
      const gen = generation.current,
        seq = ++reads.current;
      try {
        const d = await api(
          `${url}${url.includes('?') ? '&' : '?'}pagina=${pagina}${id ? `&episodioId=${id}` : ''}`,
        );
        if (gen === generation.current && seq === reads.current) setDados(d);
      } catch (e) {
        if (gen === generation.current && seq === reads.current)
          setErro((e as Error).message);
      } finally {
        if (gen === generation.current && seq === reads.current)
          setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    generation.current++;
    reads.current++;
    pending.current = null;
    setDados(null);
    setErro('');
    setPlano('');
    setTexto('');
    setReflexao('');
    setRefletindo(false);
    setLoading(true);
    if (!admin || empresaId) void carregar();
    else setLoading(false);
    return () => {
      generation.current++;
    };
  }, [admin, empresaId, carregar]);
  const jornada = dados?.jornada,
    ep = dados?.selecionado;
  const processando =
    !!jornada?.processandoAte &&
    Date.parse(jornada.processandoAte) > Date.now();
  useEffect(() => {
    if (!processando || busy) return;
    const timer = setInterval(() => {
      void carregar();
    }, 4000);
    return () => clearInterval(timer);
  }, [processando, busy, carregar]);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [ep?.id, ep?.mensagens.length]);
  useEffect(() => {
    const passo = passos.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    if (passo && passos.current)
      passos.current.scrollLeft = Math.max(
        0,
        passo.offsetLeft - passos.current.offsetLeft - 12,
      );
  }, [ep?.indice]);
  const bloqueado = busy || processando;
  const vivo = !!ep && ep.id === jornada?.ativo?.id;
  const turno = ep?.mensagens.filter((m) => m.autor === 'lider').length || 0;
  const concluido = jornada?.concluidos.length || 0;
  const info = ep ? EPISODIOS[ep.indice] : null;
  async function enviar(acao: Acao, valor?: string | number) {
    if (running.current || bloqueado) return;
    running.current = true;
    setBusy(true);
    setErro('');
    reads.current++;
    const gen = generation.current;
    const payload = {
      acao,
      ...(empresaId ? { empresaId } : {}),
      revisao: jornada?.revisao || 0,
      ...(typeof valor === 'string'
        ? { texto: valor }
        : typeof valor === 'number'
          ? { episodio: valor }
          : {}),
    };
    // Após perder a resposta, a leitura pode trazer revisão nova. O reenvio
    // conserva o comando original para recuperar o recibo, sem duplicar a fala.
    const key = JSON.stringify({ ...payload, revisao: undefined });
    if (pending.current?.key !== key)
      pending.current = {
        key,
        body: { ...payload, requestId: crypto.randomUUID() },
      };
    try {
      const d = await api(url, pending.current.body);
      if (gen !== generation.current) return;
      setDados(d);
      pending.current = null;
      setTexto('');
      setReflexao('');
      setPlano('');
      setRefletindo(false);
    } catch (e) {
      if (gen === generation.current) {
        if ((e as Error & { status?: number }).status === 409)
          pending.current = null;
        setErro((e as Error).message);
        await carregar();
      }
    } finally {
      running.current = false;
      if (gen === generation.current) setBusy(false);
    }
  }
  const data = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <a
          className={styles.link}
          href={
            admin
              ? `/admin/fit${empresaId ? `?empresa=${empresaId}&tab=prontidao` : ''}`
              : '/dashboard/assessment?trilho=lideranca'
          }
        >
          {t(admin ? 'config' : 'assessment')} <ArrowRight size={15} />
        </a>
      </header>
      {admin && <p className={styles.notice}>{t('adminNotice')}</p>}
      {admin && !empresaId ? (
        <section className={styles.panel}>
          <h2>{t('chooseCompany')}</h2>
          <p>{t('chooseCompanyHint')}</p>
        </section>
      ) : (
        <>
          {erro && (
            <div className={styles.error} role="alert">
              <p>{erro}</p>
              <button
                type="button"
                onClick={() => {
                  setErro('');
                  void carregar();
                }}
                disabled={busy}
              >
                {t('refresh')}
              </button>
            </div>
          )}
          {loading ? (
            <p className={styles.loading} role="status">
              <Loader2 size={20} />
              {t('loading')}
            </p>
          ) : (
            dados && (
              <>
                <div className={styles.progress}>
                  <span>{dados.empresaNome}</span>
                  <span>{t('progress', { done: concluido })}</span>
                </div>
                <ol
                  ref={passos}
                  className={styles.steps}
                  aria-label={t('journey')}
                >
                  {EPISODIOS.map((item, i) => (
                    <li
                      key={item.competencia}
                      data-active={ep?.indice === i}
                      data-done={i < concluido}
                    >
                      <button
                        type="button"
                        disabled={
                          bloqueado ||
                          (!jornada?.concluidos[i] &&
                            jornada?.ativo?.indice !== i)
                        }
                        onClick={() => {
                          setRefletindo(false);
                          void carregar(
                            jornada?.ativo?.indice === i
                              ? undefined
                              : jornada?.concluidos[i]?.id,
                          );
                        }}
                        aria-current={ep?.indice === i ? 'step' : undefined}
                      >
                        <span className={styles.stepNumber}>
                          {i < concluido ? (
                            <Check size={17} />
                          ) : i > concluido ? (
                            <LockKeyhole size={14} />
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span>
                          <b>{t(`step${i}`)}</b>
                          <small>{t('encounter', { n: i + 1 })}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                {(busy || processando) && (
                  <p className={styles.notice} role="status">
                    <Loader2 size={17} />
                    {t('processing')}
                    {processando && (
                      <span>
                        {t('resumeBy', {
                          time: new Date(
                            jornada!.processandoAte!,
                          ).toLocaleTimeString(locale),
                        })}
                      </span>
                    )}
                  </p>
                )}
                {!ep && (
                  <section className={`${styles.panel} ${styles.intro}`}>
                    <p className={styles.eyebrow}>{t('team')}</p>
                    <h2>{t('introTitle')}</h2>
                    <p>{CONTEXTO}</p>
                    <div className={styles.people}>
                      {['Ana', 'Bruno', 'Camila', 'Rafa'].map((nome) => (
                        <span key={nome}>
                          <i>{nome[0]}</i>
                          {nome}
                        </span>
                      ))}
                    </div>
                    <p className={styles.muted}>{t('introHint')}</p>
                    <button
                      className={styles.primary}
                      disabled={bloqueado}
                      onClick={() => void enviar('iniciar')}
                    >
                      {t('start')} <ArrowRight size={17} />
                    </button>
                  </section>
                )}
                {ep && info && (
                  <div className={styles.workspace}>
                    <aside className={styles.aside}>
                      <section className={styles.brief}>
                        <p className={styles.eyebrow}>{info.momento}</p>
                        <h2>{info.titulo}</h2>
                        <p>{ep.contexto}</p>
                        <div className={styles.focus}>
                          <small>{t('focus')}</small>
                          <strong>{info.nome}</strong>
                          <p>{info.objetivo}</p>
                        </div>
                        {ep.repeticao && (
                          <p className={styles.notice}>{t('replayNotice')}</p>
                        )}
                        {ep.plano && (
                          <details>
                            <summary>{t('yourPlan')}</summary>
                            <p className={styles.pre}>{ep.plano}</p>
                          </details>
                        )}
                      </section>
                      <details className={styles.history}>
                        <summary>{t('history')}</summary>
                        {!dados.historico.length && (
                          <p className={styles.muted}>{t('emptyHistory')}</p>
                        )}
                        {dados.historico.map((h) => (
                          <button
                            key={h.id}
                            disabled={bloqueado}
                            aria-pressed={ep.id === h.id}
                            onClick={() => {
                              setRefletindo(false);
                              void carregar(h.id, dados.pagina);
                            }}
                          >
                            <span>
                              {t('encounter', { n: h.indice + 1 })} ·{' '}
                              {t(h.repeticao ? 'replay' : 'original')}
                            </span>
                            <small>{data(h.created_at)}</small>
                          </button>
                        ))}
                        <div className={styles.actions}>
                          {dados.pagina > 0 && (
                            <button
                              disabled={bloqueado}
                              onClick={() =>
                                void carregar(
                                  ep.encerradoEm ? ep.id : undefined,
                                  dados.pagina - 1,
                                )
                              }
                            >
                              {t('previous')}
                            </button>
                          )}
                          {dados.temMais && (
                            <button
                              disabled={bloqueado}
                              onClick={() =>
                                void carregar(
                                  ep.encerradoEm ? ep.id : undefined,
                                  dados.pagina + 1,
                                )
                              }
                            >
                              {t('nextPage')}
                            </button>
                          )}
                        </div>
                      </details>
                    </aside>
                    <section className={styles.panel}>
                      {vivo && !ep.plano ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void enviar('planejar', plano);
                          }}
                          className={styles.preparation}
                        >
                          <p className={styles.eyebrow}>{t('preparation')}</p>
                          <h2>{t('planTitle')}</h2>
                          <p>{t('planHint')}</p>
                          <label htmlFor="lideranca-plano">
                            {t('planLabel')}
                          </label>
                          <textarea
                            id="lideranca-plano"
                            value={plano}
                            onChange={(e) => setPlano(e.target.value)}
                            minLength={20}
                            maxLength={6000}
                            rows={7}
                            required
                            disabled={bloqueado}
                          />
                          <p className={styles.muted}>{t('minChars')}</p>
                          <div className={styles.actions}>
                            <Ditado
                              disabled={bloqueado}
                              onTexto={(s) =>
                                setPlano((v) => `${v} ${s}`.trim())
                              }
                            />
                            <button
                              className={styles.primary}
                              disabled={bloqueado || plano.trim().length < 20}
                            >
                              {t('savePlan')} <ArrowRight size={17} />
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className={styles.chatHeader}>
                            <span className={styles.avatar}>
                              {info.personagem[0]}
                            </span>
                            <div>
                              <h2>{info.personagem}</h2>
                              <p>{info.papel}</p>
                            </div>
                            {ep.encerradoEm && (
                              <span className={styles.badge}>
                                {t('completed')}
                              </span>
                            )}
                          </div>
                          <div
                            ref={chat}
                            className={styles.chat}
                            role="log"
                            aria-label={t('conversation')}
                            aria-live={vivo ? 'polite' : 'off'}
                          >
                            {ep.mensagens.map((m, i) => (
                              <div
                                className={`${styles.message} ${m.autor === 'lider' ? styles.leader : ''}`}
                                key={`${ep.id}-${i}`}
                              >
                                <small>
                                  {m.autor === 'lider'
                                    ? t('you')
                                    : info.personagem}
                                  {m.autor === 'lider' && ` · ${m.turno}`}
                                </small>
                                <p>{m.texto}</p>
                              </div>
                            ))}
                          </div>
                          {vivo && !refletindo && (
                            <form
                              className={styles.composer}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void enviar('responder', texto);
                              }}
                            >
                              {turno < MAX_TURNOS ? (
                                <>
                                  <label htmlFor="lideranca-fala">
                                    {t('messageLabel', {
                                      name: info.personagem,
                                    })}
                                  </label>
                                  <textarea
                                    id="lideranca-fala"
                                    rows={3}
                                    maxLength={3000}
                                    value={texto}
                                    onChange={(e) => setTexto(e.target.value)}
                                    disabled={bloqueado}
                                    required
                                  />
                                  <div className={styles.actions}>
                                    <Ditado
                                      disabled={bloqueado}
                                      onTexto={(s) =>
                                        setTexto((v) => `${v} ${s}`.trim())
                                      }
                                    />
                                    <button
                                      className={styles.primary}
                                      disabled={bloqueado || !texto.trim()}
                                    >
                                      {t('send')} <Send size={16} />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <p>{t('turnLimit')}</p>
                              )}
                              <div className={styles.actions}>
                                <p className={styles.muted}>
                                  {t('rounds', { n: turno, max: MAX_TURNOS })}
                                </p>
                                <button
                                  type="button"
                                  disabled={bloqueado || turno < MIN_TURNOS}
                                  onClick={() => setRefletindo(true)}
                                >
                                  {t('finish')}
                                </button>
                              </div>
                              <p className={styles.muted}>{t('fictionHint')}</p>
                            </form>
                          )}
                          {vivo && refletindo && (
                            <form
                              className={styles.composer}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void enviar('encerrar', reflexao);
                              }}
                            >
                              <h3>{t('reflectionTitle')}</h3>
                              <label htmlFor="lideranca-reflexao">
                                {t('reflectionHint')}
                              </label>
                              <textarea
                                id="lideranca-reflexao"
                                rows={5}
                                minLength={20}
                                maxLength={4000}
                                value={reflexao}
                                onChange={(e) => setReflexao(e.target.value)}
                                disabled={bloqueado}
                                required
                              />
                              <p className={styles.muted}>{t('minChars')}</p>
                              <div className={styles.actions}>
                                <button
                                  type="button"
                                  disabled={bloqueado}
                                  onClick={() => setRefletindo(false)}
                                >
                                  {t('backToChat')}
                                </button>
                                <button
                                  className={styles.primary}
                                  disabled={
                                    bloqueado || reflexao.trim().length < 20
                                  }
                                >
                                  {t('getFeedback')}
                                </button>
                              </div>
                            </form>
                          )}
                        </>
                      )}
                      {ep.avaliacao && jornada && (
                        <section className={styles.report}>
                          <p className={styles.eyebrow}>{t('feedback')}</p>
                          <h2>{t('feedbackTitle')}</h2>
                          <p>{ep.avaliacao.sintese}</p>
                          <p className={styles.notice}>{t('assessmentNote')}</p>
                          {ep.consequencia && (
                            <div className={styles.outcome}>
                              <h3>{t('consequence')}</h3>
                              <p>{ep.consequencia.narrativa}</p>
                              {!!ep.consequencia.acordos.length && (
                                <>
                                  <h4>{t('agreements')}</h4>
                                  <ul>
                                    {ep.consequencia.acordos.map((a, i) => (
                                      <li key={i}>{a.descricao}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              {!!ep.consequencia.pendencias.length && (
                                <>
                                  <h4>{t('openPoints')}</h4>
                                  <ul>
                                    {ep.consequencia.pendencias.map((p, i) => (
                                      <li key={i}>{p}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                            </div>
                          )}
                          {resumoAvaliacao(ep.avaliacao, jornada.matriz).map(
                            (c) => {
                              const original =
                                ep.repeticao &&
                                jornada.concluidos[ep.indice]?.avaliacao;
                              const anterior = original
                                ? resumoAvaliacao(
                                    original,
                                    jornada.matriz,
                                  ).find((x) => x.codigo === c.codigo)
                                : null;
                              return (
                                <details
                                  className={styles.competency}
                                  key={c.codigo}
                                  open={c.codigo === info.competencia}
                                >
                                  <summary>
                                    <span>
                                      {c.nome}
                                      <small>
                                        {t('coverage', {
                                          n: c.observados,
                                          total: c.total,
                                        })}
                                      </small>
                                    </span>
                                    <b>
                                      {c.nivel === null
                                        ? t('notObserved')
                                        : `N${c.nivel} · ${c.nota!.toLocaleString(locale, { maximumFractionDigits: 2 })}/4`}
                                    </b>
                                  </summary>
                                  {anterior && (
                                    <p className={styles.muted}>
                                      {t('comparison', {
                                        before:
                                          anterior.nota?.toLocaleString(
                                            locale,
                                            { maximumFractionDigits: 2 },
                                          ) || '—',
                                        after:
                                          c.nota?.toLocaleString(locale, {
                                            maximumFractionDigits: 2,
                                          }) || '—',
                                      })}
                                    </p>
                                  )}
                                  {jornada.matriz
                                    .filter((d) => d.cod_comp === c.codigo)
                                    .map((d) => {
                                      const a = ep.avaliacao!.descritores.find(
                                        (x) => x.codigo === d.cod_desc,
                                      )!;
                                      return (
                                        <div
                                          className={styles.descriptor}
                                          key={d.cod_desc}
                                        >
                                          <h4>
                                            {d.nome_curto}{' '}
                                            <span>
                                              {a.nivel
                                                ? `N${a.nivel}`
                                                : t('notObserved')}
                                            </span>
                                          </h4>
                                          <p>{a.justificativa}</p>
                                          {a.evidencias.map((v, i) => (
                                            <blockquote key={i}>
                                              “{v.trecho}”
                                              <small>
                                                {t(
                                                  v.fonte === 'fala'
                                                    ? 'speechEvidence'
                                                    : v.fonte === 'planejamento'
                                                      ? 'planEvidence'
                                                      : 'reflectionEvidence',
                                                  { n: v.turno },
                                                )}
                                              </small>
                                            </blockquote>
                                          ))}
                                          <details>
                                            <summary>{t('rubric')}</summary>
                                            <ol className={styles.rubric}>
                                              {[
                                                d.n1_gap,
                                                d.n2_desenvolvimento,
                                                d.n3_meta,
                                                d.n4_referencia,
                                              ].map((regra, i) => (
                                                <li key={i}>
                                                  <b>N{i + 1}</b> {regra}
                                                </li>
                                              ))}
                                            </ol>
                                          </details>
                                        </div>
                                      );
                                    })}
                                </details>
                              );
                            },
                          )}
                          <div className={styles.practice}>
                            <h3>{t('nextPractice')}</h3>
                            <p>{ep.avaliacao.proximaPratica}</p>
                          </div>
                          <details>
                            <summary>{t('yourReflection')}</summary>
                            <p className={styles.pre}>{ep.reflexao}</p>
                          </details>
                          <div className={styles.actions}>
                            <button
                              disabled={bloqueado || !!jornada.ativo}
                              onClick={() => void enviar('repetir', ep.indice)}
                            >
                              <RotateCcw size={16} />
                              {t('repeat')}
                            </button>
                            {jornada.ativo ? (
                              <button
                                className={styles.primary}
                                disabled={bloqueado}
                                onClick={() => void carregar()}
                              >
                                {t('resume')}
                              </button>
                            ) : concluido < 5 ? (
                              <button
                                className={styles.primary}
                                disabled={bloqueado}
                                onClick={() => void enviar('avancar')}
                              >
                                {t('continue', { n: concluido + 1 })}
                                <ArrowRight size={16} />
                              </button>
                            ) : (
                              <span className={styles.badge}>
                                {t('journeyCompleted')}
                              </span>
                            )}
                          </div>
                        </section>
                      )}
                    </section>
                  </div>
                )}
              </>
            )
          )}
        </>
      )}
    </main>
  );
}
