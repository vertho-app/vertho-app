'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, GraduationCap, Building2 } from 'lucide-react';
import { loadPreferenciasGlobais } from '@/actions/preferencias-aprendizagem';
import PreferenciasRanking from '@/components/preferencias-ranking';

export default function PreferenciasGlobaisPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferenciasGlobais()
      .then(r => setData(r))
      .catch(err => setData({ error: err?.message || 'Erro ao carregar' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  }

  if (data?.error) {
    return <div className="p-6 text-center text-red-400">{data.error}</div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <GraduationCap size={20} className="text-cyan-400" /> Preferências de Aprendizagem
          </h1>
          <p className="text-xs text-gray-500">
            Consolidado das respostas do mapeamento comportamental — todas as empresas
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Empresas (com dados)</p>
          <p className="text-2xl font-extrabold text-white">
            {data?.empresasComDados || 0}
            <span className="text-sm text-gray-500 font-semibold ml-1">de {data?.totalEmpresas || 0}</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Total de respondentes</p>
          <p className="text-2xl font-extrabold text-cyan-400">{data?.totalRespondentes || 0}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Preferência líder</p>
          <p className="text-base font-extrabold text-white truncate">
            {data?.rankingGlobal?.[0]?.label || '—'}
          </p>
          <p className="text-[10px] text-cyan-400 font-semibold">
            média {data?.rankingGlobal?.[0]?.media?.toFixed(2) || '—'}
          </p>
        </div>
      </div>

      {/* Ranking global */}
      <div className="rounded-xl border border-white/[0.06] p-5 mb-8" style={{ background: '#0F2A4A' }}>
        <PreferenciasRanking
          data={{ ranking: data?.rankingGlobal || [] }}
          title="Ranking global"
          subtitle="Média (escala 1-5) considerando todos os colaboradores de todas as empresas que concluíram o mapeamento."
        />
      </div>

      {/* Por empresa */}
      <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <Building2 size={14} className="text-cyan-400" /> Por empresa
      </h2>
      {!data?.porEmpresa?.length ? (
        <div className="rounded-xl border border-white/[0.06] p-8 text-center" style={{ background: '#0F2A4A' }}>
          <p className="text-sm text-gray-500">Nenhuma empresa com colaboradores que tenham preenchido as preferências ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.porEmpresa.map(emp => (
            <div key={emp.empresaId} className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">{emp.empresaNome}</h3>
                <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full">
                  {emp.respondentes} respondente(s)
                </span>
              </div>
              <PreferenciasRanking data={emp} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
