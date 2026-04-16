'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { loadPlatformAdmins, adicionarAdmin, removerAdmin } from './actions';

export default function PlatformAdminsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadPlatformAdmins().then(d => { setAdmins(d); setLoading(false); });
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true); setError('');
    const r = await adicionarAdmin(email, nome);
    if (r.success) {
      setSuccess(r.message); setTimeout(() => setSuccess(''), 3000);
      setEmail(''); setNome('');
      loadPlatformAdmins().then(setAdmins);
    } else { setError(r.error); }
    setAdding(false);
  }

  async function handleRemove(id, adminEmail) {
    if (!confirm(`Remover ${adminEmail} como admin da plataforma?`)) return;
    setRemoving(id);
    const r = await removerAdmin(id);
    if (r.success) {
      setAdmins(prev => prev.filter(a => a.id !== id));
      setSuccess(r.message); setTimeout(() => setSuccess(''), 3000);
    } else { setError(r.error); }
    setRemoving(null);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[700px] mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={24} className="text-cyan-400" />
          <div>
            <h1 className="text-lg font-bold text-white">Admins da Plataforma</h1>
            <p className="text-xs text-gray-500">Usuarios com acesso ao painel /admin</p>
          </div>
        </div>
        <button onClick={() => router.push('/admin/dashboard')}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-red-400/20" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <AlertTriangle size={14} className="text-red-400" />
          <p className="text-xs text-red-400 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-400">×</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-green-400/20" style={{ background: 'rgba(34,197,94,0.06)' }}>
          <ShieldCheck size={14} className="text-green-400" />
          <p className="text-xs text-green-400 font-semibold">{success}</p>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="rounded-xl border border-white/[0.06] p-4 mb-6" style={{ background: '#0F2A4A' }}>
        <p className="text-sm font-semibold text-gray-300 mb-3">Adicionar Admin</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            type="email"
            required
            className="px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
            style={{ background: '#091D35' }}
          />
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Nome (opcional)"
            className="px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
            style={{ background: '#091D35' }}
          />
          <button type="submit" disabled={adding}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar
          </button>
        </div>
      </form>

      {/* List */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-gray-300">Admins Ativos ({admins.length})</p>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {admins.map(admin => (
            <div key={admin.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-cyan-400/10 text-cyan-400 text-xs font-bold shrink-0">
                {(admin.nome || admin.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{admin.nome || '—'}</p>
                <p className="text-[10px] text-gray-500 truncate">{admin.email}</p>
              </div>
              <p className="text-[10px] text-gray-600 shrink-0">
                {new Date(admin.created_at).toLocaleDateString('pt-BR')}
              </p>
              <button onClick={() => handleRemove(admin.id, admin.email)}
                disabled={removing === admin.id}
                className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                {removing === admin.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
          {admins.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">Nenhum admin cadastrado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
