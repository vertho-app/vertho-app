'use client';

// Portal do Representante — simulador/form de proposta comercial.
// O resumo financeiro recalcula AO VIVO; a validação client usa
// validateProposalDraft (o server sempre revalida e recalcula o financeiro).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { validateProposalDraft } from '@/lib/sales/validation';
import { simularMensalidade } from '@/lib/sales/pricing';
import {
  CONTRACT_DURATIONS,
  CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS,
  PRODUCT_PACKAGES, PRODUCT_PACKAGE_LABELS,
} from '@/lib/sales/constants';
import ProposalFinancialSummary from '@/components/sales/proposal-financial-summary';
import type { SalesProposal } from '@/lib/sales/types';

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 placeholder:text-gray-600';
const SELECT_CLS = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-[#091D35] border border-white/10 focus:border-cyan-400/60';

function Field({ label, error, hint, required, children }: {
  label: string; error?: string; hint?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-400 mb-1">
        {label}{required && <span className="text-cyan-400"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[10px] text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

export type ProposalFormValues = Record<string, any>;

export default function ProposalForm({ initial, opportunityId, onSubmit, submitting, submitLabel }: {
  initial?: Partial<SalesProposal>;
  /** Oportunidade vinculada (criação); na edição usa a da própria proposta. */
  opportunityId?: string | null;
  onSubmit: (values: ProposalFormValues) => void | Promise<void>;
  submitting: boolean;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<ProposalFormValues>(() => ({
    customer_type: initial?.customer_type ?? '',
    number_of_users: initial?.number_of_users ?? '',
    number_of_roles_mapped: initial?.number_of_roles_mapped ?? '',
    product_package: initial?.product_package ?? '',
    contract_duration_months: initial?.contract_duration_months ?? null,
    discount_requested: initial?.discount_requested ?? '',
    payment_terms: initial?.payment_terms ?? '',
    included_scope: initial?.included_scope ?? '',
    commercial_notes: initial?.commercial_notes ?? '',
    monthly_value: initial?.monthly_value ?? '',
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: any) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setFieldErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const num = (v: any) => (v === '' || v == null ? null : Number(v));

  // Valor mensal vem da tabela de preço quando as variáveis mudam (pacote,
  // usuários, cargos). Pula o primeiro render para não sobrescrever o valor
  // salvo de uma proposta em edição. 'Custom' (sem fórmula) fica manual.
  const skipAuto = useRef(true);
  useEffect(() => {
    if (skipAuto.current) { skipAuto.current = false; return; }
    const sug = simularMensalidade({
      product_package: values.product_package,
      number_of_users: num(values.number_of_users),
      number_of_roles_mapped: num(values.number_of_roles_mapped),
    });
    if (sug != null) setValues((prev) => ({ ...prev, monthly_value: String(sug) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.product_package, values.number_of_users, values.number_of_roles_mapped]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = {
      ...values,
      number_of_users: num(values.number_of_users),
      number_of_roles_mapped: num(values.number_of_roles_mapped),
      discount_requested: num(values.discount_requested),
      monthly_value: num(values.monthly_value),
    };
    const v = validateProposalDraft({
      ...input,
      opportunity_id: opportunityId ?? initial?.opportunity_id ?? '',
    });
    if (!v.valid) {
      setFieldErrors(v.errors);
      toast.error(v.errors.opportunity_id ?? 'Corrija os campos destacados');
      return;
    }
    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
      <div className="space-y-6 min-w-0">
        <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Cliente e escopo</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo de cliente" error={fieldErrors.customer_type}>
              <select value={values.customer_type} onChange={(e) => set('customer_type', e.target.value)} className={SELECT_CLS}>
                <option value="">Selecione</option>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Nº de usuários" error={fieldErrors.number_of_users}>
              <input type="number" min={1} value={values.number_of_users}
                onChange={(e) => set('number_of_users', e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Nº de cargos mapeados" error={fieldErrors.number_of_roles_mapped}>
              <input type="number" min={0} value={values.number_of_roles_mapped}
                onChange={(e) => set('number_of_roles_mapped', e.target.value)} className={INPUT_CLS} />
            </Field>
          </div>
          <Field label="Pacote" error={fieldErrors.product_package}>
            <select value={values.product_package} onChange={(e) => set('product_package', e.target.value)} className={SELECT_CLS}>
              <option value="">Selecione</option>
              {PRODUCT_PACKAGES.map((p) => <option key={p} value={p}>{PRODUCT_PACKAGE_LABELS[p]}</option>)}
            </select>
          </Field>
          <Field label="Escopo incluído" error={fieldErrors.included_scope}>
            <textarea value={values.included_scope} onChange={(e) => set('included_scope', e.target.value)}
              rows={3} placeholder="O que está incluído nesta proposta" className={INPUT_CLS} />
          </Field>
        </section>

        <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Condições comerciais</h2>

          <Field label="Vigência do contrato" error={fieldErrors.contract_duration_months}>
            <div className="flex gap-2">
              {CONTRACT_DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('contract_duration_months', m)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    values.contract_duration_months === m
                      ? 'bg-cyan-400/15 border-cyan-400/60 text-cyan-300'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {m} meses
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Valor mensal (R$)" error={fieldErrors.monthly_value}
              hint="Sugerido pela tabela (pacote × usuários × cargos). Ajustável. 'Custom' é manual.">
              <input type="number" min={0} step="0.01" value={values.monthly_value}
                onChange={(e) => set('monthly_value', e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Desconto solicitado (%)" error={fieldErrors.discount_requested}
              hint="Acima de 15% passa por análise de margem">
              <input type="number" min={0} max={100} step="0.1" value={values.discount_requested}
                onChange={(e) => set('discount_requested', e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Condições de pagamento" error={fieldErrors.payment_terms}>
              <input value={values.payment_terms} onChange={(e) => set('payment_terms', e.target.value)}
                placeholder="Ex.: mensal, boleto, 30 dias" className={INPUT_CLS} />
            </Field>
          </div>

          <Field label="Observações comerciais" error={fieldErrors.commercial_notes}>
            <textarea value={values.commercial_notes} onChange={(e) => set('commercial_notes', e.target.value)}
              rows={2} className={INPUT_CLS} />
          </Field>
        </section>

        <button type="submit" disabled={submitting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50">
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitLabel ?? 'Salvar rascunho'}
        </button>
      </div>

      <div className="lg:sticky lg:top-6">
        <ProposalFinancialSummary
          input={{
            monthly_value: num(values.monthly_value),
            contract_duration_months: num(values.contract_duration_months),
            discount_requested: num(values.discount_requested),
          }}
        />
      </div>
    </form>
  );
}
