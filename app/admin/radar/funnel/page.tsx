import Link from 'next/link';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

export const dynamic = 'force-dynamic';

type EtapaFunil = {
  label: string;
  total: number;
  totalHumanos?: number;
  desc: string;
};

async function loadFunilData(diasParam: number) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const dias = Math.min(Math.max(diasParam || 30, 1), 365);

  // Resumo de eventos via RPC
  const { data: eventos } = await sb.rpc('diag_funil_resumo', { dias });
  const evMap = new Map<string, any>();
  for (const e of eventos || []) evMap.set((e as any).tipo, e);

  // Top visitados
  const { data: top } = await sb.rpc('diag_funil_top_visitados', { dias, lim: 15 });

  // Leads + status PDF
  const since = new Date(Date.now() - dias * 86400_000).toISOString();
  const [leadsTotal, leadsPdfPronto, leadsContatado, leadsConvertido] = await Promise.all([
    sb.from('diag_leads').select('id', { count: 'exact', head: true }).gte('criado_em', since),
    sb.from('diag_leads').select('id', { count: 'exact', head: true }).eq('pdf_status', 'pronto').gte('criado_em', since),
    sb.from('diag_leads').select('id', { count: 'exact', head: true }).not('contato_em', 'is', null).gte('criado_em', since),
    sb.from('diag_leads').select('id', { count: 'exact', head: true }).eq('convertido', true).gte('criado_em', since),
  ]);

  // Custo IA acumulado
  const { data: custoData } = await sb
    .from('diag_analises_ia')
    .select('modelo, custo_usd, criado_em')
    .gte('criado_em', since);
  const custoTotal = (custoData || []).reduce((s: number, r: any) => s + Number(r.custo_usd || 0), 0);
  const totalAnalises = (custoData || []).length;

  const views = evMap.get('view_escola') || evMap.get('view_municipio') || evMap.get('view_estado');
  const viewsEscolas = evMap.get('view_escola');
  const viewsMunicipios = evMap.get('view_municipio');
  const viewsEstados = evMap.get('view_estado');
  const viewsTotalHumanos =
    Number(viewsEscolas?.total_humanos || 0) +
    Number(viewsMunicipios?.total_humanos || 0) +
    Number(viewsEstados?.total_humanos || 0);
  const viewsTotal =
    Number(viewsEscolas?.total || 0) +
    Number(viewsMunicipios?.total || 0) +
    Number(viewsEstados?.total || 0);
  const ctaClicks = evMap.get('cta_lead_click');

  const funil: EtapaFunil[] = [
    { label: 'Visitas (humanos)', total: viewsTotalHumanos, desc: `${viewsTotal} totais incluindo bots` },
    { label: 'Cliques no CTA "Receber PDF"', total: Number(ctaClicks?.total_humanos || 0), desc: 'usuários humanos' },
    { label: 'Leads capturados', total: leadsTotal.count || 0, desc: 'modal LGPD enviado' },
    { label: 'PDFs prontos', total: leadsPdfPronto.count || 0, desc: 'gerados e disponíveis' },
    { label: 'Contatos feitos', total: leadsContatado.count || 0, desc: 'equipe Vertho fez contato' },
    { label: 'Convertidos', total: leadsConvertido.count || 0, desc: 'virou conversa comercial' },
  ];

  return {
    dias,
    funil,
    top: (top as any[]) || [],
    custoTotal,
    totalAnalises,
    eventosBreakdown: Array.from(evMap.values()),
  };
}

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const dias = Number(sp.dias) || 30;
  const data = await loadFunilData(dias);

  // Conversão entre etapas
  const taxa = (atual: number, anterior: number) => {
    if (!anterior) return null;
    return (atual / anterior) * 100;
  };

  return (
    <div className="min-h-dvh"
      style={{ background: 'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)' }}>
      <div className="max-w-[1100px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-white/[0.08]">
          <Link href="/admin/dashboard" className="flex items-center gap-1.5 text-xs font-medium text-white/50 hover:text-white">
            <ArrowLeft size={14} /> Admin Dashboard
          </Link>
          <span className="text-[10px] tracking-[0.2em] text-white/30 uppercase font-mono">
            RADAR · FUNNEL
          </span>
          <Link href={`/admin/radar`} className="text-xs text-white/50 hover:text-white">
            Ingestão →
          </Link>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 size={20} style={{ color: '#34c5cc' }} />
            <h1 className="text-xl font-bold text-white">Funil — últimos {data.dias} dias</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin/radar/funnel?dias=${d}`}
                className={`px-3 py-1 rounded-full border ${data.dias === d ? 'border-cyan-400/40 text-cyan-400 bg-cyan-400/10' : 'border-white/10 text-white/45 hover:text-white'}`}>
                {d}d
              </Link>
            ))}
          </div>
        </div>

        {/* Funil */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-8"
          style={{ background: '#0b1d36' }}>
          {data.funil.map((etapa, i) => {
            const anterior = i > 0 ? data.funil[i - 1].total : null;
            const taxaConv = anterior != null && anterior > 0 ? (etapa.total / anterior) * 100 : null;
            const width = data.funil[0].total > 0 ? (etapa.total / data.funil[0].total) * 100 : 0;
            return (
              <div key={etapa.label} className="px-5 py-4 border-b border-white/[0.04] last:border-b-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{etapa.label}</p>
                    <p className="text-[11px] text-white/45">{etapa.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white font-mono">{etapa.total.toLocaleString('pt-BR')}</p>
                    {taxaConv != null && (
                      <p className="text-[10px] text-white/45 font-mono">
                        {taxaConv.toFixed(1)}% da etapa anterior
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(width, 2)}%`, background: '#34c5cc' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Custo IA */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-2xl p-4 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">Custo IA acumulado</p>
            <p className="text-2xl font-bold text-white font-mono">
              ${data.custoTotal.toFixed(2)}
            </p>
            <p className="text-[10px] text-white/45 mt-1">{data.totalAnalises} análises geradas</p>
          </div>
          <div className="rounded-2xl p-4 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">Custo médio/análise</p>
            <p className="text-2xl font-bold text-white font-mono">
              ${data.totalAnalises > 0 ? (data.custoTotal / data.totalAnalises).toFixed(4) : '0.0000'}
            </p>
            <p className="text-[10px] text-white/45 mt-1">cache hit reduz proporcionalmente</p>
          </div>
        </div>

        {/* Eventos breakdown */}
        {data.eventosBreakdown.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-8"
            style={{ background: '#0b1d36' }}>
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <p className="text-sm font-bold text-white">Eventos por tipo</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9px] text-white/40 uppercase tracking-widest">
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Humanos</th>
                  <th className="px-4 py-2 text-right">IPs únicos 24h</th>
                </tr>
              </thead>
              <tbody>
                {data.eventosBreakdown.map((e: any) => (
                  <tr key={e.tipo} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2 text-white/80 font-mono">{e.tipo}</td>
                    <td className="px-4 py-2 text-right text-white font-mono">{Number(e.total).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right text-emerald-400 font-mono">{Number(e.total_humanos).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right text-cyan-400 font-mono">{Number(e.unicos_ip_24h).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top visitados */}
        {data.top.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: '#0b1d36' }}>
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <p className="text-sm font-bold text-white">Top {data.top.length} mais visitados</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9px] text-white/40 uppercase tracking-widest">
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Humanos</th>
                </tr>
              </thead>
              <tbody>
                {data.top.map((t: any, i: number) => {
                  const link =
                    t.scope_type === 'escola' ? `/escola/${t.scope_id}` :
                    t.scope_type === 'municipio' ? `/municipio/${t.scope_id}` :
                    t.scope_type === 'estado' ? `/estado/${t.scope_id}` : '';
                  return (
                    <tr key={`${t.scope_type}-${t.scope_id}`} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2 text-white/65 font-mono uppercase text-[10px]">{t.scope_type}</td>
                      <td className="px-4 py-2">
                        {link ? (
                          <a href={`https://radar.vertho.ai${link}`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline font-mono">
                            {t.scope_id}
                          </a>
                        ) : (
                          <span className="text-white/65 font-mono">{t.scope_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-white font-mono">{Number(t.total_views).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-right text-emerald-400 font-mono">{Number(t.views_humanos).toLocaleString('pt-BR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
