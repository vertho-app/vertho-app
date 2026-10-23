'use client';

// Portal do Representante — registro formal de oportunidade. Cliente livre é
// aceito na hora; o resto vai para a validação da vertho.ai (contrato do RC, 7.1).
// A proteção vale 90 dias a partir da última movimentação (7.5).
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
    if (r.aceito) toast.success(r.mensagem, { duration: 8000 });
    else toast.warning(`Oportunidade registrada. ${r.mensagem}`, { duration: 12000 });
    if (r.jaProspectado) toast.info(r.jaProspectado, { duration: 12000 });
    router.push(`/representante/crm/${r.id}`);
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <BackButton href="/representante/crm" label="Oportunidades" />
      <div className="mb-5">
        <h1 className="text-xl font-bold">Registrar oportunidade</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Com os dados completos e o cliente livre, o registro é aceito na hora. A proteção comercial vale 90 dias a partir da última movimentação.
        </p>
      </div>
      <OpportunityForm onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
