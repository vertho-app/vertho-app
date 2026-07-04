'use client';

// Portal do Representante — nova proposta (rascunho).
// Lê ?opportunity= da URL (useSearchParams exige <Suspense>); sem o param,
// oferece o dropdown das oportunidades abertas.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import BackButton from '@/components/back-button';
import ProposalForm, { type ProposalFormValues } from '@/components/sales/proposal-form';
import { createProposalDraft } from '@/actions/sales/proposals';
import { listOpportunities } from '@/actions/sales/opportunities';
import type { SalesOpportunity } from '@/lib/sales/types';

function NovaPropostaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get('opportunity');

  const [opportunityId, setOpportunityId] = useState(fromUrl ?? '');
  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await listOpportunities({ status: 'open' });
      if (r.success) setOpportunities(r.data);
      else toast.error(r.error);
      setLoadingOpps(false);
    })();
  }, []);

  const selected = opportunities.find((o) => o.id === opportunityId);

  async function handleSubmit(values: ProposalFormValues) {
    if (!opportunityId) { toast.error('Vincule a proposta a uma oportunidade'); return; }
    setSubmitting(true);
    const r = await createProposalDraft({ ...values, opportunity_id: opportunityId });
    if (!r.success) {
      setSubmitting(false);
      toast.error(r.error);
      return;
    }
    toast.success('Rascunho de proposta criado');
    router.push(`/representante/propostas/${r.id}`);
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <BackButton href="/representante/propostas" label="Propostas" />
      <div className="mb-5">
        <h1 className="text-xl font-bold">Nova proposta</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Simule as condições comerciais — a proposta segue para aprovação Vertho antes do envio ao cliente.
        </p>
      </div>

      <div className="mb-6 rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <label className="block text-[11px] font-semibold text-gray-400 mb-1">
          Oportunidade vinculada <span className="text-cyan-400">*</span>
        </label>
        {fromUrl ? (
          <p className="text-sm text-white">
            {loadingOpps
              ? 'Carregando…'
              : selected
                ? `${selected.opportunity_name} — ${selected.account?.trade_name || selected.account?.legal_name || ''}`
                : 'Oportunidade selecionada'}
          </p>
        ) : (
          <select
            value={opportunityId}
            onChange={(e) => setOpportunityId(e.target.value)}
            disabled={loadingOpps}
            className="w-full max-w-lg rounded-lg px-3 py-2 text-sm text-white outline-none bg-[#091D35] border border-white/10 focus:border-cyan-400/60 disabled:opacity-50"
          >
            <option value="">{loadingOpps ? 'Carregando oportunidades…' : 'Selecione a oportunidade aberta'}</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.opportunity_name} — {o.account?.trade_name || o.account?.legal_name || ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <ProposalForm opportunityId={opportunityId || null} onSubmit={handleSubmit} submitting={submitting} submitLabel="Criar rascunho" />
    </div>
  );
}

export default function NovaPropostaPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1100px] mx-auto px-4 py-6 text-center">
          <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mt-16" />
        </div>
      }
    >
      <NovaPropostaInner />
    </Suspense>
  );
}
