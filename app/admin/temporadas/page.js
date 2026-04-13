'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, ChevronDown, BookOpen, Target, Sparkles, Video, FileText, Headphones, FileType } from 'lucide-react';
import { listarTemporadasEmpresa } from '@/actions/temporadas';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen, pdf: FileType };
const FORMAT_COLOR = { video: '#06B6D4', audio: '#A78BFA', texto: '#10B981', case: '#F59E0B', pdf: '#94A3B8' };

const TIPO_COLOR = { conteudo: '#3B82F6', aplicacao: '#F59E0B', avaliacao: '#A78BFA' };
const TIPO_LABEL = { conteudo: 'Conteúdo', aplicacao: 'Aplicação', avaliacao: 'Avaliação' };

export default function TemporadasAdminPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmpresaId(params.get('empresa'));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await listarTemporadasEmpresa(empresaId);
      setItems(r.items || []);
      setLoading(false);
    })();
  }, [empresaId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Temporadas Geradas</h1>
            <p className="text-xs text-gray-400">{empresaId ? 'Empresa específica' : 'Todas as empresas'} · {items.length} {items.length === 1 ? 'temporada' : 'temporadas'}</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Nenhuma temporada gerada. Volte à página da empresa e clique em "Gerar Temporadas".
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(t => (
              <TemporadaCard key={t.id} t={t} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemporadaCard({ t, expanded, onToggle }) {
  const colab = t.colab || {};
  const semanas = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
  const descritores = Array.isArray(t.descritores_selecionados) ? t.descritores_selecionados : [];

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
        {expanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-white">{colab.nome_completo || '—'}</div>
          <div className="text-[11px] text-gray-400">{colab.cargo || '—'} · Temporada {t.numero_temporada} · Foco: <span className="text-cyan-400">{t.competencia_foco}</span></div>
        </div>
        <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-400">{t.status}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-4">
          {/* Descritores */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 mb-2">Descritores selecionados</div>
            <div className="flex flex-wrap gap-2">
              {descritores.map((d, i) => (
                <div key={i} className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-white font-semibold">{d.descritor}</span>
                  <span className="text-gray-400 ml-2">nota {d.nota_atual} · gap {d.gap?.toFixed(1)} · {d.semanas_alocadas} sem</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline 14 semanas */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 mb-2">Plano de 14 semanas</div>
            <div className="grid grid-cols-7 gap-2">
              {semanas.map(s => {
                const Icon = s.tipo === 'aplicacao' ? Target : s.tipo === 'avaliacao' ? Sparkles : (FORMAT_ICON[s.conteudo?.formato_core] || BookOpen);
                const cor = TIPO_COLOR[s.tipo];
                return (
                  <div key={s.semana} className="rounded-lg bg-white/5 border border-white/10 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">Sem {s.semana}</span>
                      <Icon size={12} style={{ color: cor }} />
                    </div>
                    <div className="text-[10px] text-white font-semibold truncate" title={s.descritor || TIPO_LABEL[s.tipo]}>
                      {s.descritor || TIPO_LABEL[s.tipo]}
                    </div>
                    {s.conteudo?.formato_core && (
                      <div className="text-[9px] text-gray-500 mt-0.5">
                        {s.conteudo.formato_core}{s.conteudo.fallback_gerado ? ' (fallback)' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sample do desafio da semana 1 */}
          {semanas[0]?.conteudo?.desafio_texto && (
            <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-3">
              <div className="text-[10px] uppercase text-cyan-400 mb-1">Desafio semana 1</div>
              <div className="text-xs text-gray-300 italic">"{semanas[0].conteudo.desafio_texto}"</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
