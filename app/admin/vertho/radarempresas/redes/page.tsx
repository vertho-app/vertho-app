'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Network, ChevronDown } from 'lucide-react';
import { loadRedes, listarUnidadesRede, type RadarRede } from '@/actions/radarempresas/busca';
import { RADAR_DISCLAIMER } from '@/lib/radarempresas/segmentos';

export default function RadarRedesPage() {
  const router = useRouter();
  const [redes, setRedes] = useState<RadarRede[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<any[]>([]);

  useEffect(() => { loadRedes().then(r => { setRedes(r); setLoading(false); }); }, []);

  async function toggle(marca: string) {
    if (aberta === marca) { setAberta(null); return; }
    setAberta(marca); setUnidades([]);
    setUnidades(await listarUnidadesRede(marca));
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/vertho/radarempresas')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Network size={20} className="text-cyan-400" /> Redes & Franquias
          </h1>
          <p className="text-xs text-gray-500">1 lead = a rede (negociação na sede: franqueadora ou matriz, não na unidade)</p>
        </div>
      </div>

      <div className="mb-4 p-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05]">
        <p className="text-[11px] text-amber-300 leading-relaxed">
          <span className="font-bold">Franquia</span>: mesma fantasia em 3+ donos distintos.
          {' '}<span className="font-bold">Grupo</span>: mesma empresa (CNPJ-base) com 3+ filiais.
          {' '}Nos dois, a sede (franqueadora/matriz) normalmente está
          {' '}<span className="font-bold">fora do recorte</span> — o decisor não é a unidade
          {' '}local. Validar antes de abordar.
        </p>
      </div>

      {redes.length === 0 ? (
        <div className="text-center py-16">
          <Network size={28} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma rede detectada ainda. Rode o script de detecção.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {redes.map(r => (
            <div key={r.marca_norm} className="rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <button onClick={() => toggle(r.marca_norm)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02]">
                <div>
                  <p className="text-sm font-bold text-white">
                    <span className={`mr-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase align-middle ${
                      r.tipo === 'grupo' ? 'bg-violet-400/15 text-violet-300' : 'bg-cyan-400/15 text-cyan-300'}`}>
                      {r.tipo === 'grupo' ? 'Grupo' : 'Franquia'}
                    </span>
                    {r.nome_exibicao}
                    <span className="ml-2 text-[9px] font-normal text-gray-500 uppercase">{r.confianca_rede} confiança</span>
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {r.tipo === 'grupo'
                      ? `${r.n_unidades.toLocaleString('pt-BR')} filiais · mesma empresa`
                      : `${r.n_unidades.toLocaleString('pt-BR')} unidades · ${r.n_donos.toLocaleString('pt-BR')} donos`} · {r.segmento_nome || 'sem segmento'} ·
                    {' '}{(r.municipios || []).slice(0, 3).join(', ')}{(r.municipios || []).length > 3 ? '…' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-cyan-300">{r.score_medio == null ? '—' : Math.round(r.score_medio)}</span>
                  <span className="text-[10px] text-gray-400">{r.classificacao}</span>
                  <ChevronDown size={14} className={`text-gray-500 transition-transform ${aberta === r.marca_norm ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {aberta === r.marca_norm && (
                <div className="px-4 pb-3 border-t border-white/[0.04]">
                  {unidades.length === 0 ? (
                    <p className="text-[10px] text-gray-600 py-3">Carregando unidades...</p>
                  ) : (
                    <table className="w-full text-[11px] mt-2">
                      <tbody>
                        {unidades.map(u => (
                          <tr key={u.cnpj_completo} className="border-t border-white/[0.03]">
                            <td className="py-1.5 text-white">{u.nome_fantasia || '—'}</td>
                            <td className="py-1.5 text-gray-500">{u.municipio_nome}/{u.uf}</td>
                            <td className="py-1.5 text-gray-500">{u.cnpj_completo}</td>
                            <td className="py-1.5 text-right text-cyan-300 font-semibold">{u.score_total == null ? '—' : Math.round(u.score_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-gray-600 mt-6 leading-relaxed border-t border-white/[0.04] pt-3">{RADAR_DISCLAIMER}</p>
    </div>
  );
}
