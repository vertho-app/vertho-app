'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Users, ClipboardCheck, Target, Database, BookOpen, GraduationCap,
  Plus, Loader2, RefreshCw, Zap, BookMarked, ShieldCheck, ChevronRight,
  Trash2, Video, GraduationCap as GradIcon, BarChart2, FileText, Shield,
} from 'lucide-react';
import { loadAdminDashboard } from './actions';

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('pt-BR');
}

// ── serif italic style ──────────────────────────────────────────────────────
const serif: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

// ── nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Radar (Ingestão)',   href: '/admin/radar',                            icon: BarChart2   },
  { label: 'Competências',       href: '/admin/competencias',                    icon: BookMarked  },
  { label: 'Simulador',          href: '/admin/simulador',                        icon: Zap         },
  { label: 'Conteúdos',          href: '/admin/conteudos',                        icon: BookOpen    },
  { label: 'Custo IA',           href: '/admin/vertho/simulador-custo',           icon: BarChart2   },
  { label: 'Vídeos',             href: '/admin/videos',                           icon: Video       },
  { label: 'Evidências',         href: '/admin/vertho/evidencias',                icon: FileText    },
  { label: 'Preferências',       href: '/admin/preferencias-aprendizagem',        icon: GradIcon    },
  { label: 'Av. Acumulada',      href: '/admin/vertho/avaliacao-acumulada',       icon: ClipboardCheck },
  { label: 'Sem 14 Auditoria',   href: '/admin/vertho/auditoria-sem14',           icon: ShieldCheck },
  { label: 'Knowledge Base',     href: '/admin/vertho/knowledge-base',            icon: Database    },
  { label: 'Admins',             href: '/admin/platform-admins',                  icon: Users       },
  { label: 'Lixeira',            href: '/admin/lixeira',                          icon: Trash2      },
];

// ── empresa letter glyph ───────────────────────────────────────────────────
function empresaGlyph(nome: string) {
  return nome.trim()[0]?.toUpperCase() ?? '?';
}

// ── empresa status badge ───────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'ativa') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
        style={{ background: 'rgba(46,204,113,.12)', color: '#2ecc71', border: '1px solid rgba(46,204,113,.25)' }}>
        Ativa
      </span>
    );
  }
  if (status === 'pausada') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
        style={{ background: 'rgba(244,183,64,.12)', color: '#f4b740', border: '1px solid rgba(244,183,64,.25)' }}>
        Pausada
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
      style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.4)', border: '1px solid rgba(255,255,255,.08)' }}>
      Aguardando
    </span>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  async function load() {
    const r = await loadAdminDashboard();
    setData(r);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleRefresh() {
    setRefreshing(true);
    load();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-dvh">
      <Loader2 size={28} className="animate-spin" style={{ color: '#34c5cc' }} />
    </div>
  );

  const {
    empresas, totalColabs, totalAvaliacoes, totalPDIs,
    totalCenarios, totalTrilhas, totalCapacitacao, health,
  } = data;

  const allHealthOk = Object.values(health).every(v => v === 'OK');

  return (
    <div
      className="min-h-dvh p-5 md:p-8"
      style={{
        background:
          'radial-gradient(1100px 500px at 90% -5%, rgba(52,197,204,.07), transparent 55%), ' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%), ' +
          'linear-gradient(180deg, #06172c 0%, #091d35 50%, #0a1f3a 100%)',
      }}
    >
      {/* ── max-width shell ── */}
      <div className="max-w-[1280px] mx-auto">

        {/* ── layout: hero + right col ── */}
        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 280px' }}>

          {/* ════ HERO PANEL ════ */}
          <div
            className="rounded-[20px] p-7 flex flex-col gap-7"
            style={{
              background:
                'radial-gradient(80% 60% at 90% 10%, rgba(52,197,204,.13), transparent 55%), ' +
                'linear-gradient(180deg, rgba(12,32,56,.98), rgba(8,22,42,.98))',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            {/* ── header ── */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: .85, marginBottom: 14 }} />
                <h1 style={{ ...serif, fontSize: 'clamp(32px,4vw,52px)', lineHeight: .98, letterSpacing: '-.02em', color: '#fff' }}>
                  Painel <em style={{ color: '#34c5cc' }}>Admin</em>
                </h1>
                <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255,255,255,.4)', letterSpacing: '.08em', marginTop: 6 }}>
                  Visão global · {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Health indicator */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: allHealthOk ? 'rgba(46,204,113,.1)' : 'rgba(249,115,84,.1)', border: `1px solid ${allHealthOk ? 'rgba(46,204,113,.25)' : 'rgba(249,115,84,.25)'}` }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: allHealthOk ? '#2ecc71' : '#f97354', boxShadow: `0 0 6px ${allHealthOk ? '#2ecc71' : '#f97354'}` }}></span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 600, color: allHealthOk ? '#2ecc71' : '#f97354', letterSpacing: '.14em', textTransform: 'uppercase' }}>
                    {allHealthOk ? 'Sistema ok' : 'Atenção'}
                  </span>
                </div>
                <button onClick={handleRefresh} disabled={refreshing} title="Atualizar"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.4)' }}>
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { val: empresas.length,   label: 'Empresas',     color: '#34c5cc' },
                { val: totalColabs,        label: 'Colaboradores', color: '#2ecc71' },
                { val: totalAvaliacoes,    label: 'Avaliações',   color: '#f4b740' },
                { val: totalPDIs,          label: 'PDIs Ativos',  color: '#9e4edd' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-[14px] p-4"
                  style={{ background: 'rgba(0,0,0,.22)', border: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-.03em' }}>
                    {fmt(kpi.val)}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.52)', marginTop: 6 }}>{kpi.label}</div>
                  <div className="mt-2 h-[3px] rounded-full" style={{ background: kpi.color, opacity: .45, width: '100%' }}></div>
                </div>
              ))}
            </div>

            {/* ── Empresas list ── */}
            <div className="flex flex-col gap-3">
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', fontWeight: 600 }}>
                Empresas ({empresas.length})
              </div>

              {empresas.length === 0 && (
                <div className="text-center py-8" style={{ color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
                  Nenhuma empresa cadastrada ainda.
                </div>
              )}

              {empresas.map((emp: any) => (
                <button
                  key={emp.id}
                  onClick={() => router.push(`/admin/empresas/${emp.id}`)}
                  className="w-full text-left rounded-[14px] transition-all active:scale-[0.99]"
                  style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', padding: '14px 16px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.055)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.14)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.08)'; }}
                >
                  <div className="flex items-center gap-3">
                    {/* Glifo serif */}
                    <div className="flex items-center justify-center rounded-[10px] shrink-0"
                      style={{ width: 40, height: 40, background: 'rgba(52,197,204,.1)', border: '1px solid rgba(52,197,204,.2)', fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic', fontSize: 22, color: '#34c5cc' }}>
                      {empresaGlyph(emp.nome)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-white truncate">{emp.nome}</div>
                      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.35)', letterSpacing: '.04em', marginTop: 2 }}>
                        {fmt(emp.totalColab)} colabs
                        {emp.segmento ? ` · ${emp.segmento}` : ''}
                      </div>
                    </div>

                    {/* Status + pct */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={emp.status} />
                      <ChevronRight size={14} style={{ color: 'rgba(255,255,255,.25)' }} />
                    </div>
                  </div>
                </button>
              ))}

              {/* Nova empresa CTA */}
              <button
                onClick={() => router.push('/admin/empresas/nova')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-[14px] text-sm font-bold transition-all active:scale-[0.99]"
                style={{ background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.22)', color: '#2ecc71' }}
              >
                <Plus size={15} /> Nova Empresa
              </button>
            </div>
          </div>

          {/* ════ RIGHT COL ════ */}
          <div className="flex flex-col gap-4">

            {/* System Health */}
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                <Zap size={13} style={{ color: '#f4b740' }} />
                <span className="text-xs font-bold text-white">System Health</span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Supabase</span>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: 'rgba(46,204,113,.12)', color: '#2ecc71', border: '1px solid rgba(46,204,113,.25)' }}>
                    Conectado
                  </span>
                </div>
                <div className="flex flex-col gap-2" style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                  {Object.entries(health).map(([table, status]: [string, any]) => (
                    <div key={table} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full"
                          style={{ background: status === 'OK' ? '#2ecc71' : '#f97354', boxShadow: `0 0 5px ${status === 'OK' ? '#2ecc71' : '#f97354'}` }} />
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{table}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, color: status === 'OK' ? '#2ecc71' : '#f97354' }}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                <Target size={13} style={{ color: '#34c5cc' }} />
                <span className="text-xs font-bold text-white">Ações rápidas</span>
              </div>
              <div className="p-3 flex flex-col gap-2">
                <button onClick={() => router.push('/admin/empresas/nova')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.22)', color: '#2ecc71' }}>
                  <Plus size={14} /> Nova Empresa
                </button>
                <button onClick={() => router.push('/admin/simulador')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(244,183,64,.08)', border: '1px solid rgba(244,183,64,.22)', color: '#f4b740' }}>
                  <Zap size={14} /> Rodar Simulador
                </button>
              </div>
            </div>

            {/* Navigation grid */}
            <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                <Database size={13} style={{ color: '#9ae2e6' }} />
                <span className="text-xs font-bold text-white">Navegação</span>
              </div>
              <div className="p-2.5 grid grid-cols-2 gap-1.5">
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.href}
                      onClick={() => router.push(item.href)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left"
                      style={{ color: 'rgba(255,255,255,.55)', border: '1px solid transparent' }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)';
                        (e.currentTarget as HTMLElement).style.color = '#fff';
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.08)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = '';
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                      }}
                    >
                      <Icon size={12} style={{ flexShrink: 0 }} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
