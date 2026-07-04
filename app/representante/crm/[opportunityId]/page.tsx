'use client';

// Portal do Representante — detalhe da oportunidade.
// Cabeçalho com badges, grid de dados, proteção, score, propostas relacionadas,
// timeline de notas e ações (editar, mover estágio, fechar ganho/perdido).
import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Loader2, Pencil, Plus, RefreshCw, Shield, Sparkles, X } from 'lucide-react';
import { addActivityNote, getOpportunity, moveOpportunityStage, updateOpportunity } from '@/actions/sales/opportunities';
import { prepararReuniao } from '@/actions/sales/ai-assistant';
import { useConfirm } from '@/components/admin/confirm-dialog';
import BackButton from '@/components/back-button';
import OpportunityStageBadge from '@/components/sales/opportunity-stage-badge';
import ProtectionStatusBadge from '@/components/sales/protection-status-badge';
import ProposalStatusBadge from '@/components/sales/proposal-status-badge';
import OpportunityForm, { type OpportunityFormValues } from '@/components/sales/opportunity-form';
import OpportunityQualityScore from '@/components/sales/opportunity-quality-score';
import {
  OPPORTUNITY_STATUS_LABELS,
  ORIGIN_LABELS,
  PIPELINE_STAGES,
  PRODUCT_PACKAGE_LABELS,
  STAGE_LABELS,
  type ProposalStatus,
} from '@/lib/sales/constants';
import { protectionDaysLeft } from '@/lib/sales/protection';
import { fmtBRL, fmtBRLExact, fmtDate, fmtDateTime, fmtPercent } from '@/lib/sales/formatters';
import type { SalesActivityNote, SalesOpportunity } from '@/lib/sales/types';

type RelatedProposal = {
  id: string;
  proposal_number: string;
  status: string;
  monthly_value: number | null;
  total_contract_value: number | null;
  estimated_total_commission: number | null;
  created_at: string;
};

type ReuniaoBriefing = {
  resumo_contexto: string;
  perguntas_diagnostico: string[];
  objecoes_provaveis: { objecao: string; resposta: string }[];
  proximo_passo_sugerido: string;
};

const SELECT_CLS = 'px-3 py-2 rounded-lg text-xs text-white border border-white/10 bg-[#091D35] outline-none focus:border-cyan-400/60';
const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 placeholder:text-gray-600';

function Info({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</p>
      <div className="text-sm text-white">{children ?? '—'}</div>
    </div>
  );
}

export default function OportunidadeDetalhePage({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = use(params);
  const router = useRouter();
  const confirm = useConfirm();

  const [opp, setOpp] = useState<SalesOpportunity | null>(null);
  const [proposals, setProposals] = useState<RelatedProposal[]>([]);
  const [notes, setNotes] = useState<SalesActivityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [targetStage, setTargetStage] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [moving, setMoving] = useState(false);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [preparingReuniao, setPreparingReuniao] = useState(false);
  const [reuniao, setReuniao] = useState<ReuniaoBriefing | null>(null);
  const [reuniaoOpen, setReuniaoOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await getOpportunity(opportunityId);
    if (!r.success) {
      setLoadError(r.error);
      setLoading(false);
      return;
    }
    setOpp(r.data);
    setProposals(r.proposals as RelatedProposal[]);
    setNotes(r.notes as SalesActivityNote[]);
    setTargetStage(r.data.stage);
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpdate(values: OpportunityFormValues) {
    setSaving(true);
    const r = await updateOpportunity(opportunityId, values);
    setSaving(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Oportunidade atualizada');
    setEditing(false);
    setLoading(true);
    await load();
  }

  async function handleMoveStage() {
    if (!opp || !targetStage || targetStage === opp.stage) return;

    if (targetStage === 'fechado_perdido') {
      if (!lossReason.trim()) { toast.error('Informe o motivo da perda antes de confirmar'); return; }
      const ok = await confirm({
        title: 'Marcar oportunidade como perdida',
        message: (
          <>
            A oportunidade <b className="text-white">{opp.opportunity_name}</b> será fechada como perdida.
            <br />Motivo: <b className="text-white">{lossReason.trim()}</b>
          </>
        ),
        severity: 'danger',
        confirmLabel: 'Marcar como perdida',
      });
      if (!ok) return;
    } else if (targetStage === 'fechado_ganho') {
      const ok = await confirm({
        title: 'Marcar oportunidade como ganha',
        message: (
          <>
            Confirma o fechamento de <b className="text-white">{opp.opportunity_name}</b> como ganha?
            A conta passa a cliente ativo da sua carteira.
          </>
        ),
        severity: 'normal',
        confirmLabel: 'Fechar como ganha',
      });
      if (!ok) return;
    }

    setMoving(true);
    const r = await moveOpportunityStage(
      opportunityId,
      targetStage,
      targetStage === 'fechado_perdido' ? lossReason.trim() : undefined,
    );
    setMoving(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(
      targetStage === 'fechado_ganho'
        ? 'Oportunidade fechada como ganha. Parabéns!'
        : 'Estágio atualizado',
    );
    setLossReason('');
    setLoading(true);
    await load();
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const r = await addActivityNote(opportunityId, newNote);
    setSavingNote(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Nota registrada');
    setNewNote('');
    await load();
  }

  async function handlePrepararReuniao() {
    setPreparingReuniao(true);
    setReuniaoOpen(true);
    const r = await prepararReuniao(opportunityId);
    setPreparingReuniao(false);
    if (!r.success) {
      setReuniaoOpen(false);
      toast.error(r.error);
      return;
    }
    setReuniao(r.data as ReuniaoBriefing);
  }

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-center">
        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mt-16" />
      </div>
    );
  }

  if (loadError || !opp) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
        <BackButton href="/representante/crm" label="Oportunidades" />
        <div className="text-center py-16 text-sm text-gray-400 rounded-xl bg-white/[0.03] border border-white/10">
          {loadError ?? 'Oportunidade não encontrada'}
        </div>
      </div>
    );
  }

  const daysLeft = protectionDaysLeft(opp.protection_end_date);
  const isOpen = opp.status === 'open';
  const stageOptions = PIPELINE_STAGES.filter((s) => s !== 'sem_avanco_expirado');

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <BackButton href="/representante/crm" label="Oportunidades" />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{opp.opportunity_name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <OpportunityStageBadge stage={opp.stage} size="md" />
            <ProtectionStatusBadge status={opp.protection_status} protectionEnd={opp.protection_end_date} size="md" />
            {!isOpen && (
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-white/10 text-gray-300">
                {OPPORTUNITY_STATUS_LABELS[opp.status] || opp.status}
              </span>
            )}
          </div>
          {opp.status === 'lost' && opp.loss_reason && (
            <p className="mt-2 text-[11px] text-red-300">Motivo da perda: {opp.loss_reason}</p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrepararReuniao}
              disabled={preparingReuniao}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-60"
            >
              {preparingReuniao ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {preparingReuniao ? 'Preparando…' : 'Preparar reunião (IA)'}
            </button>
            {isOpen && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
              >
                <Pencil size={14} /> Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mover estágio */}
      {isOpen && !editing && (
        <div className="mb-6 rounded-xl bg-white/[0.03] border border-white/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Mover estágio</p>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={targetStage} onChange={(e) => setTargetStage(e.target.value)} className={SELECT_CLS}>
              {stageOptions.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
            {targetStage === 'fechado_perdido' && (
              <input
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                placeholder="Motivo da perda (obrigatório)"
                className={`${INPUT_CLS} max-w-xs`}
              />
            )}
            <button
              onClick={handleMoveStage}
              disabled={moving || targetStage === opp.stage}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
            >
              {moving && <Loader2 size={14} className="animate-spin" />} Mover
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Editar oportunidade</h2>
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
              <X size={14} /> Cancelar edição
            </button>
          </div>
          <OpportunityForm initial={opp} onSubmit={handleUpdate} submitting={saving} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px] items-start">
          <div className="space-y-6 min-w-0">
            {/* Dados da conta e contato */}
            <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Conta e contato</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Info label="Conta">
                  {opp.account
                    ? `${opp.account.trade_name || opp.account.legal_name}${opp.account.city ? ` — ${opp.account.city}${opp.account.state ? `/${opp.account.state}` : ''}` : ''}`
                    : '—'}
                </Info>
                <Info label="Contato principal">
                  {opp.primary_contact
                    ? (
                      <>
                        {opp.primary_contact.name}
                        {opp.primary_contact.role && <span className="text-gray-400"> · {opp.primary_contact.role}</span>}
                        {(opp.primary_contact.email || opp.primary_contact.phone) && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {[opp.primary_contact.email, opp.primary_contact.phone].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </>
                    )
                    : '—'}
                </Info>
              </div>
            </section>

            {/* Dados da oportunidade */}
            <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Oportunidade</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Info label="Origem">{opp.origin ? (ORIGIN_LABELS[opp.origin] || opp.origin) : '—'}</Info>
                <Info label="Produto de interesse">
                  {opp.product_interest ? (PRODUCT_PACKAGE_LABELS[opp.product_interest] || opp.product_interest) : '—'}
                </Info>
                <Info label="Valor estimado">{fmtBRL(opp.estimated_value)}</Info>
                <Info label="Probabilidade">{opp.probability != null ? fmtPercent(opp.probability) : '—'}</Info>
                <Info label="Previsão de fechamento">{fmtDate(opp.estimated_close_date)}</Info>
                <Info label="Próxima ação">
                  {opp.next_action
                    ? <>{opp.next_action}<span className="text-gray-500"> · {fmtDate(opp.next_action_date)}</span></>
                    : '—'}
                </Info>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <Info label="Necessidade identificada">
                  <p className="whitespace-pre-wrap text-gray-200">{opp.identified_need || '—'}</p>
                </Info>
                <Info label="Evidência de interação">
                  <p className="whitespace-pre-wrap text-gray-200">{opp.interaction_evidence || '—'}</p>
                </Info>
              </div>
              {(opp.competitors || opp.objections) && (
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <Info label="Concorrentes">{opp.competitors || '—'}</Info>
                  <Info label="Objeções">{opp.objections || '—'}</Info>
                </div>
              )}
            </section>

            {/* Propostas relacionadas */}
            <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                  <FileText size={12} /> Propostas
                </h2>
                {isOpen && (
                  <button
                    onClick={() => router.push(`/representante/propostas/nova?opportunity=${opp.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
                  >
                    <Plus size={12} /> Nova proposta
                  </button>
                )}
              </div>
              {proposals.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">Nenhuma proposta para esta oportunidade ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-gray-500">
                        <th className="px-2 py-1.5">Nº</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5 text-right">Mensal</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                        <th className="px-2 py-1.5 text-right">Comissão est.</th>
                        <th className="px-2 py-1.5">Criada em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {proposals.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/representante/propostas/${p.id}`)}
                          className="hover:bg-white/[0.03] cursor-pointer"
                        >
                          <td className="px-2 py-2 font-bold text-cyan-400">{p.proposal_number}</td>
                          <td className="px-2 py-2"><ProposalStatusBadge status={p.status as ProposalStatus} /></td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtBRLExact(p.monthly_value)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtBRLExact(p.total_contract_value)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtBRLExact(p.estimated_total_commission)}</td>
                          <td className="px-2 py-2 text-gray-400">{fmtDate(p.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Timeline de notas */}
            <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Notas de atividade</h2>
              <div className="flex gap-2 mb-4">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                  placeholder="Registrar interação, avanço ou próximo passo…"
                  className={INPUT_CLS}
                />
                <button
                  onClick={handleAddNote}
                  disabled={savingNote || !newNote.trim()}
                  className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
                </button>
              </div>
              {notes.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhuma nota registrada.</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                      <p className="text-xs text-gray-200 whitespace-pre-wrap">{n.note}</p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {n.created_by_email} · {fmtDateTime(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Coluna lateral: proteção + score */}
          <div className="space-y-4">
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                <Shield size={12} /> Proteção comercial
              </h3>
              <p className="text-sm text-white">
                {fmtDate(opp.protection_start_date)} → {fmtDate(opp.protection_end_date)}
              </p>
              {daysLeft != null && (
                <p className={`text-[11px] mt-1 font-semibold ${daysLeft < 0 ? 'text-red-400' : daysLeft <= 15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {daysLeft < 0
                    ? 'Proteção vencida'
                    : `${daysLeft} dia${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`}
                </p>
              )}
            </div>
            <OpportunityQualityScore
              input={{
                account_id: opp.account_id,
                primary_contact_id: opp.primary_contact_id,
                primary_contact_role: opp.primary_contact?.role ?? null,
                origin: opp.origin,
                identified_need: opp.identified_need,
                product_interest: opp.product_interest,
                stage: opp.stage,
                next_action: opp.next_action,
                interaction_evidence: opp.interaction_evidence,
              }}
            />
          </div>
        </div>
      )}

      {/* Painel: preparação de reunião (IA) */}
      {reuniaoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6"
          onClick={() => setReuniaoOpen(false)}
        >
          <div
            className="w-full max-w-2xl my-4 rounded-2xl bg-[#0B2138] border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do painel */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
              <div className="min-w-0">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-400" /> Preparação de reunião
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{opp.opportunity_name}</p>
              </div>
              <button
                onClick={() => setReuniaoOpen(false)}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <p className="text-[10px] uppercase tracking-wide text-amber-300/80 mb-4">
                Gerado por IA — revise antes de usar
              </p>

              {preparingReuniao || !reuniao ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Loader2 size={28} className="animate-spin text-cyan-400" />
                  <p className="text-sm text-gray-300 mt-3">Preparando…</p>
                  <p className="text-[11px] text-gray-500 mt-1">A IA está montando o briefing desta conta.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Resumo do contexto */}
                  <section>
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Resumo do contexto</h3>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{reuniao.resumo_contexto}</p>
                  </section>

                  {/* Perguntas de diagnóstico */}
                  {reuniao.perguntas_diagnostico?.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Perguntas de diagnóstico</h3>
                      <ul className="space-y-1.5">
                        {reuniao.perguntas_diagnostico.map((p, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-200">
                            <span className="text-cyan-400 shrink-0">{i + 1}.</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Objeções prováveis */}
                  {reuniao.objecoes_provaveis?.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Objeções prováveis</h3>
                      <ul className="space-y-2.5">
                        {reuniao.objecoes_provaveis.map((o, i) => (
                          <li key={i} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                            <p className="text-sm font-bold text-white">{o.objecao}</p>
                            <p className="text-sm text-gray-300 mt-1">{o.resposta}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Próximo passo sugerido */}
                  {reuniao.proximo_passo_sugerido && (
                    <section className="rounded-lg bg-cyan-400/10 border border-cyan-400/30 px-3 py-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300 mb-1">Próximo passo sugerido</h3>
                      <p className="text-sm text-white">{reuniao.proximo_passo_sugerido}</p>
                    </section>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé com ações */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
              <button
                onClick={handlePrepararReuniao}
                disabled={preparingReuniao}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
              >
                <RefreshCw size={14} className={preparingReuniao ? 'animate-spin' : ''} /> Regenerar
              </button>
              <button
                onClick={() => setReuniaoOpen(false)}
                className="px-3 py-2 rounded-lg text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
