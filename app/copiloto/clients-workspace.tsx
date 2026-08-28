'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Building2, Check, ChevronRight, CircleAlert,
  ClipboardPaste, Clock3, FileText, History, LoaderCircle, MapPin, MessageSquareText,
  Plus, Search, ShieldCheck, Sparkles, UserRound, UsersRound,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { DISCOVERY_CHECKLIST } from '@/lib/copiloto/types';
import { STAGE_LABELS, type PipelineStage } from '@/lib/sales/constants';
import type {
  CopilotAccountDetail,
  CopilotAccountListItem,
  CopilotAccountMemory,
  CopilotConversation,
  CopilotEvolutionStatus,
} from '@/lib/copiloto/types';
import styles from './copiloto.module.css';

type AccountFilter = 'all' | 'prospect' | 'active_client';

const STATUS_LABELS = {
  prospect: 'Lead', active_client: 'Cliente', inactive: 'Inativo', lost: 'Perdido',
} as const;

const EVOLUTION_LABELS: Record<CopilotEvolutionStatus, string> = {
  novo: 'Novo', confirmado: 'Confirmado', mudou: 'Mudou', pendente: 'Pendente',
};

function formatDate(value: string | null): string {
  if (!value) return 'Sem conversa';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function localDateTimeValue(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function compactMemory(memory: CopilotAccountMemory): string {
  const lines = [
    memory.situation.length ? `Situação atual: ${memory.situation.join(' | ')}` : '',
    memory.pains.length ? `Dores: ${memory.pains.join(' | ')}` : '',
    memory.impacts.length ? `Impactos: ${memory.impacts.join(' | ')}` : '',
    memory.attempts.length ? `Tentativas anteriores: ${memory.attempts.join(' | ')}` : '',
    memory.decisionCriteria.length ? `Critérios de decisão: ${memory.decisionCriteria.join(' | ')}` : '',
    memory.stakeholders.length ? `Pessoas envolvidas: ${memory.stakeholders.join(' | ')}` : '',
    memory.budget.length ? `Orçamento: ${memory.budget.join(' | ')}` : '',
    memory.timing.length ? `Prazo: ${memory.timing.join(' | ')}` : '',
    memory.objections.length ? `Objeções: ${memory.objections.join(' | ')}` : '',
    memory.commitments.length ? `Combinados: ${memory.commitments.join(' | ')}` : '',
    memory.nextStep ? `Próximo passo: ${memory.nextStep}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function preparationContext(detail: CopilotAccountDetail): string {
  const latest = detail.conversations.reduce<CopilotConversation | null>((current, conversation) => (
    !current || new Date(conversation.createdAt).getTime() > new Date(current.createdAt).getTime() ? conversation : current
  ), null);
  const recent = detail.conversations.slice(0, 4).map((conversation) => (
    `${formatDate(conversation.happenedAt)} — ${conversation.title}: ${conversation.summary}`
  ));
  const opportunities = detail.opportunities.filter((item) => item.status === 'open').slice(0, 3).map((item) => (
    `${item.name} | estágio: ${STAGE_LABELS[item.stage as PipelineStage] || item.stage}`
      + `${item.identifiedNeed ? ` | necessidade: ${item.identifiedNeed}` : ''}`
      + `${item.nextAction ? ` | próxima ação: ${item.nextAction}` : ''}`
  ));
  return [
    `MEMÓRIA COMERCIAL — ${detail.account.name}`,
    detail.account.notes ? `Notas do CRM: ${detail.account.notes}` : '',
    opportunities.length ? `Oportunidades abertas:\n${opportunities.map((item) => `- ${item}`).join('\n')}` : '',
    latest ? compactMemory(latest.analysis.memory) : '',
    recent.length ? `Últimas conversas:\n${recent.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 30000);
}

function MemoryList({ items, empty }: { items: string[]; empty: string }) {
  return items.length
    ? <ul>{items.slice(0, 6).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
    : <p>{empty}</p>;
}

export default function ClientsWorkspace({
  initialAccounts,
  canCreateLeads,
  onPrepare,
}: {
  initialAccounts: CopilotAccountListItem[];
  canCreateLeads: boolean;
  onPrepare: (seed: { company: string; context: string; opportunityId: string }) => void;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedId, setSelectedId] = useState<string | null>(initialAccounts[0]?.id || null);
  const [detail, setDetail] = useState<CopilotAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [query, setQuery] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [happenedAt, setHappenedAt] = useState(localDateTimeValue);
  const [opportunityId, setOpportunityId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const loadDetail = useCallback(async (accountId: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchAuth(`/api/copiloto/clientes/${encodeURIComponent(accountId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao abrir o cliente');
      if (requestId !== detailRequestRef.current) return;
      setDetail(data.detail);
      const openOpportunity = data.detail?.opportunities?.find((item: any) => item.status === 'open');
      setOpportunityId(openOpportunity?.id || '');
    } catch (err: any) {
      if (requestId !== detailRequestRef.current) return;
      setDetail(null);
      setError(err?.message || 'Não foi possível abrir o cliente');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => void loadDetail(selectedId), 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail, selectedId]);

  const filteredAccounts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return accounts.filter((account) => {
      if (filter !== 'all' && account.status !== filter) return false;
      if (!term) return true;
      return [account.name, account.legalName, account.segment, account.city, account.representativeName]
        .filter(Boolean).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [accounts, filter, query]);

  async function pasteConversation() {
    setError(null);
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard-unavailable');
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setError('A área de transferência está vazia. Copie a transcrição e tente novamente.');
        return;
      }
      setTranscript((current) => [current.trim(), text].filter(Boolean).join('\n\n').slice(0, 30000));
    } catch {
      setError('O navegador bloqueou a área de transferência. Clique no campo e use Ctrl+V.');
    }
  }

  async function saveConversation() {
    if (!selectedId || transcript.trim().length < 20) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetchAuth(`/api/copiloto/clientes/${encodeURIComponent(selectedId)}/conversas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          happenedAt: happenedAt ? new Date(happenedAt).toISOString() : new Date().toISOString(),
          opportunityId,
          transcript,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao salvar a conversa');
      const conversation = data.conversation as CopilotConversation;
      setDetail((current) => current ? {
        ...current,
        conversations: [conversation, ...current.conversations]
          .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime()),
      } : current);
      setAccounts((current) => current.map((account) => account.id === selectedId ? {
        ...account,
        conversationCount: account.conversationCount + 1,
        lastConversationAt: conversation.happenedAt,
      } : account));
      setTranscript('');
      setTitle('');
      setHappenedAt(localDateTimeValue());
      setComposerOpen(false);
      setNotice('Conversa analisada e adicionada ao histórico.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a conversa');
    } finally {
      setSaving(false);
    }
  }

  function prepareNextConversation() {
    if (!detail) return;
    const selectedOpportunity = detail.opportunities.find((item) => item.id === opportunityId)
      || detail.opportunities.find((item) => item.status === 'open');
    onPrepare({
      company: detail.account.name,
      context: preparationContext(detail),
      opportunityId: selectedOpportunity?.id || '',
    });
  }

  const latest = detail?.conversations.reduce<CopilotConversation | null>((current, conversation) => (
    !current || new Date(conversation.createdAt).getTime() > new Date(current.createdAt).getTime() ? conversation : current
  ), null) || null;
  const memory = latest?.analysis.memory || null;

  return (
    <section className={styles.clientsWorkspace} aria-label="Leads e clientes">
      <aside className={styles.clientRail}>
        <header>
          <div><p className={styles.eyebrow}>Memória comercial</p><h2>Leads e clientes</h2></div>
          {canCreateLeads && <Link href="/representante/crm/nova" aria-label="Cadastrar novo lead"><Plus size={16} /></Link>}
        </header>

        <label className={styles.clientSearch}>
          <Search size={14} />
          <span className={styles.srOnly}>Buscar empresa</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa…" />
        </label>

        <div className={styles.clientFilters} aria-label="Filtrar contas">
          <button className={filter === 'all' ? styles.filterActive : ''} onClick={() => setFilter('all')}>Todos <span>{accounts.length}</span></button>
          <button className={filter === 'prospect' ? styles.filterActive : ''} onClick={() => setFilter('prospect')}>Leads</button>
          <button className={filter === 'active_client' ? styles.filterActive : ''} onClick={() => setFilter('active_client')}>Clientes</button>
        </div>

        <div className={styles.clientList}>
          {filteredAccounts.map((account) => (
            <button key={account.id} className={account.id === selectedId ? styles.clientActive : ''} onClick={() => {
              setSelectedId(account.id);
              setComposerOpen(false);
              setNotice(null);
            }}>
              <span className={styles.clientMonogram}>{account.name.slice(0, 2).toUpperCase()}</span>
              <span className={styles.clientIdentity}>
                <strong>{account.name}</strong>
                <small>{STATUS_LABELS[account.status]}{account.currentStage ? ` · ${STAGE_LABELS[account.currentStage as PipelineStage] || account.currentStage.replaceAll('_', ' ')}` : ''}</small>
                <em><Clock3 size={11} /> {formatDate(account.lastConversationAt)}{account.representativeName ? ` · ${account.representativeName}` : ''}</em>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!filteredAccounts.length && (
            <div className={styles.noClients}><UsersRound size={23} /><p>Nenhuma empresa neste filtro.</p>{canCreateLeads && <Link href="/representante/crm/nova">Cadastrar lead</Link>}</div>
          )}
        </div>
      </aside>

      <div className={styles.clientDetail}>
        {error && <div className={styles.clientMessage} data-tone="error"><CircleAlert size={15} /><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
        {notice && <div className={styles.clientMessage} data-tone="success"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice(null)}>Fechar</button></div>}

        {detailLoading ? (
          <div className={styles.clientLoading}><LoaderCircle size={25} className={styles.spin} /> Abrindo memória comercial…</div>
        ) : detail ? (
          <>
            <header className={styles.clientDetailHeader}>
              <div>
                <div className={styles.accountStatus}><span data-status={detail.account.status}>{STATUS_LABELS[detail.account.status]}</span>{detail.account.segment && <em>{detail.account.segment}</em>}</div>
                <h2>{detail.account.name}</h2>
                <p>
                  {(detail.account.city || detail.account.state) && <span><MapPin size={13} /> {[detail.account.city, detail.account.state].filter(Boolean).join(' / ')}</span>}
                  {detail.contacts[0] && <span><UserRound size={13} /> {detail.contacts[0].name}{detail.contacts[0].role ? ` · ${detail.contacts[0].role}` : ''}</span>}
                </p>
              </div>
              <div className={styles.clientActions}>
                <button className={styles.quietAction} onClick={() => setComposerOpen((current) => !current)}><MessageSquareText size={15} /> Registrar conversa</button>
                <button className={styles.primaryAction} onClick={prepareNextConversation}><Sparkles size={15} /> Planejar próxima</button>
              </div>
            </header>

            {composerOpen && (
              <section className={styles.conversationComposer}>
                <header><div><span>Novo registro</span><h3>Transforme a transcrição em memória</h3></div><ShieldCheck size={18} /></header>
                <div className={styles.composerMeta}>
                  <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Ex.: Diagnóstico com RH" /></label>
                  <label>Quando<input type="datetime-local" value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} /></label>
                  <label>Oportunidade<select value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}><option value="">Relacionamento geral</option>{detail.opportunities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className={styles.composerTranscript}>
                  <div><label htmlFor="client-transcript">Transcrição</label><button onClick={() => void pasteConversation()}><ClipboardPaste size={13} /> Colar transcrição</button></div>
                  <textarea id="client-transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={9} maxLength={30000} placeholder="Cole aqui a transcrição da conversa…" />
                  <small>A transcrição só é enviada e salva quando você clicar em “Analisar e salvar”.</small>
                </div>
                <div className={styles.composerActions}>
                  <button className={styles.primaryAction} disabled={saving || transcript.trim().length < 20} onClick={() => void saveConversation()}>{saving ? <><LoaderCircle size={15} className={styles.spin} /> Analisando histórico…</> : <><Sparkles size={15} /> Analisar e salvar</>}</button>
                  <button className={styles.quietAction} disabled={saving} onClick={() => setComposerOpen(false)}>Cancelar</button>
                </div>
              </section>
            )}

            <section className={styles.memoryBoard}>
              <header><div><p className={styles.eyebrow}>Leitura acumulada</p><h3>O que sabemos agora</h3></div><span>{detail.conversations.length} {detail.conversations.length === 1 ? 'conversa' : 'conversas'}</span></header>
              {memory ? (
                <>
                  <div className={styles.memoryGrid}>
                    <article><span>Realidade atual</span><MemoryList items={[...memory.situation, ...memory.attempts]} empty="Ainda não registrada." /></article>
                    <article><span>Dor e impacto</span><MemoryList items={[...memory.pains, ...memory.impacts]} empty="Ainda não dimensionados." /></article>
                    <article><span>Decisão</span><MemoryList items={[...memory.stakeholders, ...memory.decisionCriteria, ...memory.budget, ...memory.timing]} empty="Decisão ainda não mapeada." /></article>
                    <article><span>Tensões</span><MemoryList items={memory.objections} empty="Nenhuma objeção explícita." /></article>
                  </div>
                  <div className={styles.nextCommitment}><ArrowRight size={18} /><div><span>Próximo movimento</span><strong>{memory.nextStep || 'Ainda não houve um próximo passo acordado.'}</strong>{memory.commitments.length > 0 && <small>{memory.commitments.join(' · ')}</small>}</div></div>
                </>
              ) : (
                <div className={styles.emptyMemory}><History size={27} /><div><h4>A memória começa na primeira conversa</h4><p>Cole uma transcrição para a IA separar fatos, mudanças, pendências e próximos passos.</p></div><button onClick={() => setComposerOpen(true)}>Registrar primeira conversa</button></div>
              )}
            </section>

            <section className={styles.conversationHistory}>
              <header><div><p className={styles.eyebrow}>Linha do tempo</p><h3>Evolução das conversas</h3></div><History size={19} /></header>
              {detail.conversations.length ? (
                <div className={styles.conversationRail}>
                  {detail.conversations.map((conversation, index) => (
                    <article key={conversation.id} className={styles.conversationCard}>
                      <div className={styles.conversationMarker}><span>{String(detail.conversations.length - index).padStart(2, '0')}</span></div>
                      <div>
                        <header>
                          <div><time>{formatDate(conversation.happenedAt)}</time><h4>{conversation.title}</h4></div>
                          <span><FileText size={12} /> {conversation.source === 'paste' ? 'Transcrição colada' : conversation.source.replaceAll('_', ' ')}</span>
                        </header>
                        <p>{conversation.summary}</p>
                        {!!conversation.analysis.evolution.length && <div className={styles.evolutionList}>{conversation.analysis.evolution.map((item, itemIndex) => <div key={`${item.text}-${itemIndex}`} data-status={item.status}><span>{EVOLUTION_LABELS[item.status]}</span><strong>{item.text}</strong>{item.evidence && <small>{item.evidence}</small>}</div>)}</div>}
                        {!!conversation.analysis.paceCoverage.length && <div className={styles.coverageTags}>{conversation.analysis.paceCoverage.map((key) => <span key={key}>{DISCOVERY_CHECKLIST.find((item) => item.key === key)?.label || key}</span>)}</div>}
                        <details><summary>Ver transcrição</summary><pre>{conversation.transcript}</pre></details>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className={styles.historyEmpty}>Nenhuma conversa salva para este cliente.</p>}
            </section>
          </>
        ) : selectedId ? null : (
          <div className={styles.clientLoading}><Building2 size={27} /> Selecione uma empresa para abrir a memória.</div>
        )}
      </div>
    </section>
  );
}
