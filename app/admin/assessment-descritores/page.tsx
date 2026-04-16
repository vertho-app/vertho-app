'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { loadAssessmentGrid, salvarNotaAssessment, deletarNotaAssessment } from '@/actions/assessment-descritores';

const NIVEL_COR = {
  1: 'bg-red-500/10 border-red-500/30 text-red-400',
  2: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  3: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  4: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
};

export default function AssessmentDescritoresPage() {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [competenciaSel, setCompetenciaSel] = useState('');
  const [savingCell, setSavingCell] = useState(null);
  const [log, setLog] = useState('');

  useEffect(() => {
    setEmpresaId(new URLSearchParams(window.location.search).get('empresa'));
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      const r = await loadAssessmentGrid(empresaId);
      setData(r);
      if (r?.competencias?.length && !competenciaSel) setCompetenciaSel(r.competencias[0].nome);
      setLoading(false);
    })();
  }, [empresaId]);

  async function handleCellChange(colab, descritor, novoValor) {
    const nota = novoValor === '' ? null : Number(novoValor);
    if (nota !== null && (nota < 1 || nota > 4 || Number.isNaN(nota))) {
      setLog('❌ Nota deve ser entre 1 e 4');
      return;
    }
    const key = `${colab.id}::${competenciaSel}::${descritor}`;
    setSavingCell(key);
    let r;
    if (nota === null) {
      r = await deletarNotaAssessment({ colaboradorId: colab.id, competencia: competenciaSel, descritor });
    } else {
      r = await salvarNotaAssessment({
        empresaId, colaboradorId: colab.id, competencia: competenciaSel,
        descritor, nota, cargo: colab.cargo,
      });
    }
    if (r.success) {
      const copia = { ...data.notas };
      if (nota === null) delete copia[key]; else copia[key] = nota;
      setData({ ...data, notas: copia });
      setLog(`✅ ${colab.nome_completo} / ${descritor} · ${nota ?? 'limpo'}`);
    } else {
      setLog(`❌ ${r.error}`);
    }
    setSavingCell(null);
  }

  if (!empresaId) return <Center>Passe ?empresa={'{id}'} na URL</Center>;
  if (loading) return <Center><Loader2 className="animate-spin text-cyan-400" /></Center>;
  if (!data?.success) return <Center>Erro ao carregar</Center>;

  const compAtual = data.competencias.find(c => c.nome === competenciaSel);
  const descritores = compAtual?.descritores || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-[1600px] mx-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Assessment Inicial de Descritores</h1>
            <p className="text-xs text-gray-400">Notas 1-4 por colaborador · usado pelo motor de temporadas para alocar semanas</p>
          </div>
          <select value={competenciaSel} onChange={e => setCompetenciaSel(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            {data.competencias.map(c => <option key={c.nome} value={c.nome} className="bg-[#0d1426]">{c.nome}</option>)}
          </select>
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-3 mb-4 text-[11px]">
          <LegendBadge nivel={1} label="Lacuna" />
          <LegendBadge nivel={2} label="Em desenvolvimento" />
          <LegendBadge nivel={3} label="Meta (proficiente)" />
          <LegendBadge nivel={4} label="Referência" />
          <span className="text-gray-500 ml-auto">{log}</span>
        </div>

        {/* Grid */}
        {descritores.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Nenhum descritor cadastrado para "{competenciaSel}". Importe via CSV em /admin/competencias.
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.05] sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] uppercase text-gray-500 sticky left-0 bg-[#0f1a33] min-w-[180px]">Colaborador</th>
                  {descritores.map(d => (
                    <th key={d} className="px-2 py-2 text-center text-[10px] uppercase text-gray-500 min-w-[90px] max-w-[140px]" title={d}>
                      <div className="truncate">{d}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.colabs.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 sticky left-0 bg-[#0b1328]">
                      <div className="text-white font-semibold">{c.nome_completo}</div>
                      <div className="text-[10px] text-gray-500">{c.cargo}</div>
                    </td>
                    {descritores.map(d => {
                      const key = `${c.id}::${competenciaSel}::${d}`;
                      const nota = data.notas[key];
                      const saving = savingCell === key;
                      const nivel = nota != null ? Math.floor(nota) : null;
                      const corClass = nivel != null ? NIVEL_COR[nivel] : 'bg-white/5 border-white/10 text-gray-400';
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          <input type="number" min="1" max="4" step="0.5"
                            defaultValue={nota ?? ''}
                            disabled={saving}
                            onBlur={e => {
                              const novo = e.target.value;
                              if (novo === (nota?.toString() || '')) return;
                              handleCellChange(c, d, novo);
                            }}
                            className={`w-16 py-1 px-1 rounded border text-center text-xs font-bold ${corClass} outline-none focus:border-cyan-400`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-gray-500 mt-3">
          💡 Dica: digite 1-4 (aceita decimais 1.5, 2.5, 3.5) e clique fora da célula para salvar. Deixe vazio para remover.
        </p>
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-white">{children}</div>;
}

function LegendBadge({ nivel, label }) {
  return (
    <div className={`px-2 py-0.5 rounded border ${NIVEL_COR[nivel]}`}>
      <span className="font-bold">{nivel}</span> {label}
    </div>
  );
}
