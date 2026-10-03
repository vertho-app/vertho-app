'use client';
import { useEffect, useState, useRef } from 'react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { comRede, lerResposta } from '@/lib/simuladores/ler-resposta';
import { EditorCenario } from './editor';
import CompetenciasRecepcao from './competencias';
import { rotuloClassificacao } from '@/lib/recepcao/schema';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { descreverMensagem, humanizarReferencias } from '@/lib/recepcao/texto';
import styles from './treino.module.css';
import MatrizAtendimento from './matriz-relatorio';
import { posicaoNaConversa } from './relatorio-matriz';
import { casoEmBranco } from '@/lib/recepcao/caso-em-branco';
import { useLocale, useTranslations } from 'next-intl';
import EquipeVisao from './equipe-visao';

// Desfechos com rótulo traduzido; um desfecho personalizado do caso aparece como está.
const DESFECHOS_CONHECIDOS = ['remarcado', 'encaminhado', 'orientado', 'nao_resolvido', 'inconclusivo'];

// Próxima versão sugerida para o catálogo: 3.2 → 3.3; outro formato ganha sufixo .1.
const proximaVersao = (v: string) => {
  const m = /^(\d+)\.(\d+)$/.exec(v);
  return m ? `${m[1]}.${Number(m[2]) + 1}` : `${v}.1`;
};

export default function GestaoRecepcao({
  empresaId,
  visao,
  admin,
  dominio,
}: {
  empresaId: string;
  visao: 'equipe' | 'cenarios' | 'competencias';
  admin: boolean;
  /** Segmento da empresa: a aba Competências mostra a matriz DELE (27/09/2026). */
  dominio?: string;
}) {
  // A aba da equipe é de quem acompanha (RH, gestor): traduzida. Cenários
  // e editor seguem em português, como ferramenta interna da Vertho.
  const t = useTranslations('SimuladorAtendimento');
  const locale = useLocale();
  const numero = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const [dados, setDados] = useState<any>(null),
    [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  // A rota diz se quem abriu PODE EDITAR os casos (`simulador.casos.manage`). O
  // Sócio lê: vê a biblioteca e abre cada caso travado, sem criar, publicar nem
  // arquivar. Sem a resposta ainda, nada de botão de edição.
  const podeEditar = dados?.podeEditar === true;
  const [dias, setDias] = useState('30'),
    [testes, setTestes] = useState(false),
    [detalhe, setDetalhe] = useState<any>(null),
    [editor, setEditor] = useState<any>(null);
  const generation = useRef(0);
  // Ao abrir um atendimento, o detalhe entra na tela e recebe o foco, como o relatório de
  // quem treina: no celular ele começava a 834 px numa tela de 844 e parecia que nada
  // tinha acontecido (27/09/2026).
  const detalheRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!detalhe) return;
    detalheRef.current?.focus({ preventScroll: true });
    detalheRef.current?.scrollIntoView({ block: 'start' });
  }, [detalhe]);
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
    // Leitura tolerante (R-97, 03/10/2026): o rascunho por IA leva até 90 s, e um
    // 502/504 do gateway chega em HTML; `r.json()` cru mostrava "Unexpected
    // token '<'" em inglês, e a queda de rede, "Failed to fetch".
    const r = await comRede(
      fetchAuth(
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
      ),
      t('networkError'),
    );
    return lerResposta(
      r,
      { semCorpo: t('unreadableResponse'), generica: t('genericError') },
      (d) =>
        Array.isArray(d.campos) && d.campos.length
          ? d.campos.map((c: any) => `${c.campo}: ${c.erro}`).join('\n')
          : null,
    );
  }
  async function carregar(ticket = generation.current) {
    if (visao === 'competencias') return; // a aba tem o próprio componente
    const d = await api({ visao, dias, testes: testes ? '1' : '0' });
    // A biblioteca `recepcao_competencias` não é mais lida aqui (27/09/2026): o editor monta a
    // rubrica pela matriz do segmento, e a leitura a cada abertura não alterava nada.
    if (ticket === generation.current) setDados(d);
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
    return <CompetenciasRecepcao empresaId={empresaId} admin={admin} dominio={dominio} />;
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
          admin={admin}
          somenteLeitura={!podeEditar}
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
          podeEditar && <div className={styles.filters}>
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
                    {global ? 'Catálogo Vertho' : 'Da empresa'} · {r.estado}
                  </p>
                  <h3>{r.conteudo.publico.titulo}</h3>
                  <p>{r.conteudo.publico.objetivo}</p>
                  <small>
                    {r.versao} · {r.conteudo.rubrica.length} competências ·{' '}
                    {r.conteudo.variantes?.length
                      ? `${1 + r.conteudo.variantes.length} pessoas simuladas`
                      : '1 pessoa simulada'}
                  </small>
                  <div className={styles.filters}>
                    {!podeEditar && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => setEditor(r)}
                      >
                        Ver caso
                      </button>
                    )}
                    {podeEditar && r.estado === 'rascunho' && (!global || admin) && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => setEditor(r)}
                      >
                        Editar rascunho
                      </button>
                    )}
                    {podeEditar && r.estado !== 'rascunho' && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          setEditor({ conteudo: structuredClone(r.conteudo) })
                        }
                      >
                        {global ? 'Copiar para a empresa' : 'Criar nova versão'}
                      </button>
                    )}
                    {podeEditar && global && admin && r.estado !== 'rascunho' && (
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
                    {podeEditar && (!global || admin) && r.estado !== 'arquivado' && (
                      <button
                        className={styles.link}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              global
                                ? 'Arquivar esta versão do catálogo para todas as empresas? Treinos anteriores continuam disponíveis.'
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
            {t('teamToFollowHelp', { done: dados.concluidas, started: dados.iniciadas })}
          </p>
          {/* No celular a tabela vira cartões (27/09/2026): a coluna "Ação" ficava fora da tela. */}
          <div className={`${styles.tableWrap} ${styles.cartoesNoCelular}`}>
            <table>
              <thead>
                <tr>
                  <th>{t('teamPersonCase')}</th>
                  <th>{t('teamDate')}</th>
                  <th>{t('teamResult')}</th>
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
                    <td data-rotulo={t('teamDate')}>{new Date(s.data).toLocaleDateString(locale)}</td>
                    <td data-rotulo={t('teamResult')}>
                      {/* Pelo status, como o histórico de quem treina: concluído sem média
                          geral (regra de cobertura) não é "Em andamento" (27/09/2026). */}
                      {s.status !== RECEPCAO_SESSAO.CONCLUIDA
                        ? t('teamInProgress')
                        : s.nota === null
                          ? t('noScore')
                          : t('scoreOf4Short', { score: numero(s.nota) })}
                      {s.critica ? ` · ${t('historyAttention')}` : ''}
                    </td>
                    <td>
                      {/* Só o atendimento CONCLUÍDO abre para a equipe (decisão 5 da
                          revisão de 02/10/2026): o servidor recusa os demais. */}
                      {s.status === RECEPCAO_SESSAO.CONCLUIDA ? (
                        <button className={styles.link} disabled={busy} onClick={() => abrir(s.id)}>
                          {t('teamOpen')}
                        </button>
                      ) : (
                        <span className={styles.small}>{t('teamOpenWhenDone')}</span>
                      )}
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
        <section ref={detalheRef} tabIndex={-1} className={styles.review} aria-label={t('reviewArea')}>
          <header className={styles.sectionHead}>
            <h2>{detalhe.sessao.cenario.titulo}</h2>
            <button className={styles.secondary} onClick={() => setDetalhe(null)}>
              {t('reviewClose')}
            </button>
          </header>
          {(() => {
            // A equipe não recebe a conversa (decisão 5 da revisão de 02/10/2026):
            // só as referências de cada mensagem (id e papel), para situar as citações.
            const refs = detalhe.sessao.referencias || [],
              nome = detalhe.sessao.cenario.nomePaciente,
              rel = detalhe.sessao.relatorio;
            // Posição na conversa em terceira pessoa ("2ª resposta de quem atende"), traduzida.
            const pos = (id: string) => {
              const p = posicaoNaConversa(refs, id);
              if (!p) return id;
              return p.papel === 'user' ? t('teamReply', { n: p.ordem }) : t('personLine', { n: p.ordem, name: nome });
            };
            // O texto do relatório é escrito pela IA em português: a posição segue a mesma língua.
            const h = (texto: string) =>
              humanizarReferencias(texto || '', refs, nome, 'terceira', detalhe.sessao.cenario.dominio);
            return (
              <>
                {/* O que a pessoa recebeu (18/09/2026): quem acompanhava lia só a matriz. */}
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
                    <h3>{t('reviewConversationPrivateTitle')}</h3>
                    <p className={styles.small}>{t('reviewConversationPrivate')}</p>
                  </div>
                  <div>
                    <h3>{t('reviewAi')}</h3>
                    {rel?.competencias && (
                      <MatrizAtendimento
                        relatorio={rel}
                        historico={refs}
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
        </section>
      )}
    </section>
  );
}
