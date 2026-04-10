'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Target, AlertCircle, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import { loadPDI } from './pdi-actions';

export default function PDIPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const result = await loadPDI(user.email);
      if (result.error) { setError(result.error); }
      else { setData(result); }
      setLoading(false);
    }
    init();
  }, []);

  function toggleExpand(idx) {
    setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  if (!data.pdiAtivo) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <AlertCircle size={40} className="text-gray-500 mx-auto mb-3" />
          {data.temRespostas ? (
            <>
              <p className="text-lg font-bold text-white mb-1">PDI em preparação</p>
              <p className="text-sm text-gray-400 mb-4">Você já respondeu as avaliações. Seu Plano de Desenvolvimento Individual será gerado em breve pela equipe.</p>
              <button onClick={() => router.push('/dashboard')}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition">
                Voltar ao dashboard
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-white mb-1">PDI ainda não foi gerado</p>
              <p className="text-sm text-gray-400 mb-4">Seu Plano de Desenvolvimento Individual será criado após você completar a avaliação de competências.</p>
              <button onClick={() => router.push('/dashboard/assessment')}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                Ir para Avaliação
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Parse conteudo — expected structure: array of competency objects or object with competencies key
  const conteudo = data.conteudo;
  const competencias = Array.isArray(conteudo)
    ? conteudo
    : (conteudo?.competencias || conteudo?.objetivos || []);

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Plano de Desenvolvimento</h1>
        <p className="text-sm text-gray-400 mt-1">PDI — {data.colaborador.nome_completo}</p>
      </div>

      {/* Competency cards */}
      {competencias.length > 0 ? (
        competencias.map((comp, idx) => {
          const isOpen = expanded[idx];
          const acoes = comp.acoes || comp.actions || [];
          const nivelAtual = comp.nivel_atual || comp.nivel || comp.current_level;
          const nivelMeta = comp.nivel_meta || comp.target_level || comp.meta;
          const nome = comp.competencia || comp.nome || comp.name || `Competencia ${idx + 1}`;
          const prazo = comp.prazo || comp.timeline || comp.deadline;

          return (
            <div key={idx} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              {/* Card header */}
              <button onClick={() => toggleExpand(idx)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(0, 180, 216, 0.12)' }}>
                    <Target size={18} className="text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{nome}</p>
                    {(nivelAtual || nivelMeta) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {nivelAtual && <span className="text-[10px] text-gray-500">Nivel {nivelAtual}</span>}
                        {nivelAtual && nivelMeta && <ArrowUpRight size={12} className="text-cyan-400" />}
                        {nivelMeta && <span className="text-[10px] text-cyan-400 font-bold">Meta {nivelMeta}</span>}
                      </div>
                    )}
                  </div>
                </div>
                {isOpen ? <ChevronUp size={18} className="text-gray-500 shrink-0" /> : <ChevronDown size={18} className="text-gray-500 shrink-0" />}
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-white/[0.04]">
                  {comp.objetivo && (
                    <p className="text-sm text-gray-300 mt-3 mb-3">{comp.objetivo}</p>
                  )}

                  {acoes.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Acoes</p>
                      {acoes.map((acao, i) => {
                        const texto = typeof acao === 'string' ? acao : (acao.descricao || acao.texto || acao.description || '');
                        const prazoAcao = typeof acao === 'object' ? (acao.prazo || acao.deadline) : null;
                        return (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <span className="text-cyan-400 text-xs font-bold mt-0.5">{i + 1}.</span>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-300">{texto}</p>
                              {prazoAcao && <p className="text-[10px] text-gray-500 mt-0.5">Prazo: {prazoAcao}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {prazo && (
                    <p className="text-[11px] text-gray-500 mt-3">Prazo geral: <span className="text-gray-400">{prazo}</span></p>
                  )}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="rounded-xl p-4 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <p className="text-sm text-gray-400">Conteudo do PDI ainda em processamento.</p>
        </div>
      )}
    </div>
  );
}
