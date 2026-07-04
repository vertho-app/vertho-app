'use client';

// Tab "Votação" do workspace Competências do Cargo (reorganização do admin, Fase 3).
// Conteúdo movido de app/admin/empresas/[empresaId]/votacao/page.tsx — resultados da
// votação de competências pelos colaboradores, toggles (votação/perfil/mapeamento)
// e aprovação do Top 5 por cargo. Recebe o MESMO empresaId selecionado na página.

import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Users, CheckCircle, AlertCircle, MessageCircle, Trophy, Lock, Unlock } from 'lucide-react';
import { loadResultadosVotacao, toggleVotacao, aprovarTop5Votacao, togglePerfilComportamental, toggleMapeamentoCenarios } from '@/actions/votacao';

const MEDAL = ['🥇', '🥈', '🥉', '4º', '5º'];

export default function VotacaoTab({ empresaId }: { empresaId: string }) {
  const t = useTranslations('AdminVoting');
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [togglingPerfil, setTogglingPerfil] = useState(false);
  const [togglingCenarios, setTogglingCenarios] = useState(false);
  const [aprovando, setAprovando] = useState<string | null>(null);
  // selecaoPorCargo[cargo] = Set<string> de competências marcadas pra aprovação
  const [selecaoPorCargo, setSelecaoPorCargo] = useState<Record<string, Set<string>>>({});

  function flash(msg) { toast(msg); }

  async function refresh() {
    const r = await loadResultadosVotacao(empresaId);
    setData(r);
    // Pre-popula seleção com top 5 do ranking (default razoável)
    if (r?.resultado) {
      const sel: Record<string, Set<string>> = {};
      for (const [cargo, dados] of Object.entries(r.resultado)) {
        const ranking = (dados as any).ranking || [];
        sel[cargo] = new Set(ranking.slice(0, 5).map((x: any) => x.nome));
      }
      setSelecaoPorCargo(sel);
    }
    setLoading(false);
  }

  useEffect(() => { setLoading(true); refresh(); }, [empresaId]);

  async function handleToggle() {
    setToggling(true);
    const r = await toggleVotacao(empresaId, !data.votacaoAtiva);
    setToggling(false);
    flash(r.success ? r.message : r.error);
    refresh();
  }

  async function handleTogglePerfil() {
    setTogglingPerfil(true);
    const r = await togglePerfilComportamental(empresaId, !data.perfilComportamentalLiberado);
    setTogglingPerfil(false);
    flash(r.success ? r.message : r.error);
    refresh();
  }

  async function handleToggleCenarios() {
    setTogglingCenarios(true);
    const r = await toggleMapeamentoCenarios(empresaId, !data.mapeamentoCenariosLiberado);
    setTogglingCenarios(false);
    flash(r.success ? r.message : r.error);
    refresh();
  }

  function toggleSel(cargo: string, comp: string) {
    setSelecaoPorCargo((prev) => {
      const atual = new Set(prev[cargo] || []);
      if (atual.has(comp)) atual.delete(comp);
      else atual.add(comp);
      return { ...prev, [cargo]: atual };
    });
  }

  async function handleAprovar(cargo: string, ranking: any[]) {
    const sel = selecaoPorCargo[cargo] || new Set();
    // Mantém a ordem do ranking pra os marcados
    const escolhidas = ranking.map((r: any) => r.nome).filter((n: string) => sel.has(n));
    if (escolhidas.length < 1) { flash(t('messages.selectAtLeastOne', { role: cargo })); return; }
    setAprovando(cargo);
    const r = await aprovarTop5Votacao(empresaId, cargo, escolhidas);
    setAprovando(null);
    flash(r.success ? r.message : r.error);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-cyan-400" /></div>;

  const cargos = data?.resultado ? Object.entries(data.resultado) : [];

  // Total geral de votantes
  const totalVotaram = cargos.reduce((acc, [, d]: [string, any]) => acc + (d.votaram || 0), 0);
  const totalColabs = cargos.reduce((acc, [, d]: [string, any]) => acc + (d.total || 0), 0);
  const pctTotal = totalColabs > 0 ? Math.round((totalVotaram / totalColabs) * 100) : 0;

  return (
    <div>
      {/* Toggles (votação / perfil comportamental / mapeamento de cenários) */}
      <div className="flex items-center justify-end gap-2 flex-wrap mb-4">
        <button onClick={handleTogglePerfil} disabled={togglingPerfil || data?.votacaoAtiva}
          title={data?.votacaoAtiva ? t('actions.closeBeforeUnlock') : undefined}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
            data?.perfilComportamentalLiberado
              ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/25'
              : 'bg-amber-400/15 text-amber-300 border border-amber-400/30 hover:bg-amber-400/25'
          } disabled:opacity-50 disabled:cursor-not-allowed`}>
          {togglingPerfil ? <Loader2 size={14} className="animate-spin" /> : data?.perfilComportamentalLiberado ? <Unlock size={14} /> : <Lock size={14} />}
          {data?.perfilComportamentalLiberado ? t('actions.lockProfile') : t('actions.unlockProfile')}
        </button>
        <button onClick={handleToggleCenarios} disabled={togglingCenarios || data?.votacaoAtiva}
          title={data?.votacaoAtiva ? t('actions.closeBeforeUnlock') : undefined}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
            data?.mapeamentoCenariosLiberado
              ? 'bg-purple-400/15 text-purple-300 border border-purple-400/30 hover:bg-purple-400/25'
              : 'bg-amber-400/15 text-amber-300 border border-amber-400/30 hover:bg-amber-400/25'
          } disabled:opacity-50 disabled:cursor-not-allowed`}>
          {togglingCenarios ? <Loader2 size={14} className="animate-spin" /> : data?.mapeamentoCenariosLiberado ? <Unlock size={14} /> : <Lock size={14} />}
          {data?.mapeamentoCenariosLiberado ? t('actions.lockScenarios') : t('actions.unlockScenarios')}
        </button>
        <button onClick={handleToggle} disabled={toggling}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            data?.votacaoAtiva
              ? 'bg-red-400/15 text-red-400 border border-red-400/30 hover:bg-red-400/25'
              : 'bg-green-400/15 text-green-400 border border-green-400/30 hover:bg-green-400/25'
          }`}>
          {toggling ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
          {data?.votacaoAtiva ? t('actions.closeVoting') : t('actions.openVoting')}
        </button>
      </div>

      {/* Status */}
      <div className={`rounded-xl p-4 mb-3 border ${data?.votacaoAtiva ? 'border-green-400/20 bg-green-400/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {data?.votacaoAtiva ? <CheckCircle size={16} className="text-green-400" /> : <AlertCircle size={16} className="text-gray-500" />}
            <span className={`text-sm font-bold ${data?.votacaoAtiva ? 'text-green-400' : 'text-gray-500'}`}>
              {data?.votacaoAtiva ? t('status.votingOpen') : t('status.votingClosed')}
            </span>
          </div>
          {totalColabs > 0 && (
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <Users size={12} className="text-cyan-400" />
              <span>{t.rich('status.votedCount', {
                voted: totalVotaram,
                total: totalColabs,
                strong: chunks => <span className="text-cyan-400 font-bold">{chunks}</span>,
              })}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                pctTotal >= 75 ? 'bg-green-400/15 text-green-400'
                : pctTotal >= 40 ? 'bg-amber-400/15 text-amber-400'
                : 'bg-gray-500/15 text-gray-400'
              }`}>{pctTotal}%</span>
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-xl p-4 mb-3 border ${data?.perfilComportamentalLiberado ? 'border-cyan-400/20 bg-cyan-400/5' : 'border-amber-400/20 bg-amber-400/5'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {data?.perfilComportamentalLiberado ? <Unlock size={16} className="text-cyan-300" /> : <Lock size={16} className="text-amber-300" />}
            <span className={`text-sm font-bold ${data?.perfilComportamentalLiberado ? 'text-cyan-300' : 'text-amber-300'}`}>
              {data?.perfilComportamentalLiberado
                ? t('profile.unlocked')
                : t('profile.locked')}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {data?.votacaoAtiva
              ? t('profile.availableAfterClose')
              : t('profile.useUnlockButton')}
          </span>
        </div>
      </div>

      <div className={`rounded-xl p-4 mb-3 border ${data?.mapeamentoCenariosLiberado ? 'border-purple-400/20 bg-purple-400/5' : 'border-amber-400/20 bg-amber-400/5'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {data?.mapeamentoCenariosLiberado ? <Unlock size={16} className="text-purple-300" /> : <Lock size={16} className="text-amber-300" />}
            <span className={`text-sm font-bold ${data?.mapeamentoCenariosLiberado ? 'text-purple-300' : 'text-amber-300'}`}>
              {data?.mapeamentoCenariosLiberado
                ? t('scenarios.unlocked')
                : t('scenarios.locked')}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {data?.votacaoAtiva
              ? t('profile.availableAfterClose')
              : t('scenarios.useUnlockButton')}
          </span>
        </div>
      </div>

      {/* Dica: 2 caminhos */}
      <div className="rounded-xl p-3 mb-6 border border-cyan-400/15 bg-cyan-400/[0.04] text-[11px] text-cyan-100/85 leading-relaxed">
        <strong className="text-cyan-300">{t('hint.title')}</strong>{' '}
        <span className="text-cyan-100/70">
          {t.rich('hint.bodyBeforeLink', {
            strong: chunks => <strong>{chunks}</strong>,
          })}{' '}
        </span>
        <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase1?tab=top5`)}
          className="underline text-cyan-300 hover:text-cyan-200">
          Fase 1 → Top 5
        </button>
        <span className="text-cyan-100/70"> {t('hint.bodyAfterLink')}</span>
      </div>

      {cargos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm">{t('empty.noCollaborators')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {cargos.map(([cargo, dados]: [string, any]) => {
            const pctCargo = dados.total > 0 ? Math.round((dados.votaram / dados.total) * 100) : 0;
            return (
            <div key={cargo} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              {/* Cargo header */}
              <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    {cargo}
                    {dados.total > 0 && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        pctCargo >= 75 ? 'bg-green-400/15 text-green-400'
                        : pctCargo >= 40 ? 'bg-amber-400/15 text-amber-400'
                        : 'bg-gray-500/15 text-gray-400'
                      }`}>{pctCargo}%</span>
                    )}
                  </h2>
                  <p className="text-[10px] text-gray-500">
                    {t.rich('role.votedCount', {
                      voted: dados.votaram,
                      total: dados.total,
                      strong: chunks => <span className="text-cyan-400 font-bold">{chunks}</span>,
                    })}
                    {dados.faltam.length > 0 && (
                      <span className="text-gray-600"> · {t('role.missing', { names: dados.faltam.join(', ') })}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {dados.votaram > 0 && dados.ranking.length > 0 && (() => {
                    const selCount = (selecaoPorCargo[cargo] || new Set()).size;
                    return (
                      <button onClick={() => handleAprovar(cargo, dados.ranking)}
                        disabled={aprovando === cargo || selCount === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 disabled:opacity-50">
                        {aprovando === cargo ? <Loader2 size={11} className="animate-spin" /> : <Trophy size={11} />}
                        {t('actions.approveSelected', { count: selCount })}
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* Ranking */}
              {dados.ranking.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-500">{t('empty.noVotes')}</div>
              ) : (
                <div className="px-4 py-3 space-y-1.5">
                  {dados.ranking.map((r: any, idx: number) => {
                    const sel = selecaoPorCargo[cargo] || new Set();
                    const marcado = sel.has(r.nome);
                    return (
                      <button
                        type="button"
                        key={r.nome}
                        onClick={() => toggleSel(cargo, r.nome)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          marcado ? 'border border-cyan-400/30' : 'border border-transparent hover:border-white/[0.08]'
                        }`}
                        style={{ background: marcado ? 'rgba(52,197,204,0.08)' : '#091D35' }}>
                        {/* Checkbox */}
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            marcado ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/20 bg-transparent'
                          }`}>
                          {marcado && <CheckCircle size={11} className="text-cyan-400" />}
                        </span>
                        <span className="w-8 text-center text-sm shrink-0">
                          {idx < 3 ? MEDAL[idx] : <span className="text-[10px] text-gray-500">{idx + 1}º</span>}
                        </span>
                        <span className={`flex-1 text-sm ${marcado ? 'font-bold text-white' : 'text-gray-400'}`}>{r.nome}</span>
                        <div className="flex items-center gap-3 shrink-0 text-[10px]">
                          <span className="text-cyan-400 font-bold">{t('ranking.points', { count: r.pontos })}</span>
                          <span className="text-gray-500">{t('ranking.votes', { count: r.votos })}</span>
                        </div>
                        {marcado && (
                          <div className="w-24 h-1.5 rounded-full overflow-hidden bg-white/5 shrink-0">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(r.pontos / (dados.votaram * 5)) * 100}%` }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sugestões */}
              {dados.sugestoes.length > 0 && (
                <div className="px-4 py-3 border-t border-white/[0.04]">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <MessageCircle size={10} /> {t('suggestions.title')}
                  </p>
                  {dados.sugestoes.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs mb-1">
                      <span className="text-gray-500 shrink-0">{s.nome}:</span>
                      <span className="text-amber-300">{s.sugestao}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
