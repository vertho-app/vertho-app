'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';
import { Users, BarChart3, Target, Loader2 } from 'lucide-react';

export default function RHView({ empresaId }: { empresaId?: string }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ totalColabs: 0, avaliacoesConcluidas: 0, notaMedia: 0 });
  const [competencias, setCompetencias] = useState<Array<{ nome: string; media: number; count: number }>>([]);

  useEffect(() => {
    if (!empresaId) return;

    async function fetchData() {
      setLoading(true);
      const supabase = getSupabase();

      try {
        const { count: totalColabs } = await supabase
          .from('colaboradores')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId);

        // Sessões concluídas (tabela real)
        const { data: sessoes } = await supabase
          .from('sessoes_avaliacao')
          .select('id, competencia_nome, nivel, nota_decimal')
          .eq('empresa_id', empresaId)
          .eq('status', 'concluido');

        const avaliacoesConcluidas = sessoes?.length || 0;
        const notaMedia = avaliacoesConcluidas > 0 && sessoes
          ? sessoes.reduce((sum: number, s: any) => sum + (s.nota_decimal || 0), 0) / avaliacoesConcluidas
          : 0;

        setKpis({
          totalColabs: totalColabs || 0,
          avaliacoesConcluidas,
          notaMedia: Math.round(notaMedia * 10) / 10,
        });

        // Agrupar por competência
        if (sessoes?.length) {
          const grouped: Record<string, { total: number; count: number }> = {};
          sessoes.forEach((s: any) => {
            const nome = s.competencia_nome || 'N/A';
            if (!grouped[nome]) grouped[nome] = { total: 0, count: 0 };
            grouped[nome].total += s.nota_decimal || 0;
            grouped[nome].count += 1;
          });

          setCompetencias(
            Object.entries(grouped)
              .map(([nome, v]: [string, any]) => ({ nome, media: Math.round((v.total / v.count) * 10) / 10, count: v.count }))
              .sort((a, b) => b.media - a.media)
          );
        }
      } catch (err) {
        console.error('RHView fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [empresaId]);

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-purple-400">Visão RH / Diretoria</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <Users size={18} className="text-cyan-400 mb-1" />
          <p className="text-xl font-bold text-white">{kpis.totalColabs}</p>
          <p className="text-[10px] text-gray-500">Colaboradores</p>
        </div>
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <BarChart3 size={18} className="text-green-400 mb-1" />
          <p className="text-xl font-bold text-white">{kpis.avaliacoesConcluidas}</p>
          <p className="text-[10px] text-gray-500">Avaliações</p>
        </div>
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <Target size={18} className="text-amber-400 mb-1" />
          <p className="text-xl font-bold text-white">{kpis.notaMedia}</p>
          <p className="text-[10px] text-gray-500">Nota Média</p>
        </div>
      </div>

      {competencias.length > 0 && (
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-xs font-bold text-gray-300 mb-3">Competências Avaliadas</p>
          <div className="space-y-2">
            {competencias.map((c: any) => (
              <div key={c.nome}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[11px] text-gray-300">{c.nome}</span>
                  <span className="text-[11px] font-bold text-cyan-400">{c.media}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min((c.media / 4) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
