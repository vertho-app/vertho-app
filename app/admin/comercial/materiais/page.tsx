'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive, ExternalLink, FileDown, FolderOpen, Loader2, Pencil, Plus, X,
} from 'lucide-react';
import {
  archiveSalesMaterial, createSalesMaterial, listAllSalesMaterialsForAdmin, updateSalesMaterial,
} from '@/actions/sales/materials';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_LABELS } from '@/lib/sales/constants';
import type { SalesMaterial } from '@/lib/sales/types';

type MaterialForm = {
  title: string;
  category: SalesMaterial['category'];
  segment: string;
  description: string;
  file_url: string;
  external_url: string;
};

const EMPTY_FORM: MaterialForm = {
  title: '', category: 'material', segment: '', description: '', file_url: '', external_url: '',
};

function toInput(f: MaterialForm) {
  return {
    title: f.title.trim(),
    category: f.category,
    segment: f.segment.trim() || null,
    description: f.description.trim() || null,
    file_url: f.file_url.trim() || null,
    external_url: f.external_url.trim() || null,
  };
}

function MaterialFormFields({ form, setForm }: { form: MaterialForm; setForm: (f: MaterialForm) => void }) {
  const inputCls = 'w-full rounded-lg px-3 py-2 text-xs text-white outline-none';
  const inputStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' } as const;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-[10px] uppercase text-gray-500 mb-1">Título *</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} style={inputStyle} />
      </div>
      <div>
        <label className="block text-[10px] uppercase text-gray-500 mb-1">Categoria</label>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as SalesMaterial['category'] })}
          className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]"
        >
          {MATERIAL_CATEGORIES.map((c) => (
            <option key={c} value={c}>{MATERIAL_CATEGORY_LABELS[c] || c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] uppercase text-gray-500 mb-1">Segmento</label>
        <input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className={inputCls} style={inputStyle} placeholder="Ex.: escola, empresa" />
      </div>
      <div>
        <label className="block text-[10px] uppercase text-gray-500 mb-1">URL do arquivo</label>
        <input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} className={inputCls} style={inputStyle} placeholder="https://..." />
      </div>
      <div>
        <label className="block text-[10px] uppercase text-gray-500 mb-1">Link externo</label>
        <input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} className={inputCls} style={inputStyle} placeholder="https://..." />
      </div>
      <div className="md:col-span-2">
        <label className="block text-[10px] uppercase text-gray-500 mb-1">Descrição</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className={`${inputCls} resize-y`}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

export default function MateriaisAdminPage() {
  const confirmDialog = useConfirm();
  const [materials, setMaterials] = useState<SalesMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<MaterialForm>({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<SalesMaterial | null>(null);
  const [editForm, setEditForm] = useState<MaterialForm>({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);

  const carregar = async () => {
    const r = await listAllSalesMaterialsForAdmin();
    if (r.success) { setMaterials(r.data); setError(null); }
    else setError(r.error || 'Falha ao carregar materiais');
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  async function handleCreate() {
    if (!createForm.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    setBusy(true);
    const r = await createSalesMaterial(toInput(createForm));
    setBusy(false);
    if (!r.success) {
      toast.error(r.error || 'Falha ao criar material');
      return;
    }
    toast.success('Material criado');
    setCreateForm({ ...EMPTY_FORM });
    setShowCreate(false);
    await carregar();
  }

  function openEdit(m: SalesMaterial) {
    setEditing(m);
    setEditForm({
      title: m.title,
      category: m.category,
      segment: m.segment || '',
      description: m.description || '',
      file_url: m.file_url || '',
      external_url: m.external_url || '',
    });
  }

  async function handleUpdate() {
    if (!editing) return;
    if (!editForm.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    setBusy(true);
    const r = await updateSalesMaterial(editing.id, toInput(editForm));
    setBusy(false);
    if (!r.success) {
      toast.error(r.error || 'Falha ao atualizar material');
      return;
    }
    toast.success('Material atualizado');
    setEditing(null);
    await carregar();
  }

  async function handleArchive(m: SalesMaterial) {
    const ok = await confirmDialog({
      title: 'Arquivar material',
      message: `"${m.title}" deixará de aparecer para os representantes.`,
      severity: 'danger',
      confirmLabel: 'Arquivar',
    });
    if (!ok) return;
    setBusy(true);
    const r = await archiveSalesMaterial(m.id);
    setBusy(false);
    if (!r.success) {
      toast.error(r.error || 'Falha ao arquivar material');
      return;
    }
    toast.success('Material arquivado');
    await carregar();
  }

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={FolderOpen}
          title="Materiais de venda"
          subtitle={`Biblioteca do canal · ${materials.length} materiais`}
          backHref="/admin/comercial"
          actions={
            <button
              onClick={() => setShowCreate((s) => !s)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
            >
              {showCreate ? <X size={14} /> : <Plus size={14} />}
              {showCreate ? 'Fechar' : 'Novo material'}
            </button>
          }
        />

        {/* Form de criação */}
        {showCreate && (
          <div className="mb-6 rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4">
            <h2 className="text-sm font-bold text-cyan-400 mb-3">Novo material</h2>
            <MaterialFormFields form={createForm} setForm={setCreateForm} />
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleCreate}
                disabled={busy || !createForm.title.trim()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar material
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : materials.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Nenhum material cadastrado ainda.</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Segmento</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Links</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {materials.map((m) => (
                  <tr key={m.id} className={`hover:bg-white/[0.02] ${!m.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-white">{m.title}</span>
                      {m.description && (
                        <span className="block text-[10px] text-gray-500 truncate max-w-xs">{m.description}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{MATERIAL_CATEGORY_LABELS[m.category] || m.category}</td>
                    <td className="px-3 py-2 text-gray-400">{m.segment || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold ${m.is_active ? 'text-emerald-400' : 'text-gray-500'}`}>
                        {m.is_active ? 'Sim' : 'Arquivado'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {m.file_url && (
                          <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300" title="Arquivo">
                            <FileDown size={13} />
                          </a>
                        )}
                        {m.external_url && (
                          <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300" title="Link externo">
                            <ExternalLink size={13} />
                          </a>
                        )}
                        {!m.file_url && !m.external_url && <span className="text-gray-600">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-white" title="Editar">
                          <Pencil size={13} />
                        </button>
                        {m.is_active && (
                          <button onClick={() => handleArchive(m)} disabled={busy} className="text-red-400 hover:text-red-300 disabled:opacity-50" title="Arquivar">
                            <Archive size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal de edição */}
        {editing && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(3,12,26,.72)', backdropFilter: 'blur(3px)' }}
              onClick={() => setEditing(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Editar material ${editing.title}`}
              className="relative w-full max-w-2xl rounded-2xl p-5"
              style={{ background: 'rgba(9,29,53,.97)', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white">Editar material</h2>
                <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white" title="Fechar">
                  <X size={16} />
                </button>
              </div>
              <MaterialFormFields form={editForm} setForm={setEditForm} />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-gray-400 border border-white/10 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={busy || !editForm.title.trim()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />} Salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
