'use client';

import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Users, X } from 'lucide-react';
import {
  createRepresentative, listRepresentativesForAdmin, updateRepresentativeCompensationModel, updateRepresentativeStatus,
} from '@/actions/sales/representatives';
import { COMPENSATION_MODELS, COMPENSATION_MODEL_LABELS, type CompensationModel } from '@/lib/sales/constants';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { fmtDate } from '@/lib/sales/formatters';
import EquipeRepresentante from '@/components/sales/equipe-representante';
import type { SalesRepresentative } from '@/lib/sales/types';

type RepStatus = SalesRepresentative['status'];

const STATUS_OPTIONS: { value: RepStatus; label: string }[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'suspended', label: 'Suspenso' },
];

const STATUS_COLOR: Record<RepStatus, string> = {
  active: '#22C55E',
  inactive: '#6B7280',
  suspended: '#EF4444',
};

const EMPTY_FORM = {
  email: '', name: '', company_name: '', cnpj: '', core_registration: '', phone: '', region: '',
  compensation_model: 'sem_ajuda' as CompensationModel,
};

export default function RepresentantesAdminPage() {
  const [equipeAberta, setEquipeAberta] = useState<string | null>(null);
  const confirmDialog = useConfirm();
  const [reps, setReps] = useState<SalesRepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const carregar = async () => {
    const r = await listRepresentativesForAdmin();
    if (r.success) { setReps(r.data); setError(null); }
    else setError(r.error || 'Falha ao carregar representantes');
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  function setField(k: Exclude<keyof typeof EMPTY_FORM, 'compensation_model'>, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCreate() {
    if (!form.email.trim() || !form.name.trim()) {
      toast.error('E-mail e nome são obrigatórios');
      return;
    }
    setSaving(true);
    const r = await createRepresentative({
      email: form.email.trim(),
      name: form.name.trim(),
      company_name: form.company_name.trim() || null,
      cnpj: form.cnpj.trim() || null,
      core_registration: form.core_registration.trim() || null,
      phone: form.phone.trim() || null,
      region: form.region.trim() || null,
      compensation_model: form.compensation_model,
    });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error || 'Falha ao criar representante');
      return;
    }
    toast.success(`Representante ${r.data.name} criado`);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    await carregar();
  }

  async function handleModelChange(rep: SalesRepresentative, model: CompensationModel) {
    if (model === rep.compensation_model) return;
    const ok = await confirmDialog({
      title: 'Trocar o modelo de remuneração',
      message: `${rep.name} passa a "${COMPENSATION_MODEL_LABELS[model]}" nas próximas propostas e aceites. Propostas e comissões já lançadas não mudam.`,
      confirmLabel: 'Trocar',
    });
    if (!ok) return;
    setBusyId(rep.id);
    const r = await updateRepresentativeCompensationModel(rep.id, model);
    setBusyId(null);
    if (!r.success) {
      toast.error(r.error || 'Falha ao trocar o modelo');
      return;
    }
    toast.success(`Modelo de ${rep.name} atualizado`);
    await carregar();
  }

  async function handleStatusChange(rep: SalesRepresentative, status: RepStatus) {
    if (status === rep.status) return;
    if (status === 'suspended') {
      const ok = await confirmDialog({
        title: 'Suspender representante',
        message: `${rep.name} perderá o acesso ao portal enquanto estiver suspenso.`,
        severity: 'danger',
        confirmLabel: 'Suspender',
      });
      if (!ok) return;
    }
    setBusyId(rep.id);
    const r = await updateRepresentativeStatus(rep.id, status);
    setBusyId(null);
    if (!r.success) {
      toast.error(r.error || 'Falha ao atualizar status');
      return;
    }
    toast.success(`Status de ${rep.name} atualizado`);
    await carregar();
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-xs text-white outline-none';
  const inputStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' } as const;

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={Users}
          title="Representantes"
          subtitle={`Canal comercial · ${reps.length} representante${reps.length === 1 ? '' : 's'}`}
          backHref="/admin/comercial"
          actions={
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
            >
              {showForm ? <X size={14} /> : <Plus size={14} />}
              {showForm ? 'Fechar' : 'Novo representante'}
            </button>
          }
        />

        {/* Form de criação */}
        {showForm && (
          <div className="mb-6 rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4">
            <h2 className="text-sm font-bold text-cyan-400 mb-3">Novo representante</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">E-mail *</label>
                <input value={form.email} onChange={(e) => setField('email', e.target.value)} type="email" className={inputCls} style={inputStyle} placeholder="rc@empresa.com.br" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">Nome *</label>
                <input value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputCls} style={inputStyle} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">Empresa</label>
                <input value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} className={inputCls} style={inputStyle} placeholder="Razão social" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">CNPJ</label>
                <input value={form.cnpj} onChange={(e) => setField('cnpj', e.target.value)} className={inputCls} style={inputStyle} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">Registro CORE</label>
                <input value={form.core_registration} onChange={(e) => setField('core_registration', e.target.value)} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">Telefone</label>
                <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={inputCls} style={inputStyle} placeholder="+55 11 99999-9999" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">Região</label>
                <input value={form.region} onChange={(e) => setField('region', e.target.value)} className={inputCls} style={inputStyle} placeholder="Ex.: SP capital, Sul, Nordeste" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 mb-1">Remuneração</label>
                <select
                  value={form.compensation_model}
                  onChange={(e) => setForm((f) => ({ ...f, compensation_model: e.target.value as CompensationModel }))}
                  className={`${inputCls} bg-[#091D35]`} style={inputStyle}
                >
                  {COMPENSATION_MODELS.map((m) => <option key={m} value={m}>{COMPENSATION_MODEL_LABELS[m]}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleCreate}
                disabled={saving || !form.email.trim() || !form.name.trim()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar representante
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : reps.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Nenhum representante cadastrado ainda.</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">E-mail</th>
                  <th className="px-3 py-2">Empresa / CNPJ</th>
                  <th className="px-3 py-2">Região</th>
                  <th className="px-3 py-2">Remuneração</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Criado em</th>
                  <th className="px-3 py-2">Equipe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reps.map((r) => (
                  <Fragment key={r.id}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-semibold text-white">{r.name}</td>
                    <td className="px-3 py-2 text-gray-300">{r.email}</td>
                    <td className="px-3 py-2 text-gray-400">
                      {r.company_name || '—'}
                      {r.cnpj && <span className="block text-[10px] text-gray-500 font-mono">{r.cnpj}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{r.region || '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={r.compensation_model}
                        disabled={busyId === r.id}
                        onChange={(e) => handleModelChange(r, e.target.value as CompensationModel)}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold border border-white/15 bg-[#091D35] text-gray-200 disabled:opacity-50"
                      >
                        {COMPENSATION_MODELS.map((m) => <option key={m} value={m}>{COMPENSATION_MODEL_LABELS[m]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.status}
                        disabled={busyId === r.id}
                        onChange={(e) => handleStatusChange(r, e.target.value as RepStatus)}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold border bg-[#091D35] disabled:opacity-50"
                        style={{ color: STATUS_COLOR[r.status], borderColor: `${STATUS_COLOR[r.status]}55` }}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setEquipeAberta(equipeAberta === r.id ? null : r.id)} className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300">
                        {equipeAberta === r.id ? 'Fechar' : 'Equipe'}
                      </button>
                    </td>
                  </tr>
                  {equipeAberta === r.id && (
                    <tr>
                      <td colSpan={8} className="px-3 py-2 bg-white/[0.02]">
                        <EquipeRepresentante repId={r.id} repNome={r.name} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
