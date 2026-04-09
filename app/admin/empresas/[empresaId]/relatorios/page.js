'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, FileText, User, Users, Building2, ChevronDown,
  Target, AlertTriangle, CheckCircle, TrendingUp, Download
} from 'lucide-react';
import { loadRelatoriosEmpresa } from '@/actions/relatorios-load';

const NIVEL_COLORS = { 1: 'text-red-400', 2: 'text-amber-400', 3: 'text-cyan-400', 4: 'text-green-400' };

export default function RelatoriosPage({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [data, setData] = useState({ individuais: [], gestor: null, rh: null });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('individual');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    loadRelatoriosEmpresa(empresaId).then(d => { setData(d); setLoading(false); });
  }, [empresaId]);

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const TABS = [
    { key: 'individual', label: `Individuais (${data.individuais.length})`, icon: User },
    { key: 'gestor', label: 'Gestor', icon: Users, has: !!data.gestor },
    { key: 'rh', label: 'RH', icon: Building2, has: !!data.rh },
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-cyan-400" /> Relatórios
          </h1>
          <p className="text-xs text-gray-500">Individual, Gestor e RH</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={14} className={tab === t.key ? 'text-cyan-400' : ''} />
            {t.label}
            {t.has === false && <span className="text-[8px] text-gray-600">—</span>}
          </button>
        ))}
      </div>

      {/* ═══ INDIVIDUAL ═══ */}
      {tab === 'individual' && (
        <div>
          {data.individuais.length === 0 ? (
            <Empty text="Nenhum relatório individual. Rode 'Individuais' no pipeline." />
          ) : data.individuais.map(rel => {
            const c = rel.conteudo;
            const isOpen = openId === rel.id;
            return (
              <div key={rel.id} className="mb-3 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <button onClick={() => setOpenId(isOpen ? null : rel.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-cyan-400" />
                    <span className="text-sm font-bold text-white">{rel.colaborador_nome}</span>
                    <span className="text-[10px] text-gray-500">{rel.colaborador_cargo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/api/relatorios/pdf?id=${rel.id}`} target="_blank"
                      onClick={e => e.stopPropagation()}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                      <Download size={10} /> PDF
                    </a>
                    <span className="text-[9px] text-gray-600">{new Date(rel.gerado_em).toLocaleDateString('pt-BR')}</span>
                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isOpen && c && (
                  <div className="px-4 pb-4 border-t border-white/[0.04] space-y-4">
                    {/* Acolhimento */}
                    {c.acolhimento && <p className="text-xs text-gray-300 leading-relaxed mt-3 italic">{c.acolhimento}</p>}

                    {/* Resumo */}
                    {c.resumo_geral && (
                      <div>
                        <SectionTitle>Resumo Geral</SectionTitle>
                        <p className="text-xs text-gray-300 leading-relaxed">{c.resumo_geral}</p>
                      </div>
                    )}

                    {/* Perfil */}
                    {c.perfil_comportamental && (
                      <div>
                        <SectionTitle color="purple">Perfil Comportamental</SectionTitle>
                        <p className="text-xs text-gray-300 leading-relaxed mb-2">{c.perfil_comportamental.descricao || c.perfil_disc?.descricao}</p>
                        {(c.perfil_comportamental.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
                          <p key={i} className="text-[10px] text-green-400">+ {p}</p>
                        ))}
                        {(c.perfil_comportamental.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
                          <p key={i} className="text-[10px] text-amber-400">⚠ {p}</p>
                        ))}
                      </div>
                    )}

                    {/* Competências */}
                    {c.competencias?.length > 0 && (
                      <div>
                        <SectionTitle color="cyan">Competências</SectionTitle>
                        <div className="space-y-2">
                          {c.competencias.map((comp, i) => (
                            <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-white">{comp.nome}</span>
                                <span className={`text-sm font-bold ${NIVEL_COLORS[comp.nivel || comp.nivel_atual] || 'text-gray-400'}`}>
                                  N{comp.nivel || comp.nivel_atual || '?'}
                                </span>
                                {comp.nota_decimal && <span className="text-[10px] text-gray-500">({Number(comp.nota_decimal).toFixed(2)})</span>}
                                {comp.evolucao && <span className={`text-[9px] ${comp.evolucao === 'subiu' ? 'text-green-400' : comp.evolucao === 'desceu' ? 'text-red-400' : 'text-gray-500'}`}>{comp.evolucao}</span>}
                              </div>
                              {comp.analise && <p className="text-[10px] text-gray-400 mb-1">{comp.analise}</p>}
                              {comp.evidencias_destaque?.map((e, j) => <p key={j} className="text-[10px] text-gray-500">• {e}</p>)}
                              {comp.lacuna_principal && <p className="text-[10px] text-amber-400 mt-1">Gap: {comp.lacuna_principal}</p>}
                              {comp.acao_pratica && <p className="text-[10px] text-cyan-400 mt-1">→ {comp.acao_pratica}</p>}
                              {comp.script_pratico && <p className="text-[10px] text-cyan-400">→ {comp.script_pratico}</p>}
                              {comp.recomendacao && <p className="text-[10px] text-gray-400 mt-1">{comp.recomendacao}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Próximos passos */}
                    {c.proximos_passos && (
                      <div>
                        <SectionTitle color="green">Próximos Passos</SectionTitle>
                        {(Array.isArray(c.proximos_passos) ? c.proximos_passos : Object.values(c.proximos_passos)).map((p, i) => (
                          <div key={i} className="p-2 rounded-lg mb-1" style={{ background: '#091D35' }}>
                            <p className="text-[10px] text-white font-bold">{p.competencia}</p>
                            <p className="text-[10px] text-gray-300">{p.meta_primeira_pessoa}</p>
                            {p.prazo && <span className="text-[9px] text-gray-500">{p.prazo}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mensagem final */}
                    {c.mensagem_final && <p className="text-xs text-gray-400 italic pt-2 border-t border-white/[0.04]">{c.mensagem_final}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ GESTOR ═══ */}
      {tab === 'gestor' && (
        <div>
          {!data.gestor ? (
            <Empty text="Relatório gestor não gerado. Rode 'Gestor' no pipeline." />
          ) : (() => {
            const c = data.gestor.conteudo;
            const gestorPdfLink = `/api/relatorios/pdf?id=${data.gestor.id}`;
            return (
              <div className="space-y-4">
                <div className="flex justify-end mb-3">
                  <a href={gestorPdfLink} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
                    <Download size={11} /> Download PDF
                  </a>
                </div>

                {c.resumo_executivo && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle>Resumo Executivo</SectionTitle>
                    <p className="text-xs text-gray-300 leading-relaxed">{c.resumo_executivo}</p>
                  </div>
                )}

                {c.destaques_evolucao?.length > 0 && (
                  <div className="p-4 rounded-xl border border-green-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="green">Destaques de Evolução</SectionTitle>
                    {c.destaques_evolucao.map((d, i) => <p key={i} className="text-[10px] text-green-400">🌟 {d}</p>)}
                  </div>
                )}

                {c.ranking_atencao?.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="amber">Ranking de Atenção</SectionTitle>
                    {c.ranking_atencao.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-[10px]">
                        <span className={`font-bold px-1.5 py-0.5 rounded ${r.urgencia === 'URGENTE' ? 'bg-red-400/15 text-red-400' : r.urgencia === 'IMPORTANTE' ? 'bg-amber-400/15 text-amber-400' : 'bg-gray-400/15 text-gray-400'}`}>{r.urgencia}</span>
                        <span className="text-white font-medium">{r.nome}</span>
                        <span className="text-gray-500">{r.competencia} — N{r.nivel || r.nivel_fase3}</span>
                        <span className="text-gray-600 truncate">{r.motivo || r.motivo_curto}</span>
                      </div>
                    ))}
                  </div>
                )}

                {c.analise_por_competencia?.length > 0 && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="cyan">Análise por Competência</SectionTitle>
                    {c.analise_por_competencia.map((a, i) => (
                      <div key={i} className="mb-3 p-3 rounded-lg" style={{ background: '#091D35' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{a.competencia}</span>
                          <span className="text-[10px] text-gray-500">Média: {a.media_nivel || a.media}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{a.padrao_observado}</p>
                        {a.acao_gestor && <p className="text-[10px] text-cyan-400 mt-1">→ {a.acao_gestor}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {c.acoes && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="green">Ações</SectionTitle>
                    {['esta_semana', 'proximas_semanas', 'medio_prazo'].map(k => {
                      const a = c.acoes[k];
                      if (!a) return null;
                      const labels = { esta_semana: 'Esta semana', proximas_semanas: 'Próximas semanas', medio_prazo: 'Médio prazo' };
                      return (
                        <div key={k} className="mb-2 p-2 rounded-lg" style={{ background: '#091D35' }}>
                          <p className="text-[9px] text-gray-500 font-bold uppercase">{labels[k]}</p>
                          <p className="text-xs text-white font-bold">{a.titulo}</p>
                          <p className="text-[10px] text-gray-400">{a.descricao}</p>
                          {a.impacto && <p className="text-[10px] text-green-400 mt-0.5">{a.impacto}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {c.mensagem_final && <p className="text-xs text-gray-400 italic">{c.mensagem_final}</p>}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ RH ═══ */}
      {tab === 'rh' && (
        <div>
          {!data.rh ? (
            <Empty text="Relatório RH não gerado. Rode 'RH' no pipeline." />
          ) : (() => {
            const c = data.rh.conteudo;
            const rhPdfLink = `/api/relatorios/pdf?id=${data.rh.id}`;
            return (
              <div className="space-y-4">
                <div className="flex justify-end mb-3">
                  <a href={rhPdfLink} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
                    <Download size={11} /> Download PDF
                  </a>
                </div>

                {c.resumo_executivo && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle>Resumo Executivo</SectionTitle>
                    <p className="text-xs text-gray-300 leading-relaxed">{c.resumo_executivo}</p>
                  </div>
                )}

                {c.indicadores && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Avaliados', value: c.indicadores.total_avaliados, color: 'text-white' },
                      { label: 'Média', value: c.indicadores.media_geral, color: 'text-cyan-400' },
                      { label: 'N1-N2', value: `${(c.indicadores.pct_nivel_1 || 0) + (c.indicadores.pct_nivel_2 || 0)}%`, color: 'text-amber-400' },
                      { label: 'N3-N4', value: `${(c.indicadores.pct_nivel_3 || 0) + (c.indicadores.pct_nivel_4 || 0)}%`, color: 'text-green-400' },
                    ].map((ind, i) => (
                      <div key={i} className="text-center p-3 rounded-lg" style={{ background: '#0F2A4A' }}>
                        <div className={`text-xl font-bold ${ind.color}`}>{ind.value}</div>
                        <div className="text-[9px] text-gray-500">{ind.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {c.competencias_criticas?.length > 0 && (
                  <div className="p-4 rounded-xl border border-red-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="red">Competências Críticas</SectionTitle>
                    {c.competencias_criticas.map((comp, i) => (
                      <div key={i} className="mb-2 flex items-start gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          comp.criticidade === 'CRITICA' ? 'bg-red-400/15 text-red-400' : comp.criticidade === 'ATENCAO' ? 'bg-amber-400/15 text-amber-400' : 'bg-green-400/15 text-green-400'
                        }`}>{comp.criticidade}</span>
                        <div>
                          <p className="text-xs text-white font-bold">{comp.competencia}</p>
                          <p className="text-[10px] text-gray-400">{comp.motivo}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {c.treinamentos_sugeridos?.length > 0 && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="cyan">Treinamentos Sugeridos</SectionTitle>
                    {c.treinamentos_sugeridos.map((t, i) => (
                      <div key={i} className="mb-2 p-3 rounded-lg" style={{ background: '#091D35' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{t.titulo}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            t.prioridade === 'URGENTE' ? 'bg-red-400/15 text-red-400' : t.prioridade === 'IMPORTANTE' ? 'bg-amber-400/15 text-amber-400' : 'bg-gray-400/15 text-gray-400'
                          }`}>{t.prioridade}</span>
                          {t.custo && <span className="text-[9px] text-gray-500">{t.custo}</span>}
                        </div>
                        <p className="text-[10px] text-gray-400">{t.publico} · {t.formato} · {t.carga_horaria}</p>
                        {t.justificativa && <p className="text-[10px] text-gray-500 mt-0.5">{t.justificativa}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {c.decisoes_chave?.length > 0 && (
                  <div className="p-4 rounded-xl border border-red-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="red">Decisões-Chave</SectionTitle>
                    {c.decisoes_chave.map((d, i) => (
                      <div key={i} className="mb-2 p-3 rounded-lg" style={{ background: '#091D35' }}>
                        <p className="text-xs text-white font-bold">{d.colaborador}</p>
                        <p className="text-[10px] text-gray-400">{d.situacao}</p>
                        <p className="text-[10px] text-cyan-400 mt-0.5">→ {d.acao || d.acao_imediata}</p>
                      </div>
                    ))}
                  </div>
                )}

                {c.plano_acao && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="green">Plano de Ação RH</SectionTitle>
                    {['curto_prazo', 'medio_prazo', 'longo_prazo'].map(k => {
                      const a = c.plano_acao[k];
                      if (!a) return null;
                      return (
                        <div key={k} className="mb-2 p-2 rounded-lg" style={{ background: '#091D35' }}>
                          <p className="text-xs text-white font-bold">{a.titulo}</p>
                          <p className="text-[10px] text-gray-400">{a.descricao}</p>
                          {a.impacto && <p className="text-[10px] text-green-400 mt-0.5">{a.impacto}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {c.mensagem_final && <p className="text-xs text-gray-400 italic">{c.mensagem_final}</p>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="text-center py-12">
      <FileText size={32} className="text-gray-600 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function SectionTitle({ color = 'white', children }) {
  const colors = { white: 'text-white', cyan: 'text-cyan-400', green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400', purple: 'text-purple-400' };
  return <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${colors[color]}`}>{children}</p>;
}
