'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Loader2, TrendingDown, TrendingUp, Search, ExternalLink } from 'lucide-react';
import { loadFunnelBett, type BettFunnelData } from './actions';

const DIAS_OPTIONS = [7, 30, 90];

export default function FunnelBettPage() {
  const router = useRouter();
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<BettFunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadFunnelBett(dias).then((d) => { setData(d); setLoading(false); });
  }, [dias]);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/radar')}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart3 size={20} className="text-cyan-400" /> Funnel · radarbett.vertho.ai
            </h1>
            <p className="text-xs text-gray-500">Conversão da landing comercial Bett 2026</p>
          </div>
        </div>
        <div className="flex gap-1 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
          {DIAS_OPTIONS.map((d) => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                dias === d ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/55 hover:text-white'
              }`}>
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <ResumoCard label="Visitantes" valor={data.resumo.visitantes.toLocaleString('pt-BR')} />
            <ResumoCard label="Leads" valor={data.resumo.leads.toLocaleString('pt-BR')} acento="cyan" />
            <ResumoCard
              label="Conversão"
              valor={`${data.resumo.conversao_pct.toFixed(2)}%`}
              acento={data.resumo.conversao_pct >= 5 ? 'green' : 'amber'}
            />
          </div>

          {/* Etapas do funil */}
          <section className="mb-8">
            <h2 className="text-white text-sm font-bold mb-3">Etapas do funil</h2>
            <div className="rounded-xl border border-white/[0.06] overflow-hidden"
              style={{ background: '#0F2A4A' }}>
              {data.etapas.map((etapa, i) => {
                const max = data.etapas[0]?.valor || 1;
                const pct = max > 0 ? (etapa.valor / max) * 100 : 0;
                return (
                  <div key={etapa.chave} className={`px-4 py-3 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-[12px] text-white/85 font-bold">
                        <span className="text-white/35 font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                        {etapa.label}
                      </p>
                      <div className="flex items-center gap-3 shrink-0 text-[11px]">
                        <span className="text-white/85 font-mono font-bold tabular-nums">{etapa.valor.toLocaleString('pt-BR')}</span>
                        {etapa.taxa_conversao != null && (
                          <span className={`font-mono ${etapa.taxa_conversao >= 50 ? 'text-emerald-300' : etapa.taxa_conversao >= 25 ? 'text-amber-300' : 'text-red-300'}`}>
                            {etapa.taxa_conversao.toFixed(1)}% conv.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: etapa.chave === 'lead_submit' ? '#34D399' : '#34c5cc',
                        }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Cliques secundários */}
          <section className="mb-8">
            <h2 className="text-white text-sm font-bold mb-3">Cliques secundários</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SecundarioCard label="Persona clicada" valor={data.cliques_secundarios.persona_click} />
              <SecundarioCard label="Exemplo aberto" valor={data.cliques_secundarios.example_click} />
              <SecundarioCard label="CTA Rede pública" valor={data.cliques_secundarios.public_cta} />
              <SecundarioCard label="Sticky CTA mobile" valor={data.cliques_secundarios.sticky_click} />
              <SecundarioCard label="Agendar" valor={data.cliques_secundarios.schedule} />
              <SecundarioCard label="WhatsApp" valor={data.cliques_secundarios.whatsapp} />
            </div>
          </section>

          {/* Top buscados */}
          <section className="mb-8">
            <h2 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
              <Search size={14} /> Top buscados
            </h2>
            {data.top_buscados.length === 0 ? (
              <p className="text-[12px] text-white/45">Sem buscas no período.</p>
            ) : (
              <div className="rounded-xl border border-white/[0.06] overflow-hidden"
                style={{ background: '#0F2A4A' }}>
                {data.top_buscados.map((b, i) => (
                  <a
                    key={`${b.scope}-${b.scopeId}`}
                    href={`https://radarbett.vertho.ai/${b.scope}/${b.scopeId}`}
                    target="_blank"
                    rel="noopener"
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
                  >
                    <span className="text-[10px] font-mono text-white/35 w-5 text-right">{i + 1}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-cyan-300/70 px-1.5 py-0.5 rounded bg-cyan-400/[0.06]">
                      {b.scope === 'escola' ? 'esc' : 'mun'}
                    </span>
                    <span className="text-[12px] text-white/75 font-mono truncate flex-1">{b.scopeId}</span>
                    <span className="text-[12px] text-white/85 font-bold tabular-nums">{b.total}</span>
                    <ExternalLink size={11} className="text-white/30" />
                  </a>
                ))}
              </div>
            )}
          </section>

          <p className="text-[10px] text-white/35 leading-relaxed">
            Período: últimos {data.periodo.dias} dias. Eventos contados apenas humanos (is_bot = false).
            Conversão = lead_submit ÷ home_view.
          </p>
        </>
      )}
    </div>
  );
}

function ResumoCard({ label, valor, acento }: { label: string; valor: string; acento?: 'cyan' | 'green' | 'amber' }) {
  const cor = acento === 'cyan' ? '#34c5cc' : acento === 'green' ? '#34D399' : acento === 'amber' ? '#FCD34D' : '#fff';
  return (
    <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
      <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: cor }}>{valor}</p>
    </div>
  );
}

function SecundarioCard({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] px-3 py-2.5"
      style={{ background: 'rgba(255,255,255,0.025)' }}>
      <p className="text-[10px] tracking-[0.16em] uppercase font-mono text-white/40 mb-0.5">{label}</p>
      <p className="text-lg font-bold tabular-nums text-white">{valor.toLocaleString('pt-BR')}</p>
    </div>
  );
}
