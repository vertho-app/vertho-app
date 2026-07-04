'use client';

// Portal do Representante — form de criação/edição de oportunidade.
// Seleção de conta/contato com mini-forms inline de criação, validação client
// (validateOpportunityInput) e score de qualidade recalculado AO VIVO ao lado.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { createSalesAccount, listSalesAccounts } from '@/actions/sales/accounts';
import { createSalesContact, listContactsByAccount } from '@/actions/sales/contacts';
import { validateOpportunityInput } from '@/lib/sales/validation';
import {
  CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS,
  OPEN_STAGES, STAGE_LABELS,
  OPPORTUNITY_ORIGINS, ORIGIN_LABELS,
  PRODUCT_PACKAGES, PRODUCT_PACKAGE_LABELS,
} from '@/lib/sales/constants';
import OpportunityQualityScore from '@/components/sales/opportunity-quality-score';
import type { SalesAccount, SalesContact, SalesOpportunity } from '@/lib/sales/types';

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 placeholder:text-gray-600';
const SELECT_CLS = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-[#091D35] border border-white/10 focus:border-cyan-400/60 disabled:opacity-50';
const MINI_BTN_CLS = 'flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed';

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

export type OpportunityFormValues = Record<string, any>;

export default function OpportunityForm({ initial, onSubmit, submitting }: {
  initial?: Partial<SalesOpportunity>;
  onSubmit: (values: OpportunityFormValues) => void | Promise<void>;
  submitting: boolean;
}) {
  const isEdit = !!initial?.id;

  const [values, setValues] = useState<OpportunityFormValues>(() => ({
    account_id: initial?.account_id ?? '',
    primary_contact_id: initial?.primary_contact_id ?? '',
    opportunity_name: initial?.opportunity_name ?? '',
    origin: initial?.origin ?? '',
    product_interest: initial?.product_interest ?? '',
    identified_need: initial?.identified_need ?? '',
    stage: initial?.stage ?? 'lead_identificado',
    estimated_value: initial?.estimated_value ?? '',
    estimated_close_date: initial?.estimated_close_date?.slice(0, 10) ?? '',
    next_action: initial?.next_action ?? '',
    next_action_date: initial?.next_action_date?.slice(0, 10) ?? '',
    interaction_evidence: initial?.interaction_evidence ?? '',
    probability: initial?.probability != null ? Math.round(Number(initial.probability) * 100) : '',
    competitors: initial?.competitors ?? '',
    objections: initial?.objections ?? '',
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Mini-form: nova conta
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ legal_name: '', trade_name: '', segment: '', city: '', state: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  // Mini-form: novo contato
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);

  const set = (k: string, v: any) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setFieldErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await listSalesAccounts();
      if (!alive) return;
      if (r.success) setAccounts(r.data);
      else toast.error(r.error);
      setLoadingAccounts(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!values.account_id) { setContacts([]); return; }
    let alive = true;
    setLoadingContacts(true);
    (async () => {
      const r = await listContactsByAccount(values.account_id);
      if (!alive) return;
      if (r.success) setContacts(r.data);
      else toast.error(r.error);
      setLoadingContacts(false);
    })();
    return () => { alive = false; };
  }, [values.account_id]);

  async function handleCreateAccount() {
    if (!newAccount.legal_name.trim()) { toast.error('Informe a razão social da conta'); return; }
    setSavingAccount(true);
    const r = await createSalesAccount(newAccount);
    setSavingAccount(false);
    if (!r.success) { toast.error(r.error); return; }
    setAccounts((prev) => [...prev, r.data].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
    setValues((prev) => ({ ...prev, account_id: r.data.id, primary_contact_id: '' }));
    setShowNewAccount(false);
    setNewAccount({ legal_name: '', trade_name: '', segment: '', city: '', state: '' });
    toast.success('Conta criada');
  }

  async function handleCreateContact() {
    if (!values.account_id) { toast.error('Selecione a conta antes de criar o contato'); return; }
    if (!newContact.name.trim()) { toast.error('Informe o nome do contato'); return; }
    setSavingContact(true);
    const r = await createSalesContact({
      account_id: values.account_id,
      name: newContact.name,
      role: newContact.role || null,
      email: newContact.email || null,
      phone: newContact.phone || null,
      is_primary: contacts.length === 0,
    });
    setSavingContact(false);
    if (!r.success) { toast.error(r.error); return; }
    if (r.data) {
      const created = r.data;
      setContacts((prev) => [...prev, created]);
      setValues((prev) => ({ ...prev, primary_contact_id: created.id }));
    }
    setShowNewContact(false);
    setNewContact({ name: '', role: '', email: '', phone: '' });
    toast.success('Contato criado');
  }

  function prepared(): OpportunityFormValues {
    return {
      ...values,
      estimated_value: values.estimated_value === '' || values.estimated_value == null ? null : Number(values.estimated_value),
      // probability é fração 0-1 no domínio (STAGE_PROBABILITY); o form coleta em %.
      probability: values.probability === '' || values.probability == null ? null : Number(values.probability) / 100,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = prepared();
    const v = validateOpportunityInput(input);
    if (!v.valid) {
      setFieldErrors(v.errors);
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    await onSubmit(input);
  }

  const selectedContact = contacts.find((c) => c.id === values.primary_contact_id);
  const qualityInput = {
    account_id: values.account_id || null,
    primary_contact_id: values.primary_contact_id || null,
    primary_contact_role: selectedContact?.role ?? initial?.primary_contact?.role ?? null,
    origin: values.origin || null,
    identified_need: values.identified_need || null,
    product_interest: values.product_interest || null,
    stage: values.stage || null,
    next_action: values.next_action || null,
    interaction_evidence: values.interaction_evidence || null,
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_280px] items-start">
      <div className="space-y-6 min-w-0">
        {/* Conta e contato */}
        <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Conta e contato</h2>

          <Field label="Conta" required error={fieldErrors.account_id}>
            <div className="flex items-center gap-3">
              <select
                value={values.account_id}
                onChange={(e) => setValues((prev) => ({ ...prev, account_id: e.target.value, primary_contact_id: '' }))}
                disabled={isEdit || loadingAccounts}
                className={SELECT_CLS}
              >
                <option value="">{loadingAccounts ? 'Carregando contas…' : 'Selecione a conta'}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.trade_name || a.legal_name}{a.city ? ` — ${a.city}${a.state ? `/${a.state}` : ''}` : ''}
                  </option>
                ))}
              </select>
              {!isEdit && (
                <button type="button" onClick={() => setShowNewAccount((s) => !s)} className={`${MINI_BTN_CLS} shrink-0`}>
                  {showNewAccount ? <X size={12} /> : <Plus size={12} />} Nova conta
                </button>
              )}
            </div>
          </Field>

          {showNewAccount && (
            <div className="rounded-lg bg-cyan-400/5 border border-cyan-400/20 p-3 space-y-3">
              <p className="text-[11px] font-bold text-cyan-400">Nova conta</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Razão social" required>
                  <input value={newAccount.legal_name} onChange={(e) => setNewAccount((p) => ({ ...p, legal_name: e.target.value }))} className={INPUT_CLS} />
                </Field>
                <Field label="Nome fantasia">
                  <input value={newAccount.trade_name} onChange={(e) => setNewAccount((p) => ({ ...p, trade_name: e.target.value }))} className={INPUT_CLS} />
                </Field>
                <Field label="Segmento">
                  <select value={newAccount.segment} onChange={(e) => setNewAccount((p) => ({ ...p, segment: e.target.value }))} className={SELECT_CLS}>
                    <option value="">Selecione</option>
                    {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-[1fr_80px] gap-3">
                  <Field label="Cidade">
                    <input value={newAccount.city} onChange={(e) => setNewAccount((p) => ({ ...p, city: e.target.value }))} className={INPUT_CLS} />
                  </Field>
                  <Field label="UF">
                    <input value={newAccount.state} maxLength={2} onChange={(e) => setNewAccount((p) => ({ ...p, state: e.target.value.toUpperCase() }))} className={INPUT_CLS} />
                  </Field>
                </div>
              </div>
              <button type="button" onClick={handleCreateAccount} disabled={savingAccount}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50">
                {savingAccount ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar conta
              </button>
            </div>
          )}

          <Field label="Contato principal" required error={fieldErrors.primary_contact_id}
            hint={!values.account_id ? 'Selecione a conta para listar os contatos' : undefined}>
            <div className="flex items-center gap-3">
              <select
                value={values.primary_contact_id}
                onChange={(e) => set('primary_contact_id', e.target.value)}
                disabled={!values.account_id || loadingContacts}
                className={SELECT_CLS}
              >
                <option value="">{loadingContacts ? 'Carregando contatos…' : 'Selecione o contato'}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.role ? ` — ${c.role}` : ''}</option>
                ))}
              </select>
              <button type="button" onClick={() => setShowNewContact((s) => !s)} disabled={!values.account_id} className={`${MINI_BTN_CLS} shrink-0`}>
                {showNewContact ? <X size={12} /> : <Plus size={12} />} Novo contato
              </button>
            </div>
          </Field>

          {showNewContact && (
            <div className="rounded-lg bg-cyan-400/5 border border-cyan-400/20 p-3 space-y-3">
              <p className="text-[11px] font-bold text-cyan-400">Novo contato</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome" required>
                  <input value={newContact.name} onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))} className={INPUT_CLS} />
                </Field>
                <Field label="Cargo" hint="Cargo do contato conta no score de qualidade">
                  <input value={newContact.role} onChange={(e) => setNewContact((p) => ({ ...p, role: e.target.value }))} className={INPUT_CLS} />
                </Field>
                <Field label="E-mail">
                  <input type="email" value={newContact.email} onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))} className={INPUT_CLS} />
                </Field>
                <Field label="Telefone">
                  <input value={newContact.phone} onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))} className={INPUT_CLS} />
                </Field>
              </div>
              <button type="button" onClick={handleCreateContact} disabled={savingContact}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50">
                {savingContact ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar contato
              </button>
            </div>
          )}
        </section>

        {/* Oportunidade */}
        <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Oportunidade</h2>

          <Field label="Nome da oportunidade" required error={fieldErrors.opportunity_name}>
            <input value={values.opportunity_name} onChange={(e) => set('opportunity_name', e.target.value)}
              placeholder="Ex.: Implantação Mentor IA — Rede Alfa" className={INPUT_CLS} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Origem" required error={fieldErrors.origin}>
              <select value={values.origin} onChange={(e) => set('origin', e.target.value)} className={SELECT_CLS}>
                <option value="">Selecione</option>
                {OPPORTUNITY_ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
              </select>
            </Field>
            <Field label="Produto de interesse" required error={fieldErrors.product_interest}>
              <select value={values.product_interest} onChange={(e) => set('product_interest', e.target.value)} className={SELECT_CLS}>
                <option value="">Selecione</option>
                {PRODUCT_PACKAGES.map((p) => <option key={p} value={p}>{PRODUCT_PACKAGE_LABELS[p]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Necessidade identificada" required error={fieldErrors.identified_need}>
            <textarea value={values.identified_need} onChange={(e) => set('identified_need', e.target.value)}
              rows={3} placeholder="Qual dor/objetivo do cliente essa oportunidade endereça?" className={INPUT_CLS} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            {!isEdit && (
              <Field label="Estágio" required error={fieldErrors.stage}>
                <select value={values.stage} onChange={(e) => set('stage', e.target.value)} className={SELECT_CLS}>
                  {OPEN_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </Field>
            )}
            <Field label="Valor estimado (R$)" required error={fieldErrors.estimated_value}>
              <input type="number" min={0} step="0.01" value={values.estimated_value}
                onChange={(e) => set('estimated_value', e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Previsão de fechamento" required error={fieldErrors.estimated_close_date}>
              <input type="date" value={values.estimated_close_date}
                onChange={(e) => set('estimated_close_date', e.target.value)} className={INPUT_CLS} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Field label="Próxima ação" required error={fieldErrors.next_action}>
              <input value={values.next_action} onChange={(e) => set('next_action', e.target.value)}
                placeholder="Ex.: Enviar proposta comercial" className={INPUT_CLS} />
            </Field>
            <Field label="Data da próxima ação" required error={fieldErrors.next_action_date}>
              <input type="date" value={values.next_action_date}
                onChange={(e) => set('next_action_date', e.target.value)} className={INPUT_CLS} />
            </Field>
          </div>

          <Field
            label="Evidência de interação"
            required
            error={fieldErrors.interaction_evidence}
            hint="Registre a evidência da interação — e-mail, reunião, mensagem — que valida a oportunidade"
          >
            <textarea value={values.interaction_evidence} onChange={(e) => set('interaction_evidence', e.target.value)}
              rows={3} className={INPUT_CLS} />
          </Field>
        </section>

        {/* Qualificação adicional */}
        <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Qualificação adicional (opcional)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Probabilidade (%)" error={fieldErrors.probability}>
              <input type="number" min={0} max={100} value={values.probability}
                onChange={(e) => set('probability', e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Concorrentes">
              <input value={values.competitors} onChange={(e) => set('competitors', e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Objeções">
              <input value={values.objections} onChange={(e) => set('objections', e.target.value)} className={INPUT_CLS} />
            </Field>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Registrar oportunidade'}
          </button>
          {!isEdit && (
            <p className="text-[11px] text-gray-500">O registro formal inicia a proteção comercial de 90 dias.</p>
          )}
        </div>
      </div>

      <div className="lg:sticky lg:top-6">
        <OpportunityQualityScore input={qualityInput} />
      </div>
    </form>
  );
}
