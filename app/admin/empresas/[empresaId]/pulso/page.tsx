'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Activity, Plus, Send, CheckCircle, Loader2, Users, X } from 'lucide-react';
import {
  listarCiclos, criarCiclo, dispararPulso, fecharMomento, listarAssignmentsCiclo,
  type PulseCicloStatus,
} from '@/actions/pulse/admin';

export default function PulsoAdminPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [ciclos, setCiclos] = useState<PulseCicloStatus[]>([]);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaDesc, setNovaDesc] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<any[]>([]);

  async function reload() {
    setLoading(true);
    const c = await listarCiclos(empresaId);
    setCiclos(c);
    setLoading(false);
  }

  useEffect(() => { reload(); }, [empresaId]);

  async function handleCriar() {
    if (!novoNome.trim()) return;
    setBusy('criar');
    const r = await criarCiclo(empresaId, { nome: novoNome, descricao: novaDesc || null });
    setBusy(null);
    if (r.ok === false) { alert(r.error); return; }
    setNovoNome(''); setNovaDesc(''); setCriando(false);
    await reload();
  }

  async function handleDisparar(cicloId: string, momento: 'T0' | 'T2') {
    if (!window.confirm(
      `Criar assignments de ${momento} para TODOS os colaboradores ativos da empresa?\n\n` +
      `Cada colaborador receberá um link pra responder ~3 min. Isso não envia o link automaticamente — ` +
      `use a tela de Envios depois pra disparar via email/WhatsApp.`
    )) return;
    setBusy(`${cicloId}-${momento}`);
    const r = await dispararPulso(empresaId, cicloId, momento);
    setBusy(null);
    if (r.ok === false) { alert(r.error); return; }
    alert(`✓ ${r.criados} assignments criados.`);
    await reload();
  }

  async function handleFechar(cicloId: string, momento: 'T0' | 'T2') {
    if (!window.confirm(`Fechar momento ${momento}? Após fechado, novas respostas não serão aceitas.`)) return;
    setBusy(`${cicloId}-fechar-${momento}`);
    const r = await fecharMomento(empresaId, cicloId, momento);
    setBusy(null);
    if (r.ok === false) { alert(r.error); return; }
    await reload();
  }

  async function abrirDetalhe(cicloId: string) {
    setDetalheId(cicloId);
    const data = await listarAssignmentsCiclo(empresaId, cicloId);
    setDetalhe(data);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity size={20} className="text-cyan-400" /> Pulso de Desenvolvimento
            </h1>
            <p className="text-xs text-gray-500">Ciclos de pulso T0/T2 da empresa</p>
          </div>
        </div>
        <button onClick={() => setCriando(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
          <Plus size={12} /> Novo ciclo
        </button>
      </div>

      {/* Formulário inline de novo ciclo */}
      {criando && (
        <div className="mb-5 p-4 rounded-xl border border-cyan-400/20" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-white">Novo ciclo</p>
            <button onClick={() => { setCriando(false); setNovoNome(''); setNovaDesc(''); }}
              className="text-gray-500 hover:text-white"><X size={14} /></button>
          </div>
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome do ciclo (ex: 1º Semestre 2026)"
            className="w-full mb-2 rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
          <input value={novaDesc} onChange={e => setNovaDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            className="w-full mb-3 rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
          <button onClick={handleCriar} disabled={!novoNome.trim() || busy === 'criar'}
            className="w-full py-2.5 rounded-lg text-[11px] font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 transition-all disabled:opacity-50">
            {busy === 'criar' ? 'Criando...' : 'Criar ciclo'}
          </button>
        </div>
      )}

      {/* Lista de ciclos */}
      {ciclos.length === 0 ? (
        <div className="text-center py-16">
          <Activity size={28} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum ciclo criado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ciclos.map(c => (
            <div key={c.id} className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-white">{c.nome}</p>
                  {c.descricao && <p className="text-[11px] text-gray-500">{c.descricao}</p>}
                  <p className="text-[9px] text-gray-600 mt-1 uppercase tracking-widest">Status: {c.status}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => router.push(`/admin/empresas/${empresaId}/pulso/${c.id}/enviar`)}
                    className="text-[10px] font-bold text-purple-400 hover:underline">Enviar →</button>
                  <button onClick={() => router.push(`/admin/empresas/${empresaId}/pulso/${c.id}/dashboard`)}
                    className="text-[10px] font-bold text-cyan-400 hover:underline">Dashboard →</button>
                  <button onClick={() => abrirDetalhe(c.id)}
                    className="text-[10px] text-gray-400 hover:underline">Detalhes</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MomentoCard
                  label="T0 — Linha de base"
                  total={c.t0_total} completos={c.t0_completos}
                  aberto={!!c.t0_aberto_em && !c.t0_fechado_em}
                  encerrado={!!c.t0_fechado_em}
                  onDisparar={() => handleDisparar(c.id, 'T0')}
                  onFechar={() => handleFechar(c.id, 'T0')}
                  busy={busy?.startsWith(c.id)}
                />
                <MomentoCard
                  label="T2 — Pós-jornada"
                  total={c.t2_total} completos={c.t2_completos}
                  aberto={!!c.t2_aberto_em && !c.t2_fechado_em}
                  encerrado={!!c.t2_fechado_em}
                  onDisparar={() => handleDisparar(c.id, 'T2')}
                  onFechar={() => handleFechar(c.id, 'T2')}
                  busy={busy?.startsWith(c.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal detalhe */}
      {detalheId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDetalheId(null)}>
          <div className="bg-[#0F2B54] rounded-xl border border-white/10 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0F2B54] flex items-center justify-between p-4 border-b border-white/10">
              <p className="text-sm font-bold text-white">Assignments do ciclo</p>
              <button onClick={() => setDetalheId(null)} className="text-gray-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-1.5">
              {detalhe.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum assignment ainda.</p>
              ) : detalhe.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] py-2 border-b border-white/[0.04]">
                  <span className="text-white truncate flex-1">{a.colaborador?.nome_completo || '—'}</span>
                  <span className="text-gray-500">{a.colaborador?.cargo || ''}</span>
                  <span className={`px-2 py-0.5 rounded ${
                    a.status === 'completed' ? 'bg-green-400/15 text-green-400' :
                    a.status === 'started' ? 'bg-cyan-400/15 text-cyan-400' :
                    'bg-gray-400/15 text-gray-400'
                  }`}>{a.pulse_moment} · {a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MomentoCard({ label, total, completos, aberto, encerrado, onDisparar, onFechar, busy }: any) {
  const pct = total > 0 ? Math.round((completos / total) * 100) : 0;
  return (
    <div className="p-3 rounded-lg" style={{ background: '#091D35' }}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</p>
      {total === 0 ? (
        <button onClick={onDisparar} disabled={!!busy}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Disparar assignments
        </button>
      ) : (
        <>
          <div className="flex items-baseline gap-1 mb-1.5">
            <span className="text-lg font-bold text-white">{completos}</span>
            <span className="text-[10px] text-gray-500">/ {total}</span>
            <span className="text-[10px] text-cyan-400 font-bold ml-auto">{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] mb-2 overflow-hidden">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {aberto && (
            <button onClick={onFechar} disabled={!!busy}
              className="w-full text-[10px] text-amber-400 hover:text-amber-300 py-1">
              Fechar momento
            </button>
          )}
          {encerrado && (
            <p className="text-[10px] text-green-400 text-center flex items-center justify-center gap-1">
              <CheckCircle size={10} /> Encerrado
            </p>
          )}
        </>
      )}
    </div>
  );
}
