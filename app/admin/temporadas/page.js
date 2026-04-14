'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, ChevronDown, BookOpen, Target, Sparkles, Video, FileText, Headphones, FileType, Pause, Play, Archive, RefreshCw, Eye, X } from 'lucide-react';
import { listarTemporadasEmpresa, pausarRetomarTemporada, arquivarTemporada, regerarSemana, loadProgressoDetalhado } from '@/actions/temporadas';

const STATUS_COLORS = {
  ativa: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pausada: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  arquivada: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  concluida: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

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
  const [statusFiltro, setStatusFiltro] = useState('ativa');
  const [busy, setBusy] = useState(false);
  const [detalhe, setDetalhe] = useState(null);

  async function handleVerDetalhe(trilhaId) {
    setBusy(true);
    const r = await loadProgressoDetalhado(trilhaId);
    setBusy(false);
    if (r.success) setDetalhe(r);
  }

  async function recarregar() {
    setLoading(true);
    const r = await listarTemporadasEmpresa(empresaId);
    setItems(r.items || []);
    setLoading(false);
  }

  async function handlePausar(trilhaId) {
    setBusy(true);
    await pausarRetomarTemporada(trilhaId);
    await recarregar();
    setBusy(false);
  }

  async function handleArquivar(trilhaId, nome) {
    if (!confirm(`Arquivar temporada de ${nome}? Ela será ocultada mas não deletada.`)) return;
    setBusy(true);
    await arquivarTemporada(trilhaId);
    await recarregar();
    setBusy(false);
  }

  async function handleRegerar(trilhaId, semana) {
    if (!confirm(`Regerar semana ${semana}? Isso apagará o progresso dessa semana.`)) return;
    setBusy(true);
    const r = await regerarSemana(trilhaId, semana);
    if (!r.success) alert(r.error);
    await recarregar();
    setBusy(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmpresaId(params.get('empresa'));
  }, []);

  useEffect(() => { recarregar(); }, [empresaId]);

  const itemsFiltrados = statusFiltro === 'todas'
    ? items
    : items.filter(t => (t.status || 'ativa') === statusFiltro);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Temporadas Geradas</h1>
            <p className="text-xs text-gray-400">{empresaId ? 'Empresa específica' : 'Todas as empresas'} · {itemsFiltrados.length}/{items.length}</p>
          </div>
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="ativa" className="bg-[#0d1426]">Ativas</option>
            <option value="pausada" className="bg-[#0d1426]">Pausadas</option>
            <option value="concluida" className="bg-[#0d1426]">Concluídas</option>
            <option value="arquivada" className="bg-[#0d1426]">Arquivadas</option>
            <option value="todas" className="bg-[#0d1426]">Todas</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Carregando...</div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Nenhuma temporada {statusFiltro !== 'todas' ? `com status "${statusFiltro}"` : 'gerada'}.
          </div>
        ) : (
          <div className="space-y-3">
            {itemsFiltrados.map(t => (
              <TemporadaCard key={t.id} t={t}
                expanded={expanded === t.id}
                onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                onPausar={() => handlePausar(t.id)}
                onArquivar={() => handleArquivar(t.id, t.colab?.nome_completo)}
                onRegerar={(semana) => handleRegerar(t.id, semana)}
                onVerDetalhe={() => handleVerDetalhe(t.id)}
                busy={busy} />
            ))}
          </div>
        )}
      </div>

      {detalhe && <DetalheModal detalhe={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

function TemporadaCard({ t, expanded, onToggle, onPausar, onArquivar, onRegerar, onVerDetalhe, busy }) {
  const colab = t.colab || {};
  const semanas = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
  const descritores = Array.isArray(t.descritores_selecionados) ? t.descritores_selecionados : [];
  const statusKey = t.status || 'ativa';
  const statusCls = STATUS_COLORS[statusKey] || STATUS_COLORS.ativa;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 pr-3 hover:bg-white/[0.02]">
        <button onClick={onToggle} className="flex-1 px-4 py-3 flex items-center gap-3 text-left">
          {expanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
          <div className="flex-1">
            <div className="text-sm font-bold text-white">{colab.nome_completo || '—'}</div>
            <div className="text-[11px] text-gray-400">{colab.cargo || '—'} · Temporada {t.numero_temporada} · Foco: <span className="text-cyan-400">{t.competencia_foco}</span></div>
          </div>
          <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${statusCls}`}>{statusKey}</span>
        </button>
        <button onClick={onVerDetalhe} disabled={busy} title="Ver progresso detalhado"
          className="p-1.5 rounded hover:bg-white/10 text-cyan-400 disabled:opacity-50">
          <Eye size={14} />
        </button>
        {statusKey !== 'arquivada' && (
          <>
            <button onClick={onPausar} disabled={busy} title={statusKey === 'pausada' ? 'Retomar' : 'Pausar'}
              className="p-1.5 rounded hover:bg-white/10 text-amber-400 disabled:opacity-50">
              {statusKey === 'pausada' ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button onClick={onArquivar} disabled={busy} title="Arquivar"
              className="p-1.5 rounded hover:bg-white/10 text-gray-400 disabled:opacity-50">
              <Archive size={14} />
            </button>
          </>
        )}
      </div>

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
                    <div className="flex items-center justify-between">
                      {s.conteudo?.formato_core && (
                        <div className="text-[9px] text-gray-500 mt-0.5">
                          {s.conteudo.formato_core}{s.conteudo.fallback_gerado ? ' (fallback)' : ''}
                        </div>
                      )}
                      {s.tipo !== 'avaliacao' && (
                        <button onClick={(e) => { e.stopPropagation(); onRegerar(s.semana); }} disabled={busy}
                          title={`Regerar semana ${s.semana}`}
                          className="p-0.5 rounded hover:bg-white/10 text-purple-400 disabled:opacity-50 ml-auto">
                          <RefreshCw size={10} />
                        </button>
                      )}
                    </div>
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

function DetalheModal({ detalhe, onClose }) {
  const { trilha, colab, progresso } = detalhe;
  const semanasPlano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-cyan-500/30 max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">{colab?.nome_completo || '—'}</h2>
            <p className="text-xs text-gray-400">{colab?.cargo} · {trilha.competencia_foco}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-3">
          {semanasPlano.map(s => {
            const prog = progresso.find(p => p.semana === s.semana);
            return <SemanaDetalhe key={s.semana} semana={s} progresso={prog} />;
          })}
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' };
const STATUS_COR = { pendente: 'gray', em_andamento: 'amber', concluido: 'emerald' };

function SemanaDetalhe({ semana, progresso }) {
  const [open, setOpen] = useState(false);
  const p = progresso || {};
  const statusKey = p.status || 'pendente';
  const cor = STATUS_COR[statusKey];

  const temConteudo = semana.tipo === 'conteudo';
  const temAplicacao = semana.tipo === 'aplicacao';
  const temAvaliacao = semana.tipo === 'avaliacao';

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/[0.03]">
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        <span className="text-[10px] text-gray-500 w-12">Sem {semana.semana}</span>
        <span className="text-[10px] uppercase text-gray-400 w-20">{semana.tipo}</span>
        <span className="flex-1 text-xs text-white text-left truncate">{semana.descritor || (temAvaliacao ? 'Avaliação final' : '—')}</span>
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-${cor}-500/20 text-${cor}-400`}>{STATUS_LABEL[statusKey]}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3 text-xs">
          {temConteudo && semana.conteudo && (
            <Block titulo="🎯 Desafio" content={semana.conteudo.desafio_texto} />
          )}
          {temAplicacao && semana.cenario && (
            <Block titulo="🎭 Cenário" markdown={semana.cenario.texto} />
          )}
          {temAvaliacao && p.reflexao?.cenario && (
            <Block titulo="🎭 Cenário (sem 14)" markdown={p.reflexao.cenario} />
          )}

          {p.reflexao && (
            <>
              {p.reflexao.desafio_realizado && (
                <div className="flex gap-2 text-[11px]">
                  <span className="text-gray-500">Desafio:</span>
                  <span className="text-white font-bold">{p.reflexao.desafio_realizado}</span>
                  {p.reflexao.qualidade_reflexao && <span className="text-gray-500">· qualidade: <span className="text-cyan-400">{p.reflexao.qualidade_reflexao}</span></span>}
                </div>
              )}
              {p.reflexao.insight_principal && <Block titulo="💡 Insight" content={p.reflexao.insight_principal} />}
              {p.reflexao.compromisso_proxima && <Block titulo="📝 Compromisso" content={p.reflexao.compromisso_proxima} />}
              {p.reflexao.transcript_completo?.length > 0 && <Transcript title="Conversa de reflexão" items={p.reflexao.transcript_completo} />}
            </>
          )}

          {p.feedback && (
            <>
              {p.feedback.cenario_resposta && <Block titulo="✏️ Resposta ao cenário" content={p.feedback.cenario_resposta} />}
              {Array.isArray(p.feedback.avaliacao_por_descritor) && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 mb-1">Avaliação por descritor</div>
                  <div className="space-y-1">
                    {p.feedback.avaliacao_por_descritor.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-white/5">
                        <span className="text-white font-bold flex-1">{a.descritor}</span>
                        <span className="text-cyan-400">{a.nota || a.nota_pos}</span>
                        <span className="text-gray-400 flex-[2]">{a.observacao || a.justificativa}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {p.feedback.sintese_bloco && <Block titulo="📊 Síntese do bloco" content={p.feedback.sintese_bloco} />}
              {p.feedback.transcript_completo?.length > 0 && <Transcript title="Conversa de feedback" items={p.feedback.transcript_completo} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ titulo, content, markdown }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 mb-1">{titulo}</div>
      <div className="text-[11px] text-gray-300 italic whitespace-pre-wrap p-2 rounded bg-white/5">
        {markdown || content || '—'}
      </div>
    </div>
  );
}

function Transcript({ title, items }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-[10px] uppercase text-gray-500 hover:text-cyan-400 flex items-center gap-1">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title} ({items.length} mensagens)
      </button>
      {open && (
        <div className="mt-2 space-y-2 max-h-96 overflow-auto">
          {items.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-[11px] ${
                m.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
