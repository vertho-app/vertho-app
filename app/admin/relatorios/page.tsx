'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, FileBarChart, Download, ChevronDown, User } from 'lucide-react';
import { loadEmpresas, loadRelatorios } from './actions';
import { getSupabase } from '@/lib/supabase-browser';

export default function RelatoriosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [relatorios, setRelatorios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRel, setLoadingRel] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await getSupabase().auth.getUser();
      const email = user?.email || null;
      setUserEmail(email);
      if (!email) { setLoading(false); return; }

      const r = await loadEmpresas(email);
      if (r.success) {
        setEmpresas(r.data || []);
        if (empresaParam) {
          const emp = (r.data || []).find((e: any) => e.id === empresaParam);
          if (emp) setEmpresaNome(emp.nome);
          handleSelectEmpresa(empresaParam, email);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function handleSelectEmpresa(id: string, emailOverride?: string) {
    const email = emailOverride || userEmail;
    setEmpresaId(id);
    if (!id || !email) { setRelatorios([]); return; }
    setLoadingRel(true);
    const r = await loadRelatorios(email, id);
    if (r.success) setRelatorios(r.data || []);
    setLoadingRel(false);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><FileBarChart size={20} className="text-cyan-400" /> Relatorios</h1>
          {empresaParam && empresaNome ? (
            <p className="text-xs text-gray-500">{empresaNome}</p>
          ) : (
            <p className="text-xs text-gray-500">Download de relatorios individuais</p>
          )}
        </div>
      </div>

      {/* Empresa selector */}
      {!empresaParam && (
        <div className="mb-6">
          <div className="relative w-full max-w-sm">
            <select value={empresaId} onChange={e => handleSelectEmpresa(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-[#0F2A4A] text-white text-sm px-4 py-2.5 pr-10 focus:outline-none focus:border-cyan-400/50">
              <option value="">Selecione uma empresa...</option>
              {empresas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
      )}

      {loadingRel && <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}

      {/* Empty */}
      {!loadingRel && empresaId && relatorios.length === 0 && (
        <div className="text-center py-12">
          <FileBarChart size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum relatorio individual encontrado</p>
        </div>
      )}

      {/* Table */}
      {!loadingRel && relatorios.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <FileBarChart size={16} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">Relatorios Individuais ({relatorios.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Colaborador</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {relatorios.map((r: any) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                          <User size={14} className="text-cyan-400" />
                        </div>
                        <span className="text-white font-semibold">{r.colaboradores?.nome_completo || 'Colaborador'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/api/relatorios/individual?colaboradorId=${r.colaborador_id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors">
                        <Download size={12} /> Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
