'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';
import { Users, Loader2 } from 'lucide-react';

export default function ManagerView({ empresaId, areaDepartamento }: { empresaId?: string; areaDepartamento?: string }) {
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any[]>([]);

  useEffect(() => {
    if (!empresaId) return;

    async function fetchData() {
      setLoading(true);
      const supabase = getSupabase();

      try {
        let query = supabase
          .from('colaboradores')
          .select('id, nome_completo, email, cargo, area_depto')
          .eq('empresa_id', empresaId);

        if (areaDepartamento) {
          query = query.eq('area_depto', areaDepartamento);
        }

        const { data: colabs } = await query;
        if (!colabs?.length) { setTeam([]); setLoading(false); return; }

        // Buscar sessões para cada membro da equipe
        const { data: sessoes } = await supabase
          .from('sessoes_avaliacao')
          .select('colaborador_id, status, nivel, nota_decimal')
          .eq('empresa_id', empresaId)
          .eq('status', 'concluido');

        // Agrupar por colaborador
        const sessoesMap: Record<string, any[]> = {};
        (sessoes || []).forEach((s: any) => {
          if (!sessoesMap[s.colaborador_id]) sessoesMap[s.colaborador_id] = [];
          sessoesMap[s.colaborador_id].push(s);
        });

        const enriched = colabs.map((c: any) => {
          const mySessoes = sessoesMap[c.id] || [];
          const notaMedia = mySessoes.length > 0
            ? Math.round((mySessoes.reduce((sum: number, s: any) => sum + (s.nota_decimal || 0), 0) / mySessoes.length) * 10) / 10
            : null;
          return {
            ...c,
            avaliacoes: mySessoes.length,
            notaMedia,
            status: mySessoes.length > 0 ? 'avaliado' : 'pendente',
          };
        });

        setTeam(enriched);
      } catch (err) {
        console.error('ManagerView error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [empresaId, areaDepartamento]);

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-amber-400">Visão Gestor — Equipe</p>

      {team.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum membro na equipe.</p>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <Users size={14} className="text-cyan-400" />
            <span className="text-xs font-bold text-white">Equipe ({team.length})</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {team.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.nome_completo}</p>
                  <p className="text-[10px] text-gray-500">{m.cargo}</p>
                </div>
                <div className="text-right">
                  {m.notaMedia !== null ? (
                    <p className="text-sm font-bold text-cyan-400">{m.notaMedia}</p>
                  ) : (
                    <p className="text-[10px] text-gray-600">—</p>
                  )}
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    m.status === 'avaliado' ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-500'
                  }`}>{m.status === 'avaliado' ? `${m.avaliacoes} aval.` : 'Pendente'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
