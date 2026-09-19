'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarDays,
  ClipboardList,
  MessageCircle,
  Send,
  RotateCcw,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { NIVEIS, rotuloClassificacao } from '@/lib/recepcao/schema';
import { DOMINIOS, DOMINIO_PADRAO, dominioExiste } from '@/lib/recepcao/dominio';
import { humanizarReferencias } from '@/lib/recepcao/texto';
import styles from './treino.module.css';
import MatrizAtendimento from './matriz-relatorio';
import GestaoRecepcao from './gestao';
import VozRecepcao from './voz';
import { posicaoNaConversa } from './relatorio-matriz';

// Fallback para relatórios anteriores à versão 1.0, que não gravavam `nome` na dimensão.
const nomes: Record<string, string> = {
  acolhimento: 'Acolhimento',
  compreensao: 'Compreensão da demanda',
  clareza: 'Clareza e precisão',
  resolucao: 'Resolução',
  procedimentos: 'Procedimentos',
  conducao_conflito: 'Condução sob pressão',
};
const DESFECHOS_CONHECIDOS = ['remarcado', 'encaminhado', 'orientado', 'nao_resolvido', 'inconclusivo'];

/**
 * Simulador de atendimento, visão de quem treina. Desde 18/09/2026 a tela não
 * fala de clínica, paciente nem secretária: o segmento vem do caso
 * (`lib/recepcao/dominio.ts`) e a pessoa simulada é chamada pelo nome. Textos
 * nos quatro idiomas (`SimuladorAtendimento`); o conteúdo dos casos segue no
 * idioma em que foi escrito.
 */
export default function TreinoRecepcao({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('SimuladorAtendimento');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const empresaNaUrl = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState<any[]>([]),
    [empresaId, setEmpresaId] = useState('');
  const [dados, setDados] = useState<any>(null),
    [sessao, setSessao] = useState<any>(null);
  const [carregando, setCarregando] = useState(true),
    [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState(''),
    [input, setInput] = useState('');
  const [podeConfigurar, setPodeConfigurar] = useState(false);
  const [confirmarFim, setConfirmarFim] = useState(false);
  const [aba, setAba] = useState<'treino' | 'equipe' | 'cenarios' | 'competencias'>('treino');
  const [cenarioId, setCenarioId] = useState('');
  const [vozOcupada, setVozOcupada] = useState(false);
  const pending = useRef<{ id: string; texto: string } | null>(null);
  const createId = useRef<string | null>(null),
    running = useRef(false),
    generation = useRef(0);
  const fim = useRef<HTMLDivElement>(null);
  const numero = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

  async function api(url: string, init?: RequestInit) {
    const res = await fetchAuth(url, { ...init, cache: 'no-store' });
    // 504 do gateway chega como HTML: sem o catch, a pessoa lia "Unexpected token".
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) throw new Error(body?.error || t('genericError'));
    return body;
  }
  async function carregar(id = empresaId, sessaoId?: string, ticket = generation.current) {
    const q = new URLSearchParams();
    if (admin && id) q.set('empresaId', id);
    if (sessaoId) q.set('sessaoId', sessaoId);
    const d = await api(`/api/recepcao?${q}`);
    if (ticket !== generation.current) return;
    setDados(d);
    setSessao(d.sessao);
    // Ao abrir um atendimento do histórico, o seletor passa para a versão
    // publicada do MESMO caso: "Praticar novamente" repete o que está na tela.
    const doCaso =
      sessaoId && d.sessao
        ? d.cenarios?.find((c: any) => c.ficha.cenarioId === d.sessao.cenario?.cenarioId)
        : null;
    // Mantém a escolha da pessoa; sem escolha, abre no degrau sugerido pelo histórico dela.
    setCenarioId((old) =>
      doCaso
        ? doCaso.id
        : d.cenarios?.some((c: any) => c.id === old)
          ? old
          : (d.cenarios?.find((c: any) => c.ficha.nivel === d.nivelSugerido) || d.cenarios?.[0])?.id || '',
    );
  }
  useEffect(() => {
    let alive = true;
    if (admin) {
      api('/api/recepcao/config')
        .then((d) => {
          if (!alive) return;
          setEmpresas(d.empresas);
          setPodeConfigurar(d.podeConfigurar);
        })
        .catch((e) => {
          if (alive) setErro(e.message);
        })
        .finally(() => {
          if (alive) setCarregando(false);
        });
    }
    return () => {
      alive = false;
      generation.current++;
    };
  }, [admin]);
  useEffect(() => {
    if (admin && empresaNaUrl && empresas.some((e) => e.id === empresaNaUrl)) setEmpresaId(empresaNaUrl);
  }, [admin, empresaNaUrl, empresas]);
  // Gestor e RH acompanham a equipe e não treinam (17/09/2026): a tela abre na aba da equipe.
  const soAcompanha = !admin && dados?.soAcompanha === true;
  useEffect(() => {
    if (soAcompanha && aba === 'treino') setAba('equipe');
  }, [soAcompanha, aba]);
  useEffect(() => {
    const ticket = ++generation.current;
    setDados(null);
    setSessao(null);
    setInput('');
    pending.current = null;
    createId.current = null;
    setConfirmarFim(false);
    setAba('treino');
    setCenarioId('');
    if (admin && !empresaId) return;
    setCarregando(true);
    setErro('');
    carregar(empresaId, undefined, ticket)
      .catch((e) => {
        if (ticket === generation.current) setErro(e.message);
      })
      .finally(() => {
        if (ticket === generation.current) setCarregando(false);
      });
  }, [admin, empresaId]);
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [sessao?.historico?.length, ocupado]);

  async function agir(acao: 'iniciar' | 'responder' | 'encerrar') {
    if (running.current) return;
    const texto = input.trim();
    if (acao === 'responder' && !texto) return;
    const ticket = generation.current;
    running.current = true;
    setOcupado(acao);
    setErro('');
    setConfirmarFim(false);
    const body: any = { acao, ...(admin ? { empresaId } : {}) };
    if (acao === 'iniciar') {
      createId.current ||= crypto.randomUUID();
      body.requestId = createId.current;
      body.cenarioId = cenarioId || undefined;
    } else {
      body.sessaoId = sessao.id;
      body.revisao = sessao.revisao;
    }
    if (acao === 'responder') {
      if (!pending.current || pending.current.texto !== texto) pending.current = { id: crypto.randomUUID(), texto };
      Object.assign(body, { requestId: pending.current.id, mensagem: texto });
    }
    try {
      const d = await api('/api/recepcao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (ticket !== generation.current) return;
      setSessao(d.sessao);
      if (acao === 'responder') {
        setInput('');
        pending.current = null;
      }
      if (acao === 'iniciar') {
        createId.current = null;
        setInput('');
        pending.current = null;
      }
      // Atualiza também a lista; falha nesta leitura não transforma um envio salvo em falha.
      await carregar(empresaId, d.sessao.id, ticket).catch(() => {});
    } catch (e: any) {
      if (ticket === generation.current) {
        setErro(e.message);
        // Recupera envio que pode ter sido confirmado após a conexão cair. ID pendente é preservado.
        if (sessao?.id) await carregar(empresaId, sessao.id, ticket).catch(() => {});
      }
    } finally {
      running.current = false;
      setOcupado('');
    }
  }
  async function configurar(mudanca: { habilitado?: boolean; dominio?: string }) {
    if (running.current) return;
    const ticket = generation.current;
    running.current = true;
    setOcupado('config');
    setErro('');
    try {
      await api('/api/recepcao/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, habilitado: dados.habilitado, ...mudanca }),
      });
      await carregar(empresaId, undefined, ticket);
    } catch (e: any) {
      if (ticket === generation.current) setErro(e.message);
    } finally {
      running.current = false;
      setOcupado('');
    }
  }
  async function abrirHistorico(id: string) {
    if (running.current) return;
    running.current = true;
    setOcupado('historico');
    setErro('');
    setInput('');
    pending.current = null;
    setConfirmarFim(false);
    const ticket = ++generation.current;
    try {
      await carregar(empresaId, id, ticket);
    } catch (e: any) {
      if (ticket === generation.current) setErro(e.message);
    } finally {
      running.current = false;
      setOcupado('');
    }
  }
  const ficha = sessao?.cenario || dados?.cenarios?.find((c: any) => c.id === cenarioId)?.ficha || dados?.ficha;
  const nomePersona = ficha?.nomePaciente || t('personFallback');
  // Segmento da EMPRESA no cabeçalho; o do CASO decide a régua do relatório (um caso antigo
  // continua lido no segmento em que foi feito, mesmo que a empresa mude de segmento).
  const dominioEmpresa = dominioExiste(dados?.dominio) ? dados.dominio : DOMINIO_PADRAO;
  const dominio = dominioExiste(sessao?.cenario?.dominio) ? sessao.cenario.dominio : dominioExiste(ficha?.dominio) ? ficha.dominio : dominioEmpresa;
  const relatorio = sessao?.relatorio;
  const nivelRotulo = (n?: string | null) => (n && (NIVEIS as readonly string[]).includes(n) ? t(`level_${n}`) : null);
  // As oportunidades vêm validadas pelo servidor (mensagem existente, trecho literal).
  // Ancorá-las na conversa mostra ONDE estava o momento, não só o que faltou.
  const momentos = new Map<string, Array<{ nome: string; classificacao: string }>>();
  for (const d of relatorio?.dimensoes || [])
    for (const o of d.oportunidades || [])
      momentos.set(o.mensagemId, [
        ...(momentos.get(o.mensagemId) || []),
        { nome: d.nome || nomes[d.id] || d.id, classificacao: d.classificacao },
      ]);
  const autor = (mensagemId: string) => {
    const p = posicaoNaConversa(sessao?.historico || [], mensagemId);
    if (!p) return nomePersona;
    return p.papel === 'user' ? t('yourReply', { n: p.ordem }) : t('personLine', { n: p.ordem, name: nomePersona });
  };
  // Relatórios gravados antes de 08/09 podem trazer "m11" no texto: vira posição na conversa ao
  // exibir. O texto do relatório é escrito pela IA em português, e a posição segue a mesma língua.
  const h = (texto: string) => humanizarReferencias(texto || '', sessao?.historico || [], nomePersona, 'voce', dominio);
  const travado = !!ocupado || vozOcupada || sessao?.processando;
  const emConversa = sessao && !relatorio;
  const desfecho = (tipo: string) =>
    DESFECHOS_CONHECIDOS.includes(tipo) ? t(`outcome_${tipo}`) : tipo.replaceAll('_', ' ');

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow', { segment: t(`segment_${dominioEmpresa}`) })}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <span className={styles.piloto}>{t('pilotBadge')}</span>
      </header>
      {admin && (
        <section className={styles.admin} aria-label={t('adminArea')}>
          <label>
            {t('company')}
            <select value={empresaId} disabled={!!ocupado} onChange={(e) => setEmpresaId(e.target.value)}>
              <option value="">{t('selectCompany')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          {dados && (
            <div>
              <p>{t(dados.habilitado ? 'enabledForTeam' : 'adminOnly')}</p>
              {podeConfigurar && (
                <>
                  <button
                    className={styles.secondary}
                    disabled={!!ocupado}
                    onClick={() => configurar({ habilitado: !dados.habilitado })}
                  >
                    {t(dados.habilitado ? 'disableForTeam' : 'enableForTeam')}
                  </button>
                  {/* Segmento da empresa (18/09/2026): decide os casos que a equipe vê. */}
                  <label className={styles.segmento}>
                    {t('segmentLabel')}
                    <select
                      value={dominioEmpresa}
                      disabled={!!ocupado}
                      onChange={(e) => configurar({ dominio: e.target.value })}
                    >
                      {DOMINIOS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {t(`segment_${d.id}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
        </section>
      )}
      {dados && (
        <nav className={styles.tabs} aria-label={t('areas')}>
          {!soAcompanha && (
            <button
              aria-current={aba === 'treino' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => {
                setAba('treino');
                carregar(empresaId, sessao?.id).catch((e) => setErro(e.message));
              }}
            >
              {t('tabTraining')}
            </button>
          )}
          {dados.podeEquipe && (
            <button
              aria-current={aba === 'equipe' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => setAba('equipe')}
            >
              {t('tabTeam')}
            </button>
          )}
          {dados.podeCenarios && (
            <button
              aria-current={aba === 'cenarios' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => setAba('cenarios')}
            >
              {t('tabCases')}
            </button>
          )}
          {dados.podeCenarios && (
            <button
              aria-current={aba === 'competencias' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => setAba('competencias')}
            >
              {t('tabCompetencies')}
            </button>
          )}
        </nav>
      )}
      {soAcompanha && !dados.podeEquipe && <div className={styles.empty}>{t('teamUnavailable')}</div>}
      {dados && aba !== 'treino' && !(soAcompanha && !dados.podeEquipe) && (
        <GestaoRecepcao key={`${empresaId}-${aba}`} empresaId={empresaId || dados.empresaId} visao={aba} admin={admin} />
      )}
      <div hidden={aba !== 'treino'}>
        {erro && (
          <div role="alert" className={styles.error}>
            <AlertCircle size={19} />
            <span>{erro}</span>
            <button
              onClick={() => {
                setErro('');
                carregar().catch((e) => setErro(e.message));
              }}
              disabled={!!ocupado}
            >
              {t('refresh')}
            </button>
          </div>
        )}
        {carregando ? (
          <div className={styles.empty}>
            <Loader2 className={styles.spin} /> {t('loading')}
          </div>
        ) : !dados ? (
          <div className={styles.empty}>{t(admin && !empresaId ? 'selectFirst' : 'unavailable')}</div>
        ) : !ficha ? (
          // Segmento sem caso publicado: nada de mostrar um caso de outro segmento.
          <div className={styles.empty}>{t('noCases', { segment: t(`segment_${dominioEmpresa}`) })}</div>
        ) : (
          <>
            <section className={styles.casePicker}>
              <label>
                {t('casePicker')}
                <select
                  value={cenarioId}
                  disabled={travado}
                  onChange={(e) => {
                    setCenarioId(e.target.value);
                    createId.current = null;
                  }}
                >
                  {[...NIVEIS, undefined].map((n) => {
                    const grupo = (dados.cenarios || []).filter((c: any) => (c.ficha.nivel || undefined) === n);
                    return grupo.length ? (
                      <optgroup key={n || 'outros'} label={nivelRotulo(n) || t('otherCases')}>
                        {grupo.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {/* A versão do caso é informação de quem edita, não de quem treina. */}
                            {admin ? `${c.ficha.titulo} · ${c.versao}` : c.ficha.titulo}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
              {sessao && (
                <button
                  className={styles.secondary}
                  disabled={travado}
                  onClick={() => {
                    setSessao(null);
                    setInput('');
                    setConfirmarFim(false);
                    pending.current = null;
                    createId.current = null;
                  }}
                >
                  {t('prepareAnother')}
                </button>
              )}
              <p className={styles.small}>
                {nivelRotulo(dados.nivelSugerido) && (
                  <>
                    {t('suggestedLevel')} <strong>{nivelRotulo(dados.nivelSugerido)}</strong>.{' '}
                  </>
                )}
                {t('caseHint')}
              </p>
            </section>
            <div className={`${styles.workspace} ${emConversa ? styles.chatPrimeiro : ''}`}>
              <aside className={styles.ficha} id="ficha-atendimento">
                <div className={styles.fichaTitle}>
                  <ClipboardList size={23} />
                  <div>
                    <span>{t('caseSheet')}</span>
                    <h2>{ficha.clinica || dados.empresaNome}</h2>
                  </div>
                </div>
                <p className={styles.small}>{t('caseSheetNote', { company: dados.empresaNome })}</p>
                <details open>
                  <summary>{t('situation')}</summary>
                  <p>{ficha.contexto}</p>
                  {ficha.agora && (
                    <p>
                      <strong>{t('reference')}</strong> {ficha.agora}
                    </p>
                  )}
                  {ficha.consultaAnterior && (
                    <p>
                      <strong>{t('previousBooking')}</strong> {ficha.consultaAnterior}
                    </p>
                  )}
                </details>
                {ficha.alternativas?.length > 0 && (
                  <details open>
                    <summary>{t('authorizedOptions')}</summary>
                    <div className={styles.slots}>
                      {ficha.alternativas.map((a: any) => (
                        <div key={a.id}>
                          <CalendarDays size={17} />
                          <div>
                            <strong>
                              {a.data} · {a.hora}
                            </strong>
                            <span>{a.profissional}</span>
                            {a.condicao && <small>{a.condicao}</small>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {ficha.secoes?.map((sec: any, i: number) => (
                  <details key={i} open>
                    <summary>{sec.titulo}</summary>
                    <ul>
                      {sec.itens.map((texto: string, j: number) => (
                        <li key={j}>{texto}</li>
                      ))}
                    </ul>
                  </details>
                ))}
                <details>
                  <summary>{t('procedures')}</summary>
                  <ul>
                    {ficha.procedimentos.map((p: string) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </details>
              </aside>
              <section className={styles.conversa} aria-label={t('conversation')}>
                <div className={styles.chatHeader}>
                  <div className={styles.avatar}>{nomePersona.slice(0, 1)}</div>
                  <div>
                    <h2>{sessao ? nomePersona : ficha.titulo}</h2>
                    <p>
                      {nivelRotulo(ficha.nivel) ? `${nivelRotulo(ficha.nivel)} · ` : ''}
                      {t(ficha.canal === 'telefone' ? 'channelPhone' : 'channelMessages')}
                    </p>
                  </div>
                  {sessao && (
                    <span className={styles.count}>
                      {t('replyCount', { n: sessao.respostas, max: ficha.limiteRespostas || 12 })}
                    </span>
                  )}
                  {emConversa && (
                    <a className={styles.linkFicha} href="#ficha-atendimento">
                      {t('seeCaseSheet')}
                    </a>
                  )}
                </div>
                {!sessao ? (
                  <div className={styles.start}>
                    <MessageCircle size={38} />
                    <h2>{t('startTitle')}</h2>
                    <p>{ficha.objetivo}</p>
                    <p>{ficha.competencias?.map((d: any) => d.nome).join(' · ')}</p>
                    <button className={styles.primary} onClick={() => agir('iniciar')} disabled={travado}>
                      {ocupado ? t('starting') : t('start')}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className={styles.messages}
                      role="log"
                      aria-label={t('conversationWith', { name: nomePersona })}
                      aria-live="polite"
                    >
                      {sessao.historico.map((m: any) => (
                        <article key={m.id} className={m.role === 'user' ? styles.sent : styles.received}>
                          <span>{m.role === 'user' ? t('you') : nomePersona}</span>
                          <p>{m.content}</p>
                          {momentos.has(m.id) && (
                            <footer className={styles.momento} aria-label={t('opportunityHere')}>
                              <span>{t('opportunity')}</span>
                              {/* Com 30 descritores, a fala de abertura pode ancorar dezenas: a lista vai ao relatório. */}
                              {momentos.get(m.id)!.slice(0, 5).map((x, i) => (
                                <em key={i} className={styles[`c_${x.classificacao}`]}>
                                  {x.nome}
                                </em>
                              ))}
                              {momentos.get(m.id)!.length > 5 && (
                                <em>{t('moreOpportunities', { n: momentos.get(m.id)!.length - 5 })}</em>
                              )}
                            </footer>
                          )}
                        </article>
                      ))}
                      {ocupado === 'responder' && (
                        <p className={styles.waiting}>
                          <Loader2 size={15} className={styles.spin} /> {t('personTyping', { name: nomePersona })}
                        </p>
                      )}
                      <div ref={fim} />
                    </div>
                    {emConversa && (
                      <div className={styles.composer}>
                        {sessao.status === RECEPCAO_SESSAO.EM_ANDAMENTO && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              agir('responder');
                            }}
                          >
                            <label className={styles.srOnly} htmlFor="recepcao-mensagem">
                              {t('replyLabel', { name: nomePersona })}
                            </label>
                            <textarea
                              id="recepcao-mensagem"
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              disabled={travado}
                              maxLength={4000}
                              placeholder={t('replyPlaceholder', { name: nomePersona })}
                              rows={3}
                            />
                            <button
                              className={styles.send}
                              type="submit"
                              aria-label={t('send')}
                              disabled={travado || !input.trim()}
                            >
                              <Send size={20} />
                            </button>
                          </form>
                        )}
                        {sessao.status === 'aguardando_avaliacao' && <p>{t('turnLimit')}</p>}
                        {sessao.processando && (
                          <p role="status">
                            {t('processing')}{' '}
                            <button
                              className={styles.link}
                              onClick={() => carregar(empresaId, sessao.id).catch((e) => setErro(e.message))}
                            >
                              {t('refreshConversation')}
                            </button>
                          </p>
                        )}
                        <VozRecepcao
                          key={sessao.id}
                          sessao={sessao}
                          nomePersona={nomePersona}
                          empresaId={admin ? empresaId : undefined}
                          disabled={travado}
                          onOcupado={setVozOcupada}
                          onTexto={(texto) => setInput((atual) => (atual.trim() ? `${atual}\n${texto}` : texto))}
                        />
                        <div className={styles.finish}>
                          <small>{t('fictitious')}</small>
                          {!confirmarFim ? (
                            <button
                              className={styles.secondary}
                              disabled={travado || !sessao.respostas}
                              onClick={() => setConfirmarFim(true)}
                            >
                              {t('finish')}
                            </button>
                          ) : (
                            <div>
                              <span>{t('confirmFinish')}</span>
                              <button className={styles.primary} disabled={travado} onClick={() => agir('encerrar')}>
                                {t('generateReport')}
                              </button>
                              <button className={styles.link} onClick={() => setConfirmarFim(false)}>
                                {t('continue')}
                              </button>
                            </div>
                          )}
                        </div>
                        {ocupado === 'encerrar' && (
                          <p role="status" className={styles.waiting}>
                            <Loader2 className={styles.spin} size={16} /> {t('analyzing')}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
            {relatorio && (
              <section className={styles.report} aria-label={t('report')}>
                <header>
                  <div>
                    <p className={styles.eyebrow}>{t('reportEyebrow')}</p>
                    <h2>{desfecho(relatorio.desfecho.tipo)}</h2>
                    <p>{h(relatorio.desfecho.justificativa)}</p>
                  </div>
                  {/* Com a matriz, a média aparece no relatório por competência. */}
                  {!relatorio.competencias && (
                    <div className={styles.score}>
                      <strong>{relatorio.nota === null ? '—' : numero(relatorio.nota)}</strong>
                      <span>
                        {t('scoreOf4', { coverage: Math.round(relatorio.coberturaPercentual).toLocaleString(locale) })}
                      </span>
                    </div>
                  )}
                </header>
                <p className={styles.small}>{t('reportDisclaimer')}</p>
                {relatorio.escalaOriginal && <p className={styles.small}>{t('legacyScale')}</p>}
                {!relatorio.competencias && relatorio.situacao === 'avaliacao_parcial' && (
                  <p className={styles.notice}>{t('partial')}</p>
                )}
                {relatorio.ocorrencias.length > 0 && (
                  <div className={styles.error}>
                    <AlertCircle />
                    <div>
                      <strong>{t('criticalTitle')}</strong>
                      {relatorio.ocorrencias.map((o: any, i: number) => (
                        <p key={i}>{h(o.motivo)}</p>
                      ))}
                    </div>
                  </div>
                )}
                {relatorio.competencias ? (
                  <div className={styles.matriz}>
                    <MatrizAtendimento
                      relatorio={relatorio}
                      historico={sessao.historico}
                      nomePersona={nomePersona}
                      dominio={dominio}
                    />
                  </div>
                ) : (
                  <div className={styles.dimensions}>
                    {relatorio.dimensoes.map((d: any) => (
                      <article key={d.id}>
                        <div>
                          <h3>{d.nome || nomes[d.id] || d.id}</h3>
                          <span>{rotuloClassificacao[d.classificacao] || d.classificacao}</span>
                        </div>
                        <p>{h(d.justificativa)}</p>
                        {d.evidencias.length > 0 && (
                          <section className={styles.evidencias}>
                            <span>{t('whatYouDid')}</span>
                            {d.evidencias.map((e: any, i: number) => (
                              <blockquote key={i}>“{e.trecho}”</blockquote>
                            ))}
                          </section>
                        )}
                        {d.oportunidades?.length > 0 && (
                          <section className={styles.momentos}>
                            <span>{t('whereOpportunity')}</span>
                            {d.oportunidades.map((o: any, i: number) => (
                              <blockquote key={i} className={styles.oportunidade}>
                                <small>{autor(o.mensagemId)}</small>“{o.trecho}”
                              </blockquote>
                            ))}
                          </section>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                <div className={styles.coaching}>
                  <div>
                    <CheckCircle2 size={21} />
                    <h3>{t('whatWorked')}</h3>
                    <p>{h(relatorio.feedback.acerto)}</p>
                  </div>
                  <div>
                    <ArrowRight size={21} />
                    <h3>{t('nextStep')}</h3>
                    <p>{h(relatorio.feedback.melhoria)}</p>
                    <p>{h(relatorio.feedback.novaTentativa)}</p>
                  </div>
                </div>
                <button className={styles.primary} disabled={travado} onClick={() => agir('iniciar')}>
                  <RotateCcw size={18} /> {t('practiceAgain')}
                </button>
              </section>
            )}
            {dados.historico?.length > 0 && (
              <section className={styles.history}>
                <h2>{t('history')}</h2>
                <div>
                  {dados.historico.map((item: any) => (
                    <button
                      key={item.id}
                      disabled={travado}
                      onClick={() => abrirHistorico(item.id)}
                      aria-current={sessao?.id === item.id ? 'true' : undefined}
                    >
                      <span>{item.titulo}</span>
                      <span>{new Date(item.data).toLocaleString(locale)}</span>
                      <strong>
                        {item.status === RECEPCAO_SESSAO.CONCLUIDA
                          ? [
                              item.nota === null ? t('noScore') : t('historyScore', { score: numero(item.nota) }),
                              item.escalaOriginal ? t('historyLegacy') : null,
                              item.situacao === 'atencao_critica' ? t('historyAttention') : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : t('resume')}
                      </strong>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
