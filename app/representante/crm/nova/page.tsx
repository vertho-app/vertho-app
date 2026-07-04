'use client';

// Portal do Representante — registro formal de oportunidade (inicia proteção de 90 dias).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import BackButton from '@/components/back-button';
import OpportunityForm, { type OpportunityFormValues } from '@/components/sales/opportunity-form';
import { createOpportunity } from '@/actions/sales/opportunities';

export default function NovaOportunidadePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(values: OpportunityFormValues) {
    setSubmitting(true);
    const r = await createOpportunity(values);
    if (!r.success) {
      setSubmitting(false);
      toast.error(r.error);
      return;
    }
    toast.success('Oportunidade registrada — proteção comercial de 90 dias iniciada.');
    router.push(`/representante/crm/${r.id}`);
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <BackButton href="/representante/crm" label="Oportunidades" />
      <div className="mb-5">
        <h1 className="text-xl font-bold">Registrar oportunidade</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          O registro formal valida a oportunidade e inicia a proteção comercial de 90 dias.
        </p>
      </div>
      <OpportunityForm onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
