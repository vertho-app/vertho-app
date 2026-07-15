'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart3, Eye, Play, CheckCircle2, Film, RefreshCw, MousePointerClick, Loader2 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa } from '@/actions/engajamento';

function Tile({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Icon size={14} className={color} /> {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Bool({ v }: { v: boolean }) {
  return v
    ? <span className="text-emerald-400">✓</span>
    : <span className="text-gray-600">—</span>;
}

function PctBar({ pct }: { pct: number }) {
  const cor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-9">{pct}%</span>
    </div>
  );
}

export default function EngajamentoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) { setData(null); return; }
    setLoading(true);
    try {
      const r = await getEngajamentoEmpresa(empresaId);
      setData(r);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const resumo = data?.resumo;
  const colabs = data?.colaboradores || [];

  return (
    <div>
      <AdminPageHeader
        icon={BarChart3}
        iconClassName="text-cyan-400"
        title="Engajamento da trilha"
        subtitle={empresa?.nome ? `${empresa.nome} — quem abriu, assistiu e concluiu` : 'Selecione uma empresa no filtro do topo'}
        actions={
          <button onClick={carregar} disabled={loading || !empresaId}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
          </button>
        }
      />

      {!empresaId && (
        <div className="text-sm text-gray-500 bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          Escolha uma empresa no filtro do topo para ver o engajamento.
        </div>
      )}

      {empresaId && resumo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Tile icon={Eye} color="text-gray-400" label="Inscritos" value={resumo.inscritos} />
            <Tile icon={MousePointerClick} color="text-cyan-400" label="Abriram o link" value={resumo.abriramLink} sub={`de ${resumo.inscritos}`} />
            <Tile icon={Play} color="text-violet-400" label="Deram play" value={resumo.deramPlay} sub={`de ${resumo.inscritos}`} />
            <Tile icon={Film} color="text-emerald-400" label="Terminaram o vídeo" value={resumo.terminaramVideo} sub={`de ${resumo.inscritos}`} />
            <Tile icon={BarChart3} color="text-amber-400" label="% médio assistido" value={`${resumo.pctMedioAssistido}%`} />
            <Tile icon={CheckCircle2} color="text-emerald-400" label="Marcaram concluído" value={resumo.marcaramConcluido} sub={`de ${resumo.inscritos}`} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                    <th className="px-4 py-2.5 font-medium">Colaborador</th>
                    <th className="px-3 py-2.5 font-medium text-center">Recebeu P1/P2</th>
                    <th className="px-3 py-2.5 font-medium text-center">Abriu link</th>
                    <th className="px-3 py-2.5 font-medium text-center">Play</th>
                    <th className="px-3 py-2.5 font-medium text-center">Terminou vídeo</th>
                    <th className="px-3 py-2.5 font-medium">% assistido</th>
                    <th className="px-3 py-2.5 font-medium text-center">Concluído</th>
                  </tr>
                </thead>
                <tbody>
                  {colabs.map((c: any) => (
                    <tr key={c.colaboradorId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <div className="text-white truncate max-w-[220px]">{c.nome}</div>
                        <div className="text-xs text-gray-500">{c.cargo}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        <span className={c.recebeuP1 ? 'text-emerald-400' : 'text-gray-600'}>P1</span>
                        {' / '}
                        <span className={c.recebeuP2 ? 'text-emerald-400' : 'text-gray-600'}>P2</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {c.abriuLink ? (
                          <span className="text-xs text-gray-300" title={`P1: ${c.aberturasP1} · P2: ${c.aberturasP2} · direto: ${c.aberturasDireto}`}>
                            ✓ <span className="text-gray-500">({c.aberturasP1}/{c.aberturasP2}{c.aberturasDireto ? `/${c.aberturasDireto}d` : ''})</span>
                          </span>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center"><Bool v={c.deuPlay} /></td>
                      <td className="px-3 py-2.5 text-center"><Bool v={c.terminouVideo} /></td>
                      <td className="px-3 py-2.5"><PctBar pct={c.pctAssistido} /></td>
                      <td className="px-3 py-2.5 text-center"><Bool v={c.marcouConcluido} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-3 leading-relaxed">
            <strong>Abriu link</strong> = abriu o deep-link da pílula (contagem P1/P2/direto). A atribuição por pílula (P1/P2)
            vale para envios <em>a partir de agora</em>; aberturas de pílulas já enviadas contam como “direto”.
            <strong> Play / Terminou / % assistido</strong> vêm do player de vídeo (vídeo personalizado do colaborador).
            <strong> Concluído</strong> = marcou manualmente como realizado na tela da semana.
          </p>
        </>
      )}

      {empresaId && loading && !resumo && (
        <div className="flex items-center gap-2 text-sm text-gray-500 p-6">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}
    </div>
  );
}
