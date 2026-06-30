'use client';
/**
 * UI compartilhada do Ranking de Adequação (gestor self-service + preview de admin).
 * VIEW pura — recebe `listar`/`carregar` (que diferem só na fonte da empresa: sessão do
 * gestor vs. rota do admin) e renderiza o ranking com as 3 travas. Não wrappa container
 * (cada página provê o seu shell). Nunca recomputa — só exibe o que a action devolve.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert, Info } from 'lucide-react';
import { GlassCard } from '@/components/page-shell';

const STATUS_COR: Record<string, { cor: string; label: string }> = {
  recomendado: { cor: '#10b981', label: 'Recomendado' },
  recomendado_com_ressalvas: { cor: '#f59e0b', label: 'Com ressalvas' },
  abaixo_do_corte: { cor: '#94a3b8', label: 'Abaixo do corte' },
};
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
const fmtData = (iso: string | null) => iso ? (() => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; })() : '—';

export default function RankingAdequacaoView({ listar, carregar }: {
  listar: () => Promise<{ cargos: string[]; erro?: string }>;
  carregar: (cargo: string) => Promise<any>;
}) {
  const [cargos, setCargos] = useState<string[]>([]);
  const [sel, setSel] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [fStatus, setFStatus] = useState<'todos' | 'recomendado' | 'recomendado_com_ressalvas'>('todos');
  const [fDriver, setFDriver] = useState<string>('qualquer');
  const [fMin, setFMin] = useState(0);
  const [sort, setSort] = useState<'eixo' | 'aderencia'>('eixo');

  useEffect(() => { listar().then((r) => { setCargos(r.cargos); if (r.erro) setErro(r.erro); }); }, [listar]);
  async function run(cargo: string) {
    setSel(cargo); setLoading(true); setData(null); setErro(''); setSort('eixo'); setFStatus('todos'); setFDriver('qualquer'); setFMin(0);
    const r = await carregar(cargo);
    if (r.success) setData(r); else setErro(r.error || 'Erro.');
    setLoading(false);
  }

  // SEP = o bloco que de fato SEPARA: quando o eixo declarado (peso) não discrimina,
  // é o discriminador empírico (divergencia.real). É por ele que ordenamos e destacamos
  // o chip — exibir o bloco morto como se decidisse foi o pecado do v1.0. (Decisão #2 +).
  const sep: string = data?.divergencia?.real || data?.eixo?.label || '';
  const eixoMorto = data?.divergencia ? data.eixo.label : null; // declarado mas não separa

  const visiveis = useMemo(() => {
    if (!data) return [];
    let arr = [...data.elegiveis];
    if (fStatus !== 'todos') arr = arr.filter((e) => e.status === fStatus);
    if (fDriver === 'sem-gap') arr = arr.filter((e) => e.drivers.length === 0);
    else if (fDriver !== 'qualquer') arr = arr.filter((e) => e.drivers.includes(fDriver));
    arr = arr.filter((e) => e.aderencia >= fMin);
    arr.sort((a, b) => sort === 'eixo' ? ((b.blocos[sep] ?? -1) - (a.blocos[sep] ?? -1)) : b.aderencia - a.aderencia);
    return arr;
  }, [data, fStatus, fDriver, fMin, sort, sep]);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Ranking de Adequação ao Cargo</h1>
        <p className="text-xs text-slate-400 mt-1">Como os candidatos de um cargo se posicionam frente ao perfil ideal. Filtre e ordene para visualizar.</p>
      </div>

      {erro && !data && <GlassCard><p className="text-sm text-amber-400 p-1">{erro}</p></GlassCard>}

      <div className="flex flex-wrap gap-2 mb-4">
        {cargos.map((c) => <button key={c} onClick={() => run(c)} className={`text-xs px-3 py-1.5 rounded-lg border ${sel === c ? 'bg-brand-500/20 border-brand-400 text-brand-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>{c}</button>)}
        {cargos.length === 0 && !erro && <p className="text-xs text-slate-500">Nenhum cargo com ranking gerado ainda.</p>}
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-400" /></div>}

      {data?.success && (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex gap-2 items-start p-1">
              <Info size={15} className="text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-300"><b>Apoio à decisão.</b> Filtrar e ordenar reorganiza a visualização — não seleciona nem elimina candidatos. A escolha final cabe ao gestor ou psicólogo responsável.</p>
            </div>
          </GlassCard>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span>Ranking de <b className="text-slate-300">{fmtData(data.dataISO)}</b> (foto da geração).</span>
            <span>Eixo do cargo: <b className="text-slate-300">{data.eixo.label}</b>{data.eixo.peso != null && ` (peso ${data.eixo.peso}%)`}.</span>
            <span>🟢 Recomendado · 🟡 Com ressalvas</span>
          </div>
          {data.divergencia && (
            <div className="rounded-lg p-2.5 border border-amber-400/30 bg-amber-400/5 text-[11px] text-amber-200/90 flex gap-2">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>Neste grupo, <b>{data.divergencia.eixo}</b> (o bloco de maior peso do cargo) quase não diferencia os candidatos (dispersão {data.divergencia.sdEixo}). Quem separa de fato aqui é <b>{data.divergencia.real}</b> — então ordenamos e destacamos por ela, e {data.divergencia.eixo} aparece ao lado como contexto.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1 text-slate-400">Status
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value as any)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-200">
                <option value="todos">Todos</option><option value="recomendado">Só recomendados</option><option value="recomendado_com_ressalvas">Só com ressalvas</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-slate-400">Driver com gap
              <select value={fDriver} onChange={(e) => setFDriver(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-200">
                <option value="qualquer">Qualquer</option><option value="sem-gap">Sem gap</option>
                {data.driversDisponiveis.map((d: string) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-slate-400">Aderência mín. {fMin}%
              <input type="range" min={0} max={100} value={fMin} onChange={(e) => setFMin(Number(e.target.value))} className="accent-brand-400" />
            </label>
            <div className="flex items-center gap-1 text-slate-400">Ordenar por
              <button onClick={() => setSort('eixo')} className={`px-2 py-1 rounded border ${sort === 'eixo' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>{sep} {data.divergencia ? '(separa)' : '(eixo)'}</button>
              <button onClick={() => setSort('aderencia')} className={`px-2 py-1 rounded border ${sort === 'aderencia' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>Aderência</button>
            </div>
            <span className="text-slate-500 ml-auto">{visiveis.length} de {data.totais.elegiveis} elegíveis</span>
          </div>

          <div className="space-y-1.5">
            {visiveis.map((e, i) => {
              const st = STATUS_COR[e.status] || STATUS_COR.abaixo_do_corte;
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="w-6 text-center text-xs font-mono text-slate-500">{i + 1}</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: st.cor + '22', color: st.cor }}>{iniciais(e.nome)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{e.nome}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: st.cor + '22', color: st.cor }}>{st.label}</span>
                      {e.borderline && <span className="text-[9px] text-amber-400" title="Sensível à margem de medida (±SEM)">limítrofe ±{e.semDelta}</span>}
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-300">{sep}: {e.blocos[sep] != null ? Math.round(e.blocos[sep]) + '%' : 'n/a'}</span>
                      {eixoMorto && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500" title="Bloco de maior peso do cargo, mas não diferencia este grupo">{eixoMorto}: {e.blocos[eixoMorto] != null ? Math.round(e.blocos[eixoMorto]) + '%' : 'n/a'}</span>}
                    </div>
                    {e.drivers.length > 0 && <div className="text-[10px] text-slate-500 mt-0.5 truncate">A desenvolver: {e.drivers.join(', ')}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: st.cor }}>{Math.round(e.aderencia)}%</div>
                    <div className="text-[8px] text-slate-500">aderência</div>
                  </div>
                </div>
              );
            })}
            {visiveis.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">Nenhum candidato com os filtros atuais.</p>}
          </div>

          {data.anexoGate.length > 0 && (
            <GlassCard>
              <div className="p-1">
                <div className="text-xs font-bold text-slate-300 mb-1">Não elegíveis por requisito eliminatório ({data.anexoGate.length})</div>
                <p className="text-[10px] text-slate-500 mb-2">Bloqueados por um critério inegociável do cargo. Aderência não se aplica — o requisito não atendido é o que decide.</p>
                <ul className="space-y-1">
                  {data.anexoGate.map((p: any) => (
                    <li key={p.id} className="text-[11px] text-slate-300 flex items-baseline gap-2">
                      <span className="font-medium text-white">{p.nome}</span>
                      <span className="text-red-400/90">{p.gates.join(' · ')}</span>
                      {p.origem && <span className="text-slate-600">({p.origem})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </>
  );
}
