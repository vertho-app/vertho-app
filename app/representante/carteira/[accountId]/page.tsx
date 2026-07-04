'use client';

// Portal do Representante — detalhe da conta da carteira (pós-venda).
// Cabeçalho com status/risco/expansão, grid do contrato, gestão da conta
// (risco de churn, renovação, próxima ação, expansão), oportunidades e
// timeline de acompanhamento.
import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, Sparkles, TrendingUp } from 'lucide-react';
import {
  addAccountFollowup,
  criarOportunidadeExpansao,
  definirRiscoChurn,
  getSalesAccount,
  updateSalesAccount,
} from '@/actions/sales/accounts';
import BackButton from '@/components/back-button';
import OpportunityStageBadge from '@/components/sales/opportunity-stage-badge';
import { daysToRenewal } from '@/components/sales/portfolio-table';
import {
  ACCOUNT_STATUS_LABELS,
  ACTIVITY_KIND_COLORS,
  ACTIVITY_KIND_LABELS,
  CHURN_RISK_COLORS,
  CHURN_RISK_LABELS,
  PRODUCT_PACKAGE_LABELS,
  type PipelineStage,
} from '@/lib/sales/constants';
import { fmtBRL, fmtBRLExact, fmtDate, fmtDateTime } from '@/lib/sales/formatters';
import type { SalesAccount, SalesActivityNote } from '@/lib/sales/types';

type AccountOpportunity = {
  id: string;
  opportunity_name: string;
  stage: PipelineStage;
  status: string;
  estimated_value: number | null;
  origin: string | null;
};

type ContractInfo = {
  product_package: string | null;
  monthly_value: number | null;
  contract_duration_months: number | null;
  commission_phase: 'recorrente_12' | 'renovacao_6';
  days_to_renewal: number | null;
};

const SELECT_CLS = 'px-3 py-2 rounded-lg text-xs text-white border border-white/10 bg-[#091D35] outline-none focus:border-cyan-400/60';
const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 placeholder:text-gray-600';
const DATE_CLS = 'rounded-lg px-3 py-2 text-xs text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 [color-scheme:dark]';

const PHASE_CFG: Record<ContractInfo['commission_phase'], { label: string; color: string }> = {
  recorrente_12: { label: '12% recorrente', color: '#34c5cc' },
  renovacao_6: { label: '6% renovação', color: '#8B5CF6' },
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      {label}
    </span>
  );
}

function Info({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</p>
      <div className="text-sm text-white">{children ?? '—'}</div>
    </div>
  );
}

function toDateInput(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : '';
}

export default function ContaDetalhePage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  const router = useRouter();

  const [account, setAccount] = useState<SalesAccount | null>(null);
  const [opportunities, setOpportunities] = useState<AccountOpportunity[]>([]);
  const [followups, setFollowups] = useState<SalesActivityNote[]>([]);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Gestão da conta
  const [riskValue, setRiskValue] = useState('');
  const [riskMotivo, setRiskMotivo] = useState('');
  const [savingRisk, setSavingRisk] = useState(false);

  const [renewalDate, setRenewalDate] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [savingDates, setSavingDates] = useState(false);

  const [savingExpansion, setSavingExpansion] = useState(false);
  const [creatingOpp, setCreatingOpp] = useState(false);

  // Novo acompanhamento
  const [newNote, setNewNote] = useState('');
  const [newKind, setNewKind] = useState<'followup' | 'nota' | 'renovacao' | 'expansao'>('followup');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    const [accRes, portRes] = await Promise.all([
      getSalesAccount(accountId),
      import('@/actions/sales/accounts').then((m) => m.getPortfolio()),
    ]);
    if (!accRes.success) {
      setLoadError(accRes.error);
      setLoading(false);
      return;
    }
    setAccount(accRes.data);
    setOpportunities((accRes.opportunities || []) as AccountOpportunity[]);
    setFollowups((accRes.followups || []) as SalesActivityNote[]);
    setRiskValue(accRes.data.churn_risk ?? '');
    setRiskMotivo('');
    setRenewalDate(toDateInput(accRes.data.renewal_date));
    setNextFollowup(toDateInput(accRes.data.next_followup_date));

    if (portRes.success) {
      const row = portRes.rows.find((r) => r.account.id === accountId);
      if (row) {
        setContract({
          product_package: row.product_package,
          monthly_value: row.monthly_value,
          contract_duration_months: row.contract_duration_months,
          commission_phase: row.commission_phase,
          days_to_renewal: row.days_to_renewal,
        });
      } else {
        setContract(null);
      }
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveRisk() {
    const risco = (riskValue || null) as SalesAccount['churn_risk'];
    setSavingRisk(true);
    const r = await definirRiscoChurn(accountId, risco, riskMotivo.trim() || undefined);
    setSavingRisk(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Risco de churn atualizado');
    setLoading(true);
    await load();
  }

  async function handleSaveDates() {
    setSavingDates(true);
    const r = await updateSalesAccount(accountId, {
      renewal_date: renewalDate || null,
      next_followup_date: nextFollowup || null,
    });
    setSavingDates(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Datas da conta atualizadas');
    setLoading(true);
    await load();
  }

  async function handleToggleExpansion() {
    if (!account) return;
    setSavingExpansion(true);
    const r = await updateSalesAccount(accountId, { expansion_potential: !account.expansion_potential });
    setSavingExpansion(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(account.expansion_potential ? 'Sinal de expansão removido' : 'Conta marcada com potencial de expansão');
    setLoading(true);
    await load();
  }

  async function handleCreateExpansion() {
    setCreatingOpp(true);
    const r = await criarOportunidadeExpansao(accountId);
    setCreatingOpp(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Oportunidade de expansão criada');
    router.push(`/representante/crm/${r.opportunityId}`);
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const r = await addAccountFollowup(accountId, newNote, newKind);
    setSavingNote(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Acompanhamento registrado');
    setNewNote('');
    await load();
  }

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-center">
        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mt-16" />
      </div>
    );
  }

  if (loadError || !account) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
        <BackButton href="/representante/carteira" label="Carteira" />
        <div className="text-center py-16 text-sm text-gray-400 rounded-xl bg-white/[0.03] border border-white/10">
          {loadError ?? 'Conta não encontrada'}
        </div>
      </div>
    );
  }

  const nome = account.trade_name || account.legal_name;
  const risk = account.churn_risk ? { label: CHURN_RISK_LABELS[account.churn_risk], color: CHURN_RISK_COLORS[account.churn_risk] } : null;
  const phase = contract ? (PHASE_CFG[contract.commission_phase] || PHASE_CFG.recorrente_12) : null;
  const dias = contract?.days_to_renewal ?? daysToRenewal(account.renewal_date);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <BackButton href="/representante/carteira" label="Carteira" />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">{nome}</h1>
          {account.legal_name !== nome && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{account.legal_name}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-white/10 text-gray-200">
              {ACCOUNT_STATUS_LABELS[account.status] || account.status}
            </span>
            {risk && <Pill label={`Risco ${risk.label.toLowerCase()}`} color={risk.color} />}
            {account.expansion_potential && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#8B5CF61a', border: '1px solid #8B5CF655', color: '#8B5CF6' }}>
                <TrendingUp size={12} /> Potencial de expansão
              </span>
            )}
          </div>
          {(account.city || account.segment) && (
            <p className="text-xs text-gray-500 mt-2">
              {[account.segment, [account.city, account.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-6 min-w-0">
          {/* Contrato */}
          <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Contrato</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Info label="Produto">
                {contract?.product_package ? (PRODUCT_PACKAGE_LABELS[contract.product_package] || contract.product_package) : '—'}
              </Info>
              <Info label="Valor mensal">
                <span className="font-bold" style={{ color: '#34c5cc' }}>{fmtBRLExact(contract?.monthly_value)}</span>
              </Info>
              <Info label="Vigência">
                {contract?.contract_duration_months ? `${contract.contract_duration_months} meses` : '—'}
              </Info>
              <Info label="Início do contrato">{fmtDate(account.contract_start_date)}</Info>
              <Info label="Renovação">
                {fmtDate(account.renewal_date)}
                {dias != null && (
                  <span className={`ml-1 text-[11px] font-semibold ${dias < 0 ? 'text-red-400' : dias <= 90 ? 'text-amber-400' : 'text-gray-500'}`}>
                    {dias < 0 ? '(vencida)' : `(${dias} dia${dias === 1 ? '' : 's'})`}
                  </span>
                )}
              </Info>
              <Info label="Fase de comissão">
                {phase ? <Pill label={phase.label} color={phase.color} /> : '—'}
              </Info>
            </div>
          </section>

          {/* Oportunidades */}
          <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Oportunidades</h2>
              <button
                onClick={handleCreateExpansion}
                disabled={creatingOpp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
              >
                {creatingOpp ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Nova oportunidade de expansão
              </button>
            </div>
            {opportunities.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">Nenhuma oportunidade vinculada a esta conta.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[480px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-gray-500">
                      <th className="px-2 py-1.5">Oportunidade</th>
                      <th className="px-2 py-1.5">Estágio</th>
                      <th className="px-2 py-1.5 text-right">Valor est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {opportunities.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => router.push(`/representante/crm/${o.id}`)}
                        className="hover:bg-white/[0.03] cursor-pointer"
                      >
                        <td className="px-2 py-2 font-semibold text-cyan-400 max-w-[240px] truncate" title={o.opportunity_name}>{o.opportunity_name}</td>
                        <td className="px-2 py-2"><OpportunityStageBadge stage={o.stage} /></td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-300">{fmtBRL(o.estimated_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Timeline de acompanhamento */}
          <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Acompanhamento</h2>
            <div className="flex flex-col gap-2 mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Registrar conversa, renovação, sinal de risco ou oportunidade de expansão…"
                rows={2}
                className={`${INPUT_CLS} resize-y`}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <select value={newKind} onChange={(e) => setNewKind(e.target.value as typeof newKind)} className={SELECT_CLS}>
                  <option value="followup">{ACTIVITY_KIND_LABELS.followup}</option>
                  <option value="nota">{ACTIVITY_KIND_LABELS.nota}</option>
                  <option value="renovacao">{ACTIVITY_KIND_LABELS.renovacao}</option>
                  <option value="expansao">{ACTIVITY_KIND_LABELS.expansao}</option>
                </select>
                <button
                  onClick={handleAddNote}
                  disabled={savingNote || !newNote.trim()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
                </button>
              </div>
            </div>
            {followups.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum acompanhamento registrado.</p>
            ) : (
              <ul className="space-y-2">
                {followups.map((n) => {
                  const color = ACTIVITY_KIND_COLORS[n.kind] || '#6B7280';
                  return (
                    <li key={n.id} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill label={ACTIVITY_KIND_LABELS[n.kind] || n.kind} color={color} />
                        <span className="text-[10px] text-gray-500">{fmtDateTime(n.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-200 whitespace-pre-wrap">{n.note}</p>
                      <p className="text-[10px] text-gray-500 mt-1">{n.created_by_email}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Coluna lateral: gestão da conta */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Gestão da conta</h3>

            {/* Risco de churn */}
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Risco de churn</p>
              <div className="flex flex-col gap-2">
                <select value={riskValue} onChange={(e) => setRiskValue(e.target.value)} className={`${SELECT_CLS} w-full`}>
                  <option value="">Nenhum</option>
                  <option value="baixo">{CHURN_RISK_LABELS.baixo}</option>
                  <option value="medio">{CHURN_RISK_LABELS.medio}</option>
                  <option value="alto">{CHURN_RISK_LABELS.alto}</option>
                </select>
                <input
                  value={riskMotivo}
                  onChange={(e) => setRiskMotivo(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className={INPUT_CLS}
                />
                <button
                  onClick={handleSaveRisk}
                  disabled={savingRisk || riskValue === (account.churn_risk ?? '')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  {savingRisk && <Loader2 size={14} className="animate-spin" />} Salvar risco
                </button>
              </div>
            </div>

            {/* Datas */}
            <div className="mb-4 pt-4 border-t border-white/10">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Data de renovação</p>
              <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className={`${DATE_CLS} w-full mb-2`} />
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Próxima ação</p>
              <input type="date" value={nextFollowup} onChange={(e) => setNextFollowup(e.target.value)} className={`${DATE_CLS} w-full`} />
              <button
                onClick={handleSaveDates}
                disabled={savingDates || (renewalDate === toDateInput(account.renewal_date) && nextFollowup === toDateInput(account.next_followup_date))}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
              >
                {savingDates && <Loader2 size={14} className="animate-spin" />} Salvar datas
              </button>
            </div>

            {/* Expansão */}
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">Potencial de expansão</p>
                  <p className="text-[10px] text-gray-500">Sinaliza espaço para crescer na conta.</p>
                </div>
                <button
                  onClick={handleToggleExpansion}
                  disabled={savingExpansion}
                  aria-pressed={account.expansion_potential}
                  className="relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50"
                  style={{ background: account.expansion_potential ? '#8B5CF6' : 'rgba(255,255,255,.15)' }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{ left: 2, transform: account.expansion_potential ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
