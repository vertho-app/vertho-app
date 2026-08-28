'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Building2, Check, ChevronRight, CircleAlert, ClipboardPaste,
  Clock3, FileText, History, LoaderCircle, NotebookPen, Plus, Search, Sparkles,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { createSalesAccount } from '@/actions/sales/accounts';
import type {
  CopilotAccountDetail,
  CopilotAccountListItem,
  CopilotAccountMemory,
  CopilotConversation,
  CopilotSavedPlan,
} from '@/lib/copiloto/types';
import styles from './copiloto.module.css';

export type CopilotPreparationSeed = {
  accountId: string;
  company: string;
  context: string;
  opportunityId: string;
  site: string;
  socialProfiles: string;
  offer: string;
};

export type CopilotOpenPlanSeed = CopilotPreparationSeed & {
  planning: CopilotSavedPlan;
};

function formatDate(value: string | null): string {
  if (!value) return 'Ainda sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function localDateTimeValue(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function latestDate(account: CopilotAccountListItem): string | null {
  const candidates = [account.lastConversationAt, account.lastPlanningAt]
    .filter((value): value is string => !!value)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return candidates[0] || null;
}

function compactMemory(memory: CopilotAccountMemory): string {
  return [
    memory.situation.length ? `Situação atual: ${memory.situation.join(' | ')}` : '',
    memory.pains.length ? `Dores: ${memory.pains.join(' | ')}` : '',
    memory.impacts.length ? `Impactos: ${memory.impacts.join(' | ')}` : '',
    memory.decisionCriteria.length ? `Critérios de decisão: ${memory.decisionCriteria.join(' | ')}` : '',
    memory.stakeholders.length ? `Pessoas envolvidas: ${memory.stakeholders.join(' | ')}` : '',
    memory.objections.length ? `Objeções: ${memory.objections.join(' | ')}` : '',
    memory.commitments.length ? `Combinados: ${memory.commitments.join(' | ')}` : '',
    memory.nextStep ? `Próximo passo: ${memory.nextStep}` : '',
  ].filter(Boolean).join('\n');
}

function preparationContext(detail: CopilotAccountDetail): string {
  const latestResult = detail.conversations[0] || null;
  const latestPlanning = detail.plans[0] || null;
  const recent = detail.conversations.slice(0, 4).map((conversation) => (
    `- ${formatDate(conversation.happenedAt)} — ${conversation.title}: ${conversation.summary}`
  ));
  return [
    `CONTINUIDADE COMERCIAL — ${detail.account.name}`,
    latestPlanning?.plan?.objectives?.primary
      ? `Objetivo do planejamento anterior: ${latestPlanning.plan.objectives.primary}`
      : '',
    latestResult ? `Resultado da última reunião:\n${latestResult.summary}` : '',
    latestResult ? compactMemory(latestResult.analysis.memory) : '',
    recent.length ? `Histórico recente:\n${recent.join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 30000);
}

function planningSeed(detail: CopilotAccountDetail, planning?: CopilotSavedPlan | null): CopilotPreparationSeed {
  const latest = planning || detail.plans[0] || null;
  const opportunity = detail.opportunities.find((item) => item.id === latest?.opportunityId)
    || detail.opportunities.find((item) => item.status === 'open');
  return {
    accountId: detail.account.id,
    company: detail.account.name,
    context: preparationContext(detail),
    opportunityId: opportunity?.id || '',
    site: latest?.inputs.site || '',
    socialProfiles: latest?.inputs.socialProfiles || '',
    offer: latest?.inputs.offer || '',
  };
}

type ArchiveEntry = {
  at: string;
  planning: CopilotSavedPlan | null;
  result: CopilotConversation | null;
};

export default function ClientsWorkspace({
  initialAccounts,
  canCreateLeads,
  onPrepare,
  onOpenPlan,
}: {
  initialAccounts: CopilotAccountListItem[];
  canCreateLeads: boolean;
  onPrepare: (seed: CopilotPreparationSeed) => void;
  onOpenPlan: (seed: CopilotOpenPlanSeed) => void;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedId, setSelectedId] = useState<string | null>(initialAccounts[0]?.id || null);
  const [detail, setDetail] = useState<CopilotAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [resultPlanningId, setResultPlanningId] = useState('');
  const [title, setTitle] = useState('');
  const [happenedAt, setHappenedAt] = useState(localDateTimeValue);
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
      if (!res.ok) throw new Error(data?.error || 'Falha ao abrir a empresa');
      if (requestId !== detailRequestRef.current) return;
      setDetail(data.detail);
    } catch (err: any) {
      if (requestId !== detailRequestRef.current) return;
      setDetail(null);
      setError(err?.message || 'Não foi possível abrir o histórico');
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
    if (!term) return accounts;
    return accounts.filter((account) => [account.name, account.legalName, account.segment]
      .filter(Boolean).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)));
  }, [accounts, query]);

  const archive = useMemo<ArchiveEntry[]>(() => {
    if (!detail) return [];
    const conversations = new Map(detail.conversations.map((conversation) => [conversation.id, conversation]));
    const linked = new Set(detail.plans.map((planning) => planning.conversationId).filter(Boolean));
    return [
      ...detail.plans.map((planning) => ({
        at: planning.createdAt,
        planning,
        result: planning.conversationId ? conversations.get(planning.conversationId) || null : null,
      })),
      ...detail.conversations.filter((conversation) => !linked.has(conversation.id)).map((result) => ({
        at: result.happenedAt,
        planning: null,
        result,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [detail]);

  const latestResult = detail?.conversations[0] || null;
  const openPlanning = detail?.plans.find((planning) => !planning.conversationId) || null;

  function openComposer(planningId = openPlanning?.id || '') {
    setResultPlanningId(planningId);
    setComposerOpen(true);
    setNotice(null);
    window.setTimeout(() => document.getElementById('meeting-result')?.focus(), 0);
  }

  async function pasteConversation() {
    setError(null);
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard-unavailable');
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return setError('A área de transferência está vazia.');
      setTranscript((current) => [current.trim(), text].filter(Boolean).join('\n\n').slice(0, 30000));
    } catch {
      setError('O navegador bloqueou a área de transferência. Clique no campo e use Ctrl+V.');
    }
  }

  async function createCompany() {
    const name = newCompanyName.trim();
    if (!name) return;
    setCreatingCompany(true);
    setError(null);
    try {
      const result = await createSalesAccount({ legal_name: name, trade_name: name });
      if (!result.success) throw new Error(result.error || 'Falha ao adicionar empresa');
      const row: any = result.data;
      const account: CopilotAccountListItem = {
        id: row.id,
        name: row.trade_name || row.legal_name,
        legalName: row.legal_name,
        status: row.status,
        segment: row.segment || null,
        city: row.city || null,
        state: row.state || null,
        representativeName: null,
        conversationCount: 0,
        lastConversationAt: null,
        planningCount: 0,
        lastPlanningAt: null,
        openOpportunityCount: 0,
        currentStage: null,
        nextAction: null,
        nextActionDate: null,
      };
      setAccounts((current) => [account, ...current]);
      setSelectedId(account.id);
      setNewCompanyName('');
      setAddingCompany(false);
      setNotice('Empresa adicionada. Você já pode criar o primeiro planejamento.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível adicionar a empresa');
    } finally {
      setCreatingCompany(false);
    }
  }

  async function saveConversation() {
    if (!selectedId || transcript.trim().length < 20 || !detail) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const planning = detail.plans.find((item) => item.id === resultPlanningId) || null;
      const res = await fetchAuth(`/api/copiloto/clientes/${encodeURIComponent(selectedId)}/conversas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          happenedAt: happenedAt ? new Date(happenedAt).toISOString() : new Date().toISOString(),
          opportunityId: planning?.opportunityId || '',
          planningId: planning?.id || '',
          transcript,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao salvar o resultado');
      const conversation = data.conversation as CopilotConversation;
      setDetail((current) => current ? {
        ...current,
        conversations: [conversation, ...current.conversations],
        plans: current.plans.map((item) => item.id === planning?.id
          ? { ...item, conversationId: conversation.id }
          : item),
      } : current);
      setAccounts((current) => current.map((account) => account.id === selectedId ? {
        ...account,
        conversationCount: account.conversationCount + 1,
        lastConversationAt: conversation.happenedAt,
      } : account));
      setTranscript('');
      setTitle('');
      setHappenedAt(localDateTimeValue());
      setResultPlanningId('');
      setComposerOpen(false);
      setNotice('Resultado salvo. A próxima preparação já poderá partir desta reunião.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o resultado');
    } finally {
      setSaving(false);
    }
  }

  function prepareNextConversation() {
    if (detail) onPrepare(planningSeed(detail));
  }

  function openSavedPlanning(planning: CopilotSavedPlan) {
    if (detail) onOpenPlan({ ...planningSeed(detail, planning), planning });
  }

  return (
    <section className={styles.meetingLibrary} aria-label="Histórico de reuniões">
      <aside className={styles.meetingIndex}>
        <header>
          <div><p className={styles.eyebrow}>Continuidade</p><h2>Empresas</h2></div>
          {canCreateLeads && <button type="button" onClick={() => setAddingCompany((current) => !current)} aria-label="Adicionar empresa"><Plus size={16} /></button>}
        </header>
        {addingCompany && <div className={styles.quickCompany}><input autoFocus value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createCompany(); }} placeholder="Nome da empresa" maxLength={200} /><button type="button" onClick={() => void createCompany()} disabled={creatingCompany || !newCompanyName.trim()}>{creatingCompany ? <LoaderCircle size={14} className={styles.spin} /> : <Check size={14} />}</button></div>}
        <label className={styles.meetingSearch}>
          <Search size={14} />
          <span className={styles.srOnly}>Buscar empresa</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa…" />
        </label>
        <div className={styles.meetingCompanyList}>
          {filteredAccounts.map((account) => (
            <button key={account.id} className={account.id === selectedId ? styles.meetingCompanyActive : ''} onClick={() => {
              setSelectedId(account.id);
              setComposerOpen(false);
              setNotice(null);
            }}>
              <span>{account.name.slice(0, 2).toUpperCase()}</span>
              <div><strong>{account.name}</strong><small>{account.planningCount} planos · {account.conversationCount} resultados</small><em><Clock3 size={10} /> {formatDate(latestDate(account))}</em></div>
              <ChevronRight size={14} />
            </button>
          ))}
          {!filteredAccounts.length && <div className={styles.meetingEmptyIndex}><Building2 size={22} /><p>Nenhuma empresa encontrada.</p>{canCreateLeads && <button type="button" onClick={() => setAddingCompany(true)}>Adicionar empresa</button>}</div>}
        </div>
      </aside>

      <div className={styles.meetingNotebook}>
        {error && <div className={styles.clientMessage} data-tone="error"><CircleAlert size={15} /><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
        {notice && <div className={styles.clientMessage} data-tone="success"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice(null)}>Fechar</button></div>}

        {detailLoading ? (
          <div className={styles.meetingLoading}><LoaderCircle size={24} className={styles.spin} /> Abrindo histórico…</div>
        ) : detail ? (
          <>
            <header className={styles.meetingNotebookHeader}>
              <div><p className={styles.eyebrow}>Arquivo de reuniões</p><h2>{detail.account.name}</h2><span>{detail.plans.length} planejamentos · {detail.conversations.length} resultados</span></div>
              <button className={styles.quietAction} onClick={() => openComposer()}><FileText size={15} /> Salvar resultado</button>
            </header>

            {composerOpen && (
              <section className={styles.simpleResultComposer}>
                <header><div><span>Resultado da reunião</span><h3>O que ficou desta conversa?</h3></div>{resultPlanningId && <small><Check size={12} /> Ligado ao planejamento anterior</small>}</header>
                <div className={styles.simpleResultMeta}>
                  <label>Título opcional<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Ex.: Diagnóstico com RH" /></label>
                  <label>Quando<input type="datetime-local" value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} /></label>
                </div>
                <div className={styles.simpleResultText}>
                  <div><label htmlFor="meeting-result">Resultado ou transcrição</label><button onClick={() => void pasteConversation()}><ClipboardPaste size={13} /> Colar</button></div>
                  <textarea id="meeting-result" value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={8} maxLength={30000} placeholder="Cole a transcrição ou escreva os principais pontos, decisões e próximo passo…" />
                </div>
                <footer><button className={styles.primaryAction} disabled={saving || transcript.trim().length < 20} onClick={() => void saveConversation()}>{saving ? <><LoaderCircle size={15} className={styles.spin} /> Analisando…</> : <><Sparkles size={15} /> Analisar e salvar resultado</>}</button><button className={styles.quietAction} disabled={saving} onClick={() => setComposerOpen(false)}>Cancelar</button></footer>
              </section>
            )}

            <section className={styles.continuityBridge}>
              <article>
                <span>Último resultado</span>
                {latestResult ? <><time>{formatDate(latestResult.happenedAt)}</time><h3>{latestResult.summary}</h3><p>{latestResult.analysis.memory.nextStep || 'Nenhum próximo passo explícito foi registrado.'}</p></> : <><h3>Ainda não há resultado salvo.</h3><p>Depois da reunião, cole a transcrição ou registre os pontos principais.</p></>}
              </article>
              <div><ArrowRight size={20} /></div>
              <article data-next>
                <span>{openPlanning ? 'Planejamento em aberto' : 'Próxima conversa'}</span>
                <h3>{openPlanning ? openPlanning.plan.objectives?.primary || 'Planejamento pronto para abrir.' : 'Continue exatamente de onde parou.'}</h3>
                <p>{openPlanning ? 'Revise o plano antes de entrar na reunião.' : 'O último resultado entra automaticamente como contexto.'}</p>
                <button className={styles.primaryAction} onClick={() => openPlanning ? openSavedPlanning(openPlanning) : prepareNextConversation()}><NotebookPen size={15} /> {openPlanning ? 'Abrir planejamento' : 'Preparar próxima conversa'}</button>
              </article>
            </section>

            <section className={styles.meetingArchive}>
              <header><div><p className={styles.eyebrow}>Histórico</p><h3>Planejamento → resultado</h3></div><History size={18} /></header>
              {archive.length ? <div className={styles.meetingArchiveList}>{archive.map((entry, index) => (
                <article key={entry.planning?.id || entry.result?.id || index} className={styles.meetingPair}>
                  <header><span>{entry.result ? 'Reunião concluída' : 'Aguardando resultado'}</span><time>{formatDate(entry.result?.happenedAt || entry.planning?.createdAt || null)}</time></header>
                  <div>
                    <section data-kind="plan">
                      <label>Planejamento</label>
                      {entry.planning ? <><h4>{entry.planning.plan.objectives?.primary || 'Planejamento PACE'}</h4><p>{entry.planning.plan.companySummary || entry.planning.plan.valueSummary}</p><button onClick={() => openSavedPlanning(entry.planning!)}>Abrir plano <ChevronRight size={13} /></button></> : <><h4>Sem planejamento salvo</h4><p>Este resultado foi registrado diretamente.</p></>}
                    </section>
                    <ArrowRight size={17} />
                    <section data-kind="result">
                      <label>Resultado</label>
                      {entry.result ? <><h4>{entry.result.title}</h4><p>{entry.result.summary}</p>{entry.result.analysis.memory.nextStep && <small>Próximo passo: {entry.result.analysis.memory.nextStep}</small>}<details><summary>Ver registro</summary><pre>{entry.result.transcript}</pre></details></> : <><h4>Reunião ainda não registrada</h4><p>Salve o resultado para fechar este ciclo.</p><button onClick={() => openComposer(entry.planning?.id)}>Salvar resultado <ChevronRight size={13} /></button></>}
                    </section>
                  </div>
                </article>
              ))}</div> : <div className={styles.emptyMeetingArchive}><NotebookPen size={25} /><h4>Comece pelo primeiro planejamento</h4><p>Depois, o resultado ficará ligado a ele nesta mesma linha.</p><button className={styles.primaryAction} onClick={prepareNextConversation}>Criar planejamento</button></div>}
            </section>
          </>
        ) : (
          <div className={styles.meetingLoading}><Building2 size={26} /> Escolha uma empresa para abrir o histórico.</div>
        )}
      </div>
    </section>
  );
}
