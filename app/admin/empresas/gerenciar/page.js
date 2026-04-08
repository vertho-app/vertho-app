'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Users } from 'lucide-react';
import { loadEmpresas, loadResumoEmpresa, importarColaboradoresLote } from './actions';

export default function GerenciarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState([]);
  const [tenantId, setTenantId] = useState(empresaParam || null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadEmpresas().then(data => {
      setEmpresas(data);
      if (empresaParam) {
        const emp = data.find(e => e.id === empresaParam);
        if (emp) setEmpresaNome(emp.nome);
      }
    }).finally(() => setLoading(false));
  }, [empresaParam]);
  useEffect(() => {
    if (tenantId) loadResumoEmpresa(tenantId).then(setResumo);
    else setResumo(null);
  }, [tenantId]);

  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setImporting(true); setMsg('');
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    // Detectar separador: se a primeira linha tem mais ';' que ',', usa ';'
    const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    const colabs = lines.slice(1).map(line => {
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const obj = {};
      header.forEach((h, i) => { obj[h] = cols[i]; });
      return { nome: obj.nome || obj.nome_completo, email: obj.email, cargo: obj.cargo, role: obj.role || obj.papel };
    }).filter(c => c.email);

    if (colabs.length === 0) {
      setMsg(`Nenhum colaborador encontrado no CSV. Verifique se tem coluna "email" no cabeçalho. Separador detectado: "${sep}"`);
      setImporting(false);
      return;
    }

    const r = await importarColaboradoresLote(tenantId, colabs);
    setMsg(r.success ? r.message : r.error);
    setImporting(false);
    if (r.success) loadResumoEmpresa(tenantId).then(setResumo);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6" style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #091D35 0%, #0F2A4A 100%)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Gerenciar Colaboradores</h1>
          {empresaParam && empresaNome && <p className="text-xs text-gray-500">{empresaNome}</p>}
        </div>
        <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      {!empresaParam && (
        <select value={tenantId || ''} onChange={e => setTenantId(e.target.value || null)}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none mb-4"
          style={{ background: '#091D35' }}>
          <option value="">Selecione uma empresa</option>
          {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
        </select>
      )}

      {resumo && (
        <div className="rounded-xl p-4 border border-white/[0.06] mb-4" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">{resumo.colabs} colaboradores</span>
          </div>
          <p className="text-xs text-gray-500">{resumo.competencias} competências</p>
        </div>
      )}

      {tenantId && (
        <>
          {/* Instrução CSV */}
          <div className="rounded-xl p-4 border border-white/[0.06] mb-4" style={{ background: '#0F2A4A' }}>
            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Formato do CSV</p>
            <p className="text-xs text-gray-400 mb-2">O arquivo deve ter cabeçalho na primeira linha. Colunas aceitas:</p>
            <div className="overflow-x-auto">
              <table className="text-[10px] text-gray-300">
                <thead><tr className="border-b border-white/[0.06]">
                  <th className="pr-4 py-1 text-left font-bold text-white">Coluna</th>
                  <th className="pr-4 py-1 text-left font-bold text-white">Obrigatória</th>
                  <th className="py-1 text-left font-bold text-white">Exemplo</th>
                </tr></thead>
                <tbody>
                  <tr><td className="pr-4 py-0.5 text-cyan-400 font-semibold">email</td><td className="pr-4">Sim</td><td>maria@empresa.com</td></tr>
                  <tr><td className="pr-4 py-0.5">nome / nome_completo</td><td className="pr-4">Não</td><td>Maria Silva</td></tr>
                  <tr><td className="pr-4 py-0.5">cargo</td><td className="pr-4">Não</td><td>Coordenadora</td></tr>
                  <tr><td className="pr-4 py-0.5">role / papel</td><td className="pr-4">Não</td><td>colaborador / gestor / rh</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">Se <span className="text-gray-400">role</span> vier vazio, o padrão é <span className="text-cyan-400">colaborador</span>. Duplicatas por email são ignoradas.</p>
          </div>

          <label className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importing ? 'Importando...' : 'Importar CSV'}
            <input type="file" accept=".csv" onChange={handleCSV} className="hidden" disabled={importing} />
          </label>
        </>
      )}

      {msg && <p className="text-xs text-cyan-400 mt-3 text-center">{msg}</p>}
    </div>
  );
}
