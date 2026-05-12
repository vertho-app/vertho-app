'use client';

import { useState, useEffect, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Brain, Search, Download, FileText, CheckCircle2, Clock, Users, Sparkles } from 'lucide-react';
import { loadPerfisComportamentaisEmpresa } from '@/actions/admin-perfis';
import { baixarRelatorioComportamentalPdfPorId } from '@/app/dashboard/perfil-comportamental/relatorio/relatorio-actions';

type Filtro = 'todos' | 'completos' | 'pendentes';

const DISC_COLORS: Record<string, string> = { D: '#EAB308', I: '#94A3B8', S: '#10B981', C: '#3B82F6' };
const DISC_LABELS: Record<string, string> = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

export default function PerfisComportamentaisPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [search, setSearch] = useState('');
  const [baixando, setBaixando] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => {
    (async () => {
      const r = await loadPerfisComportamentaisEmpresa(empresaId);
      setData(r);
      setLoading(false);
    })();
  }, [empresaId]);

  const filtrados = useMemo(() => {
    const list: any[] = data?.perfis || [];
    const q = search.trim().toLowerCase();
    return list
      .filter((p) => {
        if (filtro === 'completos' && !p.hasDisc) return false;
        if (filtro === 'pendentes' && p.hasDisc) return false;
        if (q) {
          const blob = `${p.nome} ${p.cargo} ${p.area || ''} ${p.email || ''}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      });
  }, [data, filtro, search]);

  async function handleBaixarPdf(colabId: string) {
    setBaixando(colabId);
    const r = await baixarRelatorioComportamentalPdfPorId(colabId);
    setBaixando(null);
    if ((r as any)?.error) { flash((r as any).error); return; }
    const url = (r as any)?.url;
    if (url) window.open(url, '_blank');
  }

  if (loading) {
    return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  }

  if (data?.error) {
    return <div className="max-w-[700px] mx-auto p-6"><p className="text-red-400 text-sm">{data.error}</p></div>;
  }

  const stats = data.stats;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Brain size={20} className="text-purple-400" /> Perfis Comportamentais
          </h1>
          <p className="text-xs text-gray-500">DISC dos colaboradores que concluíram o mapeamento</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        <StatCard icon={<Users size={14} />} label="Total" value={stats.total} tone="white" />
        <StatCard icon={<CheckCircle2 size={14} />} label="Completos" value={`${stats.completos} (${stats.pctCompletos}%)`} tone="emerald" />
        <StatCard icon={<Clock size={14} />} label="Pendentes" value={stats.pendentes} tone="amber" />
        <StatCard icon={<FileText size={14} />} label="Com PDF gerado" value={stats.comPdf} tone="cyan" />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['todos', 'completos', 'pendentes'] as Filtro[]).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              filtro === f ? 'bg-purple-500/20 border-purple-400/50 text-purple-300' : 'border-white/10 text-gray-400 hover:text-white'
            }`}>
            {f === 'todos' ? 'Todos' : f === 'completos' ? 'Completos' : 'Pendentes'}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, cargo, área…"
            className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-gray-500 outline-none focus:border-purple-500 w-[260px]"
          />
        </div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Brain size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm">Nenhum colaborador encontrado com este filtro.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((p) => (
            <PerfilCard key={p.id} p={p} onBaixar={handleBaixarPdf} baixando={baixando === p.id} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componentes ──────────────────────────────────────────────

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: any; tone: 'white' | 'emerald' | 'amber' | 'cyan' }) {
  const toneColor = { white: 'text-white', emerald: 'text-emerald-300', amber: 'text-amber-300', cyan: 'text-cyan-300' }[tone];
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 mb-1">{icon} {label}</p>
      <p className={`text-2xl font-extrabold ${toneColor}`}>{value}</p>
    </div>
  );
}

function PerfilCard({ p, onBaixar, baixando }: { p: any; onBaixar: (id: string) => void; baixando: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Identidade */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white">{p.nome}</p>
            {p.hasDisc ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">Completo</span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">Pendente</span>
            )}
            {p.role !== 'colaborador' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-gray-400 uppercase tracking-widest">{p.role}</span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">{p.cargo}{p.area ? ` · ${p.area}` : ''}</p>
          {p.email && <p className="text-[10px] text-gray-600 mt-0.5">{p.email}</p>}
        </div>

        {/* Perfil DISC */}
        {p.hasDisc ? (
          <>
            <div className="min-w-[200px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl font-extrabold text-white tracking-wider">{p.perfilDominante}</span>
                {p.arquetipo && (
                  <div>
                    <p className="text-xs font-bold text-purple-300">{p.arquetipo.nome}</p>
                    <p className="text-[10px] text-gray-500">{p.arquetipo.desc}</p>
                  </div>
                )}
              </div>
              {p.tags && p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.tags.map((t: string, i: number) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Mini DISC bars (Natural) */}
            <div className="min-w-[200px]">
              <p className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">DISC Natural</p>
              <div className="grid grid-cols-4 gap-1.5">
                {(['D', 'I', 'S', 'C'] as const).map((k) => {
                  const v = (p.disc.natural as any)[k.toLowerCase()] || 0;
                  return (
                    <div key={k} className="text-center" title={DISC_LABELS[k]}>
                      <div className="h-12 w-full rounded relative overflow-hidden bg-white/5 flex items-end">
                        <div className="w-full rounded transition-all" style={{ height: `${Math.min(100, v)}%`, background: DISC_COLORS[k] }} />
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">{k}</p>
                      <p className="text-[10px] font-bold" style={{ color: DISC_COLORS[k] }}>{Math.round(v)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col items-end gap-1 min-w-[160px]">
              <button
                onClick={() => onBaixar(p.id)}
                disabled={baixando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
              >
                {baixando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Baixar PDF
              </button>
              <p className="text-[9px] text-gray-600 mt-1">Mapeamento: {fmtDate(p.mapeamentoEm)}</p>
              {p.relatorioCacheEm && (
                <p className="text-[9px] text-gray-600">Textos LLM: {fmtDate(p.relatorioCacheEm)}</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 text-right">
            <p className="text-xs text-gray-500">Colaborador ainda não concluiu o mapeamento comportamental.</p>
          </div>
        )}
      </div>

      {/* Insights (se houver) */}
      {p.hasInsights && (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <p className="text-[10px] uppercase tracking-widest text-purple-300 mb-1.5 flex items-center gap-1">
            <Sparkles size={10} /> Insights Executivos
          </p>
          <ul className="space-y-0.5">
            {p.insights.slice(0, 3).map((ins: string, i: number) => (
              <li key={i} className="text-[11px] text-gray-300 leading-relaxed">• {ins}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
