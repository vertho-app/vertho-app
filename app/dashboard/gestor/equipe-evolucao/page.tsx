'use client';

import { useEffect, useState, useMemo } from 'react';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Users, TrendingUp, TrendingDown, Minus, ChevronRight, Clock, X, FileDown, Download } from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import BackButton from '@/components/back-button';
import { listarEquipeEvolucao, loadLideradoConcluida } from './actions';
import { descritorParaHumano } from '@/lib/descritor-humano';

// 🔑 CLASSE DE COR É LITERAL, NUNCA MONTADA.
//
// Isto era `{ cor: 'cyan' }` + `bg-${cfg.cor}-500/[0.03]` na marcação. O Tailwind
// varre o CÓDIGO-FONTE em busca de nomes de classe: uma classe montada em runtime
// nunca chega ao CSS. Medido em 03/09/2026 — das quatro cores usadas aqui, três
// (`amber`, `cyan`, `gray`) não apareciam literalmente em nenhum arquivo do
// projeto, então esses cards saíam SEM o tom que classifica o status, e as duas
// que funcionavam só funcionavam de carona em outra tela que as citava.
const STATUS_CFG = {
  em_andamento:        { icon: Clock,      label: 'Em andamento',         borda: 'border-cyan-500/20',    fundo: 'bg-cyan-500/[0.03]',    tinta: 'text-cyan-300' },
  evolucao_confirmada: { icon: TrendingUp, label: 'Evolução confirmada',  borda: 'border-emerald-500/20', fundo: 'bg-emerald-500/[0.03]', tinta: 'text-emerald-300' },
  evolucao_parcial:    { icon: TrendingUp, label: 'Evolução parcial',     borda: 'border-amber-500/20',   fundo: 'bg-amber-500/[0.03]',   tinta: 'text-amber-300' },
  estagnacao:          { icon: Minus,      label: 'Estagnação',           borda: 'border-white/10',       fundo: 'bg-white/[0.02]',       tinta: 'text-gray-300' },
  sem_trilha:          { icon: X,          label: 'Sem trilha',           borda: 'border-white/10',       fundo: 'bg-white/[0.02]',       tinta: 'text-gray-400' },
  arquivada:           { icon: X,          label: 'Arquivada',            borda: 'border-white/10',       fundo: 'bg-white/[0.02]',       tinta: 'text-gray-400' },
};

export default function EquipeEvolucaoPage() {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [ordem, setOrdem] = useState('delta_desc');
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [escopo, setEscopo] = useState('gestor');

  async function carregar() {
    setLoading(true);
    const [r] = await Promise.all([
      listarEquipeEvolucao(),
    ]);
    if (r.error) setError(r.error);
    else { setRows(r.rows); setResumo(r.resumo); setEscopo(r.escopo || 'gestor'); }
    setLoading(false);
  }



  useEffect(() => { carregar(); }, []);

  async function abrir(colabEmail) {
    setLoadingDetalhe(true);
    setDetalhe({ colabEmail });
    const r = await loadLideradoConcluida(colabEmail);
    setLoadingDetalhe(false);
    if (r.error) { alert(r.error); setDetalhe(null); return; }
    setDetalhe({ ...r, colabEmail });
  }

  const filtrados = useMemo(() => {
    let list = filtro === 'todos' ? rows : rows.filter(r => r.status === filtro);
    list = [...list].sort((a, b) => {
      if (ordem === 'delta_desc') return (b.delta ?? -999) - (a.delta ?? -999);
      if (ordem === 'delta_asc') return (a.delta ?? 999) - (b.delta ?? 999);
      if (ordem === 'nome') return (a.colab || '').localeCompare(b.colab || '');
      return 0;
    });
    return list;
  }, [rows, filtro, ordem]);

  if (error) return <Center><p className="text-red-400">{error}</p></Center>;

  return (
    <PageContainer>
      <BackButton href="/dashboard" />
      {/* A plenária consolida o antes × depois — sem jornada encerrada ela sai
          em branco, e um PDF vazio é pior que um botão ausente. */}
      <div className="flex items-center justify-end mb-4 flex-wrap gap-2">
        {/* "Plenária PDF" saiu (03/09/2026): o documento da plenária é
            material de workshop, não da tela de acompanhamento do gestor. */}
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users size={20} className="text-brand-400" />
          <h1 className="text-2xl font-bold text-white">Evolução da equipe</h1>
        </div>
        <p className="text-sm text-gray-400">
          Visão consolidada do desenvolvimento {escopo === 'rh' ? 'dos colaboradores' : 'dos liderados'}.
        </p>
      </div>

      {/* A evolução só existe DEPOIS que uma jornada encerra: o veredito
          (confirmada · parcial · estagnação · regressão) vem do Evolution
          Report, que nasce no fechamento. Sem nenhuma encerrada, esta tela
          desenhava seis KPIs zerados e uma lista de "em andamento" sem delta —
          prometia evolução e não tinha nenhuma. Em Macaé, 0 de 282. */}
      {resumo && resumo.encerradas === 0 && (
        <GlassCard className="text-center" padding="p-6">
          <Clock size={24} className="text-brand-400/70 mx-auto mb-3" />
          <p className="text-sm font-semibold text-white mb-1">Nenhuma jornada encerrada ainda</p>
          <p className="text-[12px] text-gray-400 leading-relaxed max-w-[460px] mx-auto">
            A comparação antes × depois aparece aqui quando a primeira jornada chegar ao fim.
            {resumo.emAndamento > 0
              ? ` Hoje ${resumo.emAndamento} ${resumo.emAndamento === 1 ? 'está' : 'estão'} em andamento.`
              : ''}
          </p>
        </GlassCard>
      )}

      {resumo && resumo.encerradas > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
          {/* "Total" contava o time INTEIRO, inclusive quem não tem trilha — e
              esta tela mede evolução, que só existe onde há jornada. Sete
              liderados com quatro fora da trilha viravam "Total 7", sem dizer
              que quatro deles não tinham o que evoluir. */}
          <Card label="Com trilha" valor={resumo.total - resumo.semTrilha} cor="text-white"
            detalhe={resumo.semTrilha > 0 ? `${resumo.semTrilha} sem trilha` : null} />
          <Card label="Em andamento" valor={resumo.emAndamento} cor="text-brand-300" />
          <Card label="Confirmadas" valor={resumo.evolucaoConfirmada} cor="text-emerald-300" />
          <Card label="Parciais" valor={resumo.evolucaoParcial} cor="text-amber-300" />
          <Card label="Estável" valor={resumo.estagnacao} cor="text-gray-400" />
        </div>
      )}

      {/* 🔑 O VEREDITO NÃO É DO GESTOR (03/09/2026).
          Este bloco pedia que ele carimbasse "Evoluindo / Estagnado /
          Regredindo" para cada liderado. Quem mede evolução é a régua — T0 do
          mapeamento contra o fechamento —, e é ela que a tabela abaixo mostra.
          Pedir o mesmo veredito por opinião criava uma segunda verdade sobre a
          mesma pessoa, na mesma tela. Quem chegou na semana de conversa aparece
          no card "Ação esta semana" da home do gestor. */}

      {resumo && resumo.encerradas > 0 && (
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={filtro} onChange={e => setFiltro(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
          <option value="todos" className="bg-[#0d1426]">Todos</option>
          {Object.entries(STATUS_CFG).map(([k, c]) => (
            <option key={k} value={k} className="bg-[#0d1426]">{c.label}</option>
          ))}
        </select>
        <select value={ordem} onChange={e => setOrdem(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
          <option value="delta_desc" className="bg-[#0d1426]">Maior delta</option>
          <option value="delta_asc" className="bg-[#0d1426]">Menor delta</option>
          <option value="nome" className="bg-[#0d1426]">Nome A-Z</option>
        </select>
      </div>
      )}

      {loading ? (
        <Center><Loader2 size={28} className="animate-spin text-brand-400" /></Center>
      ) : (resumo && resumo.encerradas === 0) ? null : filtrados.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-500">
          {escopo === 'rh' ? 'Nenhum colaborador encontrado.' : 'Nenhum liderado encontrado.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtrados.map(r => {
            const cfg = STATUS_CFG[r.status] || STATUS_CFG.sem_trilha;
            const Icon = cfg.icon;
            const canOpen = r.status !== 'sem_trilha' && r.statusTrilha === 'concluida';
            return (
              <button key={r.colaboradorId}
                onClick={() => canOpen && abrir(r.colabEmail)}
                disabled={!canOpen}
                className={`w-full text-left rounded-xl border ${cfg.borda} ${cfg.fundo} p-4 ${canOpen ? 'hover:bg-white/[0.03]' : 'opacity-70 cursor-not-allowed'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icon size={18} className={`${cfg.tinta} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{r.colab}</p>
                      <span className="text-[10px] text-gray-400">· {r.cargo}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      {r.competencia ? <>{r.competencia} · T{r.temporada}</> : 'sem trilha ativa'}
                      {r.delta != null && (
                        <>
                          {' · '}
                          <span className={`${cfg.tinta} font-bold`}>
                            {r.mediaPre.toFixed(1)} → {r.mediaPos.toFixed(1)} ({r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)})
                          </span>
                        </>
                      )}
                    </p>
                    <p className={`text-[10px] uppercase tracking-widest ${cfg.tinta} mt-0.5`}>{cfg.label}</p>
                  </div>
                  {canOpen && <ChevronRight size={14} className="text-gray-500" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalhe && (
        <DetalheModal data={detalhe} loading={loadingDetalhe} onClose={() => setDetalhe(null)} sb={sb} />
      )}
    </PageContainer>
  );
}

function Center({ children }) {
  return <div className="min-h-[60vh] flex items-center justify-center">{children}</div>;
}

function Card({ label, valor, cor, detalhe = null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase text-gray-500 tracking-widest">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[10px] text-white/35 mt-0.5">{detalhe}</p>}
    </div>
  );
}

function DetalheModal({ data, loading, onClose, sb }) {
  const report = data?.evolutionReport;
  const descritores = report?.descritores || [];

  async function baixarPdf() {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`/api/temporada/concluida/pdf?email=${encodeURIComponent(data.colabEmail)}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (!res.ok) { alert('Erro ao gerar PDF'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `temporada-${data.trilha?.numeroTemporada || ''}-${(data.colab?.nome || 'colab').replace(/\s+/g, '-')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    // Mesmo desenho do leitor de relatório da home do gestor: `bg-[#071829]`,
    // canto de 24px e cabeçalho com eyebrow + serifa. O modal usava `#0a0e1a`
    // com canto de 16px — um tom preto que não existe em nenhuma outra tela do
    // produto (só nos modais do /admin, que são outra área).
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-start justify-center p-2 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe do liderado"
      onClick={onClose}
    >
      <div className="max-w-3xl w-full my-4 md:my-8 rounded-[24px] border border-white/[0.1] bg-[#071829] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 p-4 md:px-6 border-b border-white/[0.08] bg-[#071829] rounded-t-[24px]">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-300">Evolução da equipe</p>
            <h2 className="mt-0.5 truncate text-xl text-white" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>
              {data?.colab?.nome || 'Detalhe do liderado'}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.colab && (
              <button onClick={baixarPdf}
                className="flex items-center gap-1.5 rounded-full border border-brand-400/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-300 transition-colors hover:bg-brand-400/10">
                <Download size={11} /> PDF
              </button>
            )}
            <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"><X size={18} /></button>
          </div>
        </div>
        {loading || !data?.colab ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Contexto</p>
              <p className="text-white">{data.colab.cargo}</p>
              <p className="text-xs text-gray-400">Competência: <span className="text-brand-300">{data.trilha.competencia}</span> · Temporada {data.trilha.numeroTemporada}</p>
            </section>
            {report?.insight_geral && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-brand-400 mb-1">Insight geral</p>
                <p className="text-xs text-gray-200 italic border-l-2 border-brand-500/40 pl-3">{report.insight_geral}</p>
              </section>
            )}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Descritor a descritor</p>
              <div className="space-y-1.5">
                {descritores.map((d, i) => {
                  const cfg = STATUS_CFG[d.convergencia] || STATUS_CFG.estagnacao;
                  return (
                    <div key={i} className={`p-2 rounded border ${cfg.borda} ${cfg.fundo}`}>
                      <div className="flex justify-between text-xs">
                        <p className="font-bold text-white truncate">{descritorParaHumano(d.descritor)}</p>
                        <span className={`${cfg.tinta} font-bold shrink-0`}>
                          {d.nota_pre} → {d.nota_pos} ({(d.nota_pos - d.nota_pre).toFixed(1)})
                        </span>
                      </div>
                      {d.depois && <p className="text-[10px] text-gray-400 mt-1">{d.depois}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
            {report?.proximo_passo && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Recomendação de acompanhamento</p>
                <p className="text-xs text-gray-200">{report.proximo_passo}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
