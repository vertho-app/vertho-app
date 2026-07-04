'use client';

// Tab "Escolas" do workspace Escolas & PPP (Reorganização do admin, Fase 3).
// Conteúdo movido de app/admin/empresas/[empresaId]/escolas/page.tsx (rota legada
// virou redirect): normalização area_depto → escolas, vínculo PPP↔escola,
// marcação de escola central (rede) e escola por colaborador.

import { useState, useEffect, useMemo } from 'react';
import { Loader2, School, Wand2, Building2 } from 'lucide-react';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { loadEscolas, normalizarEscolasDaEmpresa, definirEscolaColaborador, atualizarEscola } from '@/actions/escolas';

export default function EscolasTab({ empresaId }: { empresaId: string }) {
  const confirmDialog = useConfirm();
  const [escolas, setEscolas] = useState<any[]>([]);
  const [colabs, setColabs] = useState<any[]>([]);
  const [ppps, setPpps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function refresh() {
    const d = await loadEscolas(empresaId);
    setEscolas(d.escolas); setColabs(d.colaboradores); setPpps(d.ppps);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [empresaId]);

  async function normalizar() {
    const ok = await confirmDialog({
      title: 'Normalizar escolas',
      message: 'Normalizar area_depto → escolas e sugerir o vínculo de cada colaborador? Você revisa depois. (Idempotente)',
      severity: 'normal',
    });
    if (!ok) return;
    setBusy(true); setMsg('');
    const r = await normalizarEscolasDaEmpresa(empresaId);
    setMsg(r.success ? `${r.escolas} escolas (${r.comPPP} com PPP). Revise abaixo.` : (r.error || 'Erro'));
    await refresh(); setBusy(false);
  }

  async function setPPP(escolaId: string, pppId: string) {
    await atualizarEscola(empresaId, escolaId, { ppp_escola_id: pppId || null });
    setEscolas(prev => prev.map(e => e.id === escolaId ? { ...e, ppp_escola_id: pppId || null } : e));
  }
  async function setCentral(escolaId: string, v: boolean) {
    await atualizarEscola(empresaId, escolaId, { is_central: v });
    setEscolas(prev => prev.map(e => e.id === escolaId ? { ...e, is_central: v } : e));
  }
  async function setColabEscola(colabId: string, escolaId: string) {
    await definirEscolaColaborador(empresaId, colabId, escolaId || null);
    setColabs(prev => prev.map(c => c.id === colabId ? { ...c, escola_id: escolaId || null } : c));
  }

  const countByEscola = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of colabs) if (c.escola_id) m[c.escola_id] = (m[c.escola_id] || 0) + 1;
    return m;
  }, [colabs]);
  const semEscola = colabs.filter(c => !c.escola_id).length;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <School size={24} className="text-cyan-400" />
        <div>
          <h2 className="text-lg font-bold text-white">Escolas & vínculo dos colaboradores</h2>
          <p className="text-xs text-gray-500">Base para cenários por escola/PPP. Normalize e revise o mapeamento.</p>
        </div>
      </div>

      <button onClick={normalizar} disabled={busy}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 my-4"
        style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        Normalizar area_depto → escolas (sugerir)
      </button>
      {msg && <p className="text-xs text-cyan-300 mb-4">{msg}</p>}

      {/* Escolas */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden mb-6" style={{ background: '#0F2A4A' }}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Building2 size={14} className="text-cyan-400" />
          <p className="text-sm font-semibold text-gray-300">Escolas ({escolas.length})</p>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {escolas.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 text-white truncate">{e.nome}
                <span className="text-[10px] text-gray-500 ml-2">{countByEscola[e.id] || 0} colab</span>
              </span>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <input type="checkbox" checked={!!e.is_central} onChange={ev => setCentral(e.id, ev.target.checked)} />
                central (rede)
              </label>
              <select value={e.ppp_escola_id || ''} onChange={ev => setPPP(e.id, ev.target.value)}
                disabled={e.is_central}
                className="text-[11px] rounded-md px-2 py-1 border border-white/10 text-white disabled:opacity-30"
                style={{ background: '#091D35' }}>
                <option value="" className="bg-[#091D35]">— sem PPP (rede) —</option>
                {ppps.map(p => <option key={p.id} value={p.id} className="bg-[#091D35]">{p.escola}</option>)}
              </select>
            </div>
          ))}
          {!escolas.length && <div className="px-4 py-8 text-center text-sm text-gray-500">Nenhuma escola. Clique em "Normalizar".</div>}
        </div>
      </div>

      {/* Colaboradores */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-gray-300">Colaboradores ({colabs.length}) · sem escola: {semEscola}</p>
        </div>
        <div className="divide-y divide-white/[0.03] max-h-[60vh] overflow-y-auto">
          {colabs.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1 min-w-0">
                <span className="text-white truncate block">{c.nome_completo}</span>
                <span className="text-[10px] text-gray-500">{c.cargo} · <span className="italic">{c.area_depto || '—'}</span></span>
              </span>
              <select value={c.escola_id || ''} onChange={ev => setColabEscola(c.id, ev.target.value)}
                className="text-[11px] rounded-md px-2 py-1 border border-white/10 text-white shrink-0"
                style={{ background: '#091D35' }}>
                <option value="" className="bg-[#091D35]">— rede (sem escola) —</option>
                {escolas.filter(e => !e.is_central).map(e => <option key={e.id} value={e.id} className="bg-[#091D35]">{e.nome}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
