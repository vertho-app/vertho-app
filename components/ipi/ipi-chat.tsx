'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowUp, BookOpen, Check, ChevronDown, Code2, Database, Loader2, RotateCcw, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AdminShellContext } from '@/app/admin/_shell/AdminShellContext';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import type { IpiReply } from '@/lib/ipi/contracts';
import styles from './ipi-chat.module.css';

type Message = { role: 'user' | 'assistant'; content: string; sources?: IpiReply['sources'] };
const suggestions = ['Como preencher esta tela?', 'Onde encontro os relatórios?', 'Quais são os pré-requisitos aqui?'];

export default function IpiChat() {
  const pathname = usePathname() || '/admin';
  const search = useSearchParams();
  const shell = useContext(AdminShellContext);
  const fromPath = pathname.match(/^\/admin(?:-v2)?\/(?:empresas|clientes)\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  const selected = fromPath || search?.get('empresa') || (shell?.empresaFiltro !== 'all' ? shell?.empresaFiltro : null);
  const empresaId = selected && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selected) ? selected : null;
  const companyName = shell?.empresaSelecionada?.id === empresaId ? shell.empresaSelecionada.nome : empresaId ? 'Empresa desta tela' : 'Nenhuma empresa selecionada';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const lastCompany = useRef(empresaId);

  function reset() {
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
    setBusy(false); setMessages([]); setError(''); setDraft('');
    textarea.current?.focus();
  }

  useEffect(() => {
    if (lastCompany.current !== empresaId) {
      lastCompany.current = empresaId;
      reset(); // histórico de uma empresa nunca acompanha o contexto de outra
    }
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) { dialog.current?.showModal(); textarea.current?.focus(); }
    else if (dialog.current?.open) { dialog.current.close(); launcher.current?.focus(); }
  }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy, error]);
  useEffect(() => () => { generation.current += 1; pending.current?.abort(); }, []);

  async function send(value = draft) {
    const message = value.trim();
    if (!message || busy || pending.current || message.length > 2400) return;
    const controller = new AbortController();
    pending.current = controller;
    const requestGeneration = ++generation.current;
    const history = messages.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 6500) }));
    setMessages(current => [...current, { role: 'user', content: message }]);
    setDraft(''); setError(''); setBusy(true);
    const timeout = window.setTimeout(() => controller.abort(), 115_000);
    try {
      const response = await fetchAuth('/api/ipi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ message, history, pathname, empresaId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 429 ? 'Muitas perguntas em sequência. Aguarde um minuto e tente novamente.' : result.error || 'Não consegui concluir a consulta. Tente novamente.');
      if (requestGeneration !== generation.current) return;
      setMessages(current => [...current, { role: 'assistant', content: result.answer, sources: result.sources }]);
    } catch (cause) {
      if (requestGeneration !== generation.current) return;
      setMessages(current => current.slice(0, -1));
      setDraft(message);
      setError(controller.signal.aborted ? 'A consulta demorou mais que o esperado. Sua pergunta foi preservada para tentar novamente.' : cause instanceof Error ? cause.message : 'Não consegui concluir a consulta. Tente novamente.');
    } finally {
      window.clearTimeout(timeout);
      if (requestGeneration === generation.current) { setBusy(false); pending.current = null; textarea.current?.focus(); }
    }
  }

  return <>
    <button ref={launcher} type="button" className={styles.launcher} onClick={() => setOpen(true)} aria-label="Abrir Ipi, assistente da plataforma" aria-haspopup="dialog" aria-expanded={open}>
      <span className={styles.mark} aria-hidden="true">ipi</span><span>Ajuda com o Ipi</span>
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="ipi-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">ipi</span>
        <div className={styles.identity}><h2 id="ipi-title">Ipi</h2><p>Seu guia pela Vertho</p></div>
        <button type="button" className={styles.iconButton} onClick={reset} aria-label="Nova conversa" title="Nova conversa"><RotateCcw size={17} /></button>
        <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label="Fechar Ipi"><X size={20} /></button>
      </header>
      <div className={styles.context}><span className={styles.contextDot} /><span title={companyName}>{companyName}</span><span className={styles.readonly}><Check size={12} /> Só consulta</span></div>
      <div className={styles.conversation} role="log" aria-label="Conversa com o Ipi" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && <div className={styles.welcome}>
          <span className={styles.eyebrow}>PODE PERGUNTAR</span>
          <h3>Um caminho para<br />cada dúvida.</h3>
          <p>Eu ajudo você a preencher campos, encontrar relatórios e entender os próximos passos na plataforma.</p>
          <div className={styles.suggestions}>{suggestions.map(question => <button key={question} type="button" onClick={() => void send(question)}>{question}<ArrowUp size={15} className={styles.suggestionArrow} /></button>)}</div>
          <div className={styles.sourcesHint}><BookOpen size={14} /> Manual <span>·</span><Code2 size={14} /> Plataforma <span>·</span><Database size={14} /> Dados</div>
        </div>}
        {messages.map((message, index) => <article key={index} className={message.role === 'user' ? styles.userMessage : styles.answer}>
          {message.role === 'assistant' && <span className={styles.answerLabel}>Ipi</span>}
          <div className={styles.markdown}><ReactMarkdown skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}>{message.content}</ReactMarkdown></div>
          {!!message.sources?.length && <details className={styles.sources}>
            <summary><BookOpen size={13} /> Fontes consultadas <ChevronDown size={13} /></summary>
            <ul>{message.sources.map(source => <li key={source.id}><span className={styles.sourceKind}>{source.id} · {source.kind === 'codigo' ? 'Código' : source.kind === 'dados' ? 'Dados' : 'Manual'}</span><span className={styles.sourceReference}>{source.reference}</span>{source.href && <a href={source.href} onClick={() => setOpen(false)}>Abrir {source.title} ↗</a>}</li>)}</ul>
          </details>}
        </article>)}
        {busy && <div className={styles.thinking} role="status"><Loader2 size={16} /> Consultando as referências…</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div ref={end} />
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
        <label className={styles.srOnly} htmlFor="ipi-question">Sua dúvida sobre a plataforma</label>
        <div className={styles.inputRow}><textarea ref={textarea} id="ipi-question" rows={2} maxLength={2400} value={draft} onChange={event => setDraft(event.target.value)} placeholder="O que você precisa saber?" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><button type="submit" disabled={busy || !draft.trim()} aria-label="Enviar pergunta">{busy ? <Loader2 size={19} className={styles.spinner} /> : <ArrowUp size={20} />}</button></div>
        <p>Oriento você. As decisões e ações continuam nas suas mãos.</p>
      </form>
    </dialog>
  </>;
}
