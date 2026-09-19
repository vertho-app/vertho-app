'use client';
import { useEffect, useState, useRef } from 'react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { EditorCenario } from './editor';
import CompetenciasRecepcao from './competencias';
import { rotuloClassificacao } from '@/lib/recepcao/schema';
import { descreverMensagem, humanizarReferencias } from '@/lib/recepcao/texto';
import styles from './treino.module.css';
import MatrizAtendimento from './matriz-relatorio';
import { posicaoNaConversa } from './relatorio-matriz';
import { casoEmBranco } from '@/lib/recepcao/caso-em-branco';
import { useLocale, useTranslations } from 'next-intl';
import EquipeVisao from './equipe-visao';

// Desfechos com rótulo traduzido; um desfecho personalizado do caso aparece como está.
const DESFECHOS_CONHECIDOS = ['remarcado', 'encaminhado', 'orientado', 'nao_resolvido', 'inconclusivo'];

// Ordem das colunas do painel: escala nova primeiro, depois a legada; só as presentes no grupo aparecem.
const ORDEM_CLASSIFICACOES = [
  'n1',
  'n2',
  'n3',
  'n4',
  'adequado',
  'parcial',
  'insuficiente',
  'nao_observavel',
];
// Próxima versão sugerida para o catálogo: 3.2 → 3.3; outro formato ganha sufixo .1.
const proximaVersao = (v: string) => {
  const m = /^(\d+)\.(\d+)$/.exec(v);
  return m ? `${m[1]}.${Number(m[2]) + 1}` : `${v}.1`;
};

export default function GestaoRecepcao({
  empresaId,
  visao,
  admin,
}: {
  empresaId: string;
  visao: 'equipe' | 'cenarios' | 'competencias';
  admin: boolean;
}) {
  // A aba da equipe e a revisão são de quem acompanha (RH, gestor): traduzidas. Cenários
  // e editor seguem em português, como ferramenta interna da Vertho.
  const t = useTranslations('SimuladorAtendimento');
  const locale = useLocale();
  const numero = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const [dados, setDados] = useState<any>(null),
    [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false),
    [biblioteca, setBiblioteca] = useState<any[]>([]);
  const [dias, setDias] = useState('30'),
    [testes, setTestes] = useState(false),
    [detalhe, setDetalhe] = useState<any>(null),
    [editor, setEditor] = useState<any>(null);
  const [parecer, setParecer] = useState('concordo'),
    [motivo, setMotivo] = useState(''),
    [dimensoes, setDimensoes] = useState<string[]>([]);
  const pending = useRef<string | null>(null),
    generation = useRef(0);
  // Rascunho por IA (18/09/2026): descrição da situação que a empresa quer treinar.
  const [pedirRascunho, setPedirRascunho] = useState(false),
    [descricao, setDescricao] = useState('');
  async function gerarRascunho() {
    setBusy(true);
    setErro('');
    try {
      const d = await api({}, { acao: 'rascunho_ia', descricao: descricao.trim() });
      setPedirRascunho(false);
      setDescricao('');
      setEditor({ conteudo: d.conteudo });
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function api(params: Record<string, string> = {}, body?: unknown) {
    const q = new URLSearchParams({
      ...params,
      ...(admin ? { empresaId } : {}),
    });
    const r = await fetchAuth(
      `/api/recepcao/gestao?${q}`,
      body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(body as object),
              ...(admin ? { empresaId } : {}),
            }),
          }
        : { cache: 'no-store' },
    );
    const d = await r.json();
    if (!r.ok)
      throw new Error(
        d.campos?.length
          ? d.campos.map((c) => `${c.campo}: ${c.erro}`).join('\n')
          : d.error || 'Não foi possível carregar.',
      );
    return d;
  }
  async function carregar(ticket = generation.current) {
    if (visao === 'competencias') return; // a aba tem o próprio componente
    const d = await api({ visao, dias, testes: testes ? '1' : '0' });
    // O editor de cenário monta a rubrica a partir da biblioteca (inativas incluídas, para rotular snapshots antigos).
    const b =
      visao === 'cenarios'
        ? (
            await api({ visao: 'competencias', inativas: '1' }).catch(() => ({
              competencias: [],
            }))
          ).competencias
        : [];
    if (ticket === generation.current) {
      setDados(d);
      setBiblioteca(b);
    }
  }
  useEffect(() => {
    const ticket = ++generation.current;
    setDados(null);
    setDetalhe(null);
    setEditor(null);
    setErro('');
    setBusy(true);
    carregar(ticket)
      .catch((e) => {
        if (ticket === generation.current) setErro(e.message);
      })
      .finally(() => {
        if (ticket === generation.current) setBusy(false);
      });
    return () => {
      generation.current++;
    };
  }, [visao, dias, testes, empresaId]);
  async function abrir(id: string) {
    setBusy(true);
    setErro('');
    try {
      setDetalhe(await api({ sessaoId: id }));
      setMotivo('');
      setDimensoes([]);
      pending.current = null;
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revisar() {
    if (busy) return;
    setBusy(true);
    setErro('');
    try {
      pending.current ||= crypto.randomUUID();
      await api(
        {},
        {
          acao: 'revisar',
          sessaoId: detalhe.sessao.id,
          requestId: pending.current,
          parecer,
          motivo,
          dimensoes,
        },
      );
      pending.current = null;
      setDetalhe(await api({ sessaoId: detalhe.sessao.id }));
      setMotivo('');
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function salvar(cmd: any) {
    setBusy(true);
    setErro('');
    try {
      const d = await api({}, cmd);
      setEditor(cmd.acao === 'arquivar' ? null : d.cenario);
      await carregar();
      return d.cenario;
    } catch (e) {
      setErro(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (visao === 'competencias')
    return <CompetenciasRecepcao empresaId={empresaId} admin={admin} />;
  if (editor)
    return (
      <section className={styles.management}>
        {erro && (
          <p role="alert" className={styles.error}>
            {erro}
          </p>
        )}
        <EditorCenario
          key={editor.id || 'novo'}
          registro={editor}
          biblioteca={biblioteca}
          admin={admin}
          busy={busy}
          salvar={salvar}
          fechar={() => {
            setEditor(null);
            setErro('');
          }}
        />
      </section>
    );
  return (
    <section
      className={styles.management}
      aria-label={
        visao === 'equipe'
          ? t('teamArea')
          : 'Biblioteca de cenários'
      }
    >
      <header className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>
            {visao === 'equipe'
              ? t('teamEyebrow')
              : 'Casos para praticar'}
          </p>
          <h2>
            {visao === 'equipe'
              ? t('tabTeam')
              : 'Biblioteca de cenários'}
          </h2>
        </div>
        {visao === 'equipe' ? (
          <div className={styles.filters}>
            <label>
              {t('teamPeriod')}
              <select
                value={dias}
                disabled={busy}
                onChange={(e) => setDias(e.target.value)}
              >
                {['7', '30', '90'].map((n) => (
                  <option key={n} value={n}>
                    {t('teamDays', { n: Number(n) })}
                  </option>
                ))}
              </select>
            </label>
            {admin && (
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={testes}
                  disabled={busy}
                  onChange={(e) => setTestes(e.target.checked)}
                />{' '}
                {t('teamIncludeTests')}
              </label>
            )}
          </div>
        ) : (
          <div className={styles.filters}>
          {/* Segmento sem caso nenhum também precisa de um ponto de partida (18/09/2026). */}
          <button
            className={styles.secondary}
            disabled={busy || !dados?.dominio}
            onClick={() => setEditor({ conteudo: casoEmBranco(dados.dominio) })}
          >
            Caso em branco
          </button>
          <button
            className={styles.secondary}
            disabled={busy || !dados?.dominio}
            onClick={() => setPedirRascunho((v) => !v)}
          >
            Rascunho com IA
          </button>
          <button
            className={styles.primary}
            disabled={busy || !dados?.cenarios?.length}
            onClick={() =>
              setEditor({
                conteudo: {
                  ...structuredClone(dados.cenarios[0].conteudo),
                  id: 'novo-caso',
                  publico: {
                    ...structuredClone(dados.cenarios[0].conteudo.publico),
                    titulo: 'Novo caso',
                  },
                },
              })
            }
          >
            Criar caso
          </button>
          </div>
        )}
      </header>
      {visao === 'cenarios' && pedirRascunho && (
        <form
          className={styles.editor}
          onSubmit={(e) => {
            e.preventDefault();
            void gerarRascunho();
          }}
        >
          <label>
            Situação que a equipe precisa treinar
            <textarea
              value={descricao}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: cliente quer trocar um produto fora do prazo e diz que foi mal atendido na compra."
            />
          </label>
          <p className={styles.small}>
            A IA escreve um rascunho no segmento da empresa. Ele abre no editor sem ser salvo: revise tudo antes de publicar. Use só situações fictícias.
          </p>
          <button className={styles.primary} disabled={busy || descricao.trim().length < 20}>
            {busy ? 'Gerando rascunho…' : 'Gerar rascunho'}
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className={styles.error}>
          {erro}
        </p>
      )}
      {busy && <p role="status">Carregando…</p>}
      {visao === 'cenarios' && dados && (
        <div className={styles.caseGrid}>
          {dados.cenarios
            .filter(
              (r) => admin || r.empresa_id !== null || r.estado !== 'rascunho',
            )
            .map((r) => {
              const global = r.empresa_id === null;
              return (
                <article key={r.id}>
                  <p className={styles.eyebrow}>
                    {global ? 'Catálogo Vertho' : 'Da clínica'} · {r.estado}
                  </p>
                  <h3>{r.conteudo.publico.titulo}</h3>
                  <p>{r.conteudo.publico.objetivo}</p>
                  <small>
                    {r.versao} · {r.conteudo.rubrica.length} competências ·{' '}
                    {1 + (r.conteudo.variantes?.length || 0)} pacientes
                  </small>
                  <div className={styles.filters}>
                    {r.estado === 'rascunho' && (!global || admin) && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => setEditor(r)}
                      >
                        Editar rascunho
                      </button>
                    )}
                    {r.estado !== 'rascunho' && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          setEditor({ conteudo: structuredClone(r.conteudo) })
                        }
                      >
                        {global ? 'Copiar para a clínica' : 'Criar nova versão'}
                      </button>
                    )}
                    {global && admin && r.estado !== 'rascunho' && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            catalogo: true,
                            conteudo: {
                              ...structuredClone(r.conteudo),
                              versao: proximaVersao(r.versao),
                            },
                          })
                        }
                      >
                        Nova versão no catálogo
                      </button>
                    )}
                    {(!global || admin) && r.estado !== 'arquivado' && (
                      <button
                        className={styles.link}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              global
                                ? 'Arquivar esta versão do catálogo para todas as clínicas? Treinos anteriores continuam disponíveis.'
                                : 'Arquivar esta versão? Treinos anteriores continuam disponíveis.',
                            )
                          )
                            salvar({
                              acao: 'arquivar',
                              id: r.id,
                              revisao: r.revisao,
                              catalogo: global || undefined,
                            }).catch(() => {});
                        }}
                      >
                        Arquivar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
      {visao === 'equipe' && dados && (
        <>
          {dados.visao && <EquipeVisao visao={dados.visao} dias={Number(dias)} />}
          <h3>{t('teamCases')}</h3>
          <p className={styles.small}>{t('teamCasesHelp')}</p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{t('teamCase')}</th>
                  <th>{t('teamCaseSessions')}</th>
                  <th>{t('teamAverage')}</th>
                  <th>{t('teamCritical')}</th>
                </tr>
              </thead>
              <tbody>
                {dados.grupos.map((g: any) => (
                  <tr key={g.chave}>
                    <td>
                      {g.titulo}
                      {admin && <small className={styles.cellNote}>{g.versao}</small>}
                    </td>
                    <td>{g.sessoes}</td>
                    <td>{g.media === null ? '—' : t('scoreOf4Short', { score: numero(g.media) })}</td>
                    <td>{g.criticas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dados.grupos.length && <p className={styles.small}>{t('teamCasesEmpty')}</p>}
          </div>
          <h3>{t('teamToFollow')}</h3>
          <p className={styles.small}>
            {t('teamToFollowHelp', { done: dados.concluidas, started: dados.iniciadas, pending: dados.pendentes })}
          </p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{t('teamPersonCase')}</th>
                  <th>{t('teamDate')}</th>
                  <th>{t('teamResult')}</th>
                  <th>{t('teamReview')}</th>
                  <th>{t('teamAction')}</th>
                </tr>
              </thead>
              <tbody>
                {dados.sessoes.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.nome === 'Teste administrativo' ? t('adminTest') : s.nome}</strong>
                      <br />
                      {s.titulo}
                    </td>
                    <td>{new Date(s.data).toLocaleDateString(locale)}</td>
                    <td>
                      {s.nota === null ? t('teamInProgress') : t('scoreOf4Short', { score: numero(s.nota) })}
                      {s.critica ? ` · ${t('historyAttention')}` : ''}
                    </td>
                    <td>{s.revisao ? t(`verdict_${s.revisao}`) : t('teamPendingReview')}</td>
                    <td>
                      <button className={styles.link} disabled={busy} onClick={() => abrir(s.id)}>
                        {t('teamOpen')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dados.sessoes.length && <p className={styles.empty}>{t('teamNoSessions')}</p>}
          </div>
          {dados.operacao && (
            <details className={styles.group}>
              <summary>Operação e custo de IA</summary>
              <p>
                {dados.operacao.tentativas} tentativas ·{' '}
                {dados.operacao.emAberto} sem finalização registrada · custo
                conhecido US$ {dados.operacao.custoConhecidoUsd.toFixed(4)}
              </p>
              <p>
                Rejeições do avaliador: {dados.operacao.avaliacoesRejeitadas}/
                {dados.operacao.avaliacoes} ·{' '}
                {dados.operacao.taxaRejeicao == null
                  ? '—'
                  : `${dados.operacao.taxaRejeicao.toFixed(1)}%`}
              </p>
              <p className={styles.small}>
                Uma tentativa sem uso registrado ou sem custo apurado não
                equivale a custo zero. Chamadas anteriores à instrumentação não
                entram nesta conta.
              </p>
              {Object.entries(dados.operacao.rejeicoes).map(([k, v]) => (
                <p key={k}>
                  {k}: {String(v)}
                </p>
              ))}
              <p>
                Modelos efetivos:{' '}
                {dados.operacao.modelos.join(', ') ||
                  'Ainda sem uso registrado'}
              </p>
              {dados.operacao.porSessao.map((s) => (
                <p key={s.id}>
                  Treino {s.id.slice(0, 8)} · {s.tentativas} tentativas · US${' '}
                  {s.custoConhecidoUsd.toFixed(4)} · {s.semUsoRegistrado} sem
                  uso registrado · {s.semCustoRegistrado || 0} com custo
                  desconhecido
                </p>
              ))}
            </details>
          )}
        </>
      )}
      {detalhe && (
        <section className={styles.review} aria-label={t('reviewArea')}>
          <header className={styles.sectionHead}>
            <h2>{detalhe.sessao.cenario.titulo}</h2>
            <button className={styles.secondary} onClick={() => setDetalhe(null)}>
              {t('reviewClose')}
            </button>
          </header>
          {(() => {
            const hist = detalhe.sessao.historico,
              nome = detalhe.sessao.cenario.nomePaciente,
              rel = detalhe.sessao.relatorio;
            // Posição na conversa em terceira pessoa ("2ª resposta de quem atende"), traduzida.
            const pos = (id: string) => {
              const p = posicaoNaConversa(hist, id);
              if (!p) return id;
              return p.papel === 'user' ? t('teamReply', { n: p.ordem }) : t('personLine', { n: p.ordem, name: nome });
            };
            // O texto do relatório é escrito pela IA em português: a posição segue a mesma língua.
            const h = (texto: string) =>
              humanizarReferencias(texto || '', hist, nome, 'terceira', detalhe.sessao.cenario.dominio);
            return (
              <>
                {/* O que a pessoa recebeu (18/09/2026): quem revisa lia só a matriz. */}
                {rel && (
                  <div className={styles.reviewSummary}>
                    <p>
                      <strong>{t('reviewOutcome')}</strong>{' '}
                      {DESFECHOS_CONHECIDOS.includes(rel.desfecho.tipo)
                        ? t(`outcome_${rel.desfecho.tipo}`)
                        : rel.desfecho.tipo.replaceAll('_', ' ')}
                      . {h(rel.desfecho.justificativa)}
                    </p>
                    <p>
                      <strong>{t('reviewScore')}</strong>{' '}
                      {rel.nota === null ? t('noScore') : t('scoreOf4Short', { score: numero(rel.nota) })}
                    </p>
                    {rel.ocorrencias.length > 0 && (
                      <div className={styles.error}>
                        <div>
                          <strong>{t('criticalTitle')}</strong>
                          {rel.ocorrencias.map((o: any, i: number) => (
                            <p key={i}>{h(o.motivo)}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={styles.coaching}>
                      <div>
                        <h3>{t('reviewWorked')}</h3>
                        <p>{h(rel.feedback.acerto)}</p>
                      </div>
                      <div>
                        <h3>{t('reviewNextStep')}</h3>
                        <p>{h(rel.feedback.melhoria)}</p>
                        <p>{h(rel.feedback.novaTentativa)}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className={styles.reviewColumns}>
                  <div>
                    <h3>{t('reviewConversation')}</h3>
                    {hist.map((m: any) => (
                      <blockquote key={m.id}>
                        <strong>{pos(m.id)}</strong>
                        <p>{m.content}</p>
                      </blockquote>
                    ))}
                  </div>
                  <div>
                    <h3>{t('reviewAi')}</h3>
                    {rel?.competencias && (
                      <MatrizAtendimento
                        relatorio={rel}
                        historico={hist}
                        nomePersona={nome}
                        dominio={detalhe.sessao.cenario.dominio}
                        publico="equipe"
                      />
                    )}
                    {!rel?.competencias &&
                      (rel?.dimensoes.map((d: any) => (
                        <article key={d.id}>
                          <h4>
                            {d.nome || detalhe.sessao.cenario.competencias?.find((c: any) => c.id === d.id)?.nome || d.id} ·{' '}
                            {rotuloClassificacao[d.classificacao] || d.classificacao}
                          </h4>
                          <p>{h(d.justificativa)}</p>
                          {d.evidencias.map((r: any, i: number) => (
                            <blockquote key={i}>
                              <small>{pos(r.mensagemId)}</small>“{r.trecho}”
                            </blockquote>
                          ))}
                          {d.oportunidades?.map((r: any, i: number) => (
                            <blockquote key={`o${i}`} className={styles.oportunidade}>
                              <small>
                                {t('opportunity')} · {pos(r.mensagemId)}
                              </small>
                              “{r.trecho}”
                            </blockquote>
                          ))}
                        </article>
                      )) || <p>{t('reviewNoReport')}</p>)}
                  </div>
                </div>
              </>
            );
          })()}
          {detalhe.podeRevisar && detalhe.sessao.relatorio && (
            <form
              className={styles.editor}
              onSubmit={(e) => {
                e.preventDefault();
                revisar();
              }}
            >
              <h3>{t('reviewRegister')}</h3>
              <p>{t('reviewRegisterHelp')}</p>
              <label>
                {t('reviewVerdict')}
                <select
                  value={parecer}
                  onChange={(e) => {
                    setParecer(e.target.value);
                    pending.current = null;
                  }}
                >
                  {['concordo', 'parcialmente', 'discordo'].map((v) => (
                    <option key={v} value={v}>
                      {t(`verdict_${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              {/* Com a matriz são 30 comportamentos: a lista abre só para quem vai marcar. */}
              <details className={styles.group}>
              <summary>{t('reviewDimensions')}</summary>
              <fieldset>
                {detalhe.sessao.relatorio.dimensoes.map((d: any) => (
                  <label className={styles.checkLabel} key={d.id}>
                    <input
                      type="checkbox"
                      checked={dimensoes.includes(d.id)}
                      onChange={(e) => {
                        pending.current = null;
                        setDimensoes(e.target.checked ? [...dimensoes, d.id] : dimensoes.filter((id) => id !== d.id));
                      }}
                    />
                    {d.nome || detalhe.sessao.cenario.competencias?.find((c: any) => c.id === d.id)?.nome || d.id}
                  </label>
                ))}
              </fieldset>
              </details>
              <label>
                {t('reviewReason')}
                <textarea
                  value={motivo}
                  maxLength={4000}
                  required
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    pending.current = null;
                  }}
                  placeholder={t('reviewReasonPlaceholder')}
                />
              </label>
              <button className={styles.primary} disabled={busy || !motivo.trim()}>
                {t('reviewSave')}
              </button>
            </form>
          )}
          {!detalhe.podeRevisar && <p className={styles.small}>{t('reviewNotAllowed')}</p>}
          <h3>{t('reviewRegistered')}</h3>
          {detalhe.revisoes.map((r: any) => (
            <article className={styles.group} key={r.id}>
              <strong>
                {r.revisor_nome} · {t(`verdict_${r.parecer}`)}
              </strong>
              <p>{r.motivo}</p>
              <small>{new Date(r.created_at).toLocaleString(locale)}</small>
            </article>
          ))}
          {!detalhe.revisoes.length && <p>{t('reviewNone')}</p>}
        </section>
      )}
    </section>
  );
}
