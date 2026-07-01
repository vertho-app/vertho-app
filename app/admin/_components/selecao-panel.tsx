'use client';
/**
 * Módulo de SELEÇÃO — lista as VAGAS abertas (cargos_empresa eh_vaga=true) e conduz o fluxo:
 * (C1) Gerar perfil ideal (IA da descrição → gabarito) · (C3) Avaliar candidatos (roda o
 * gabarito contra TODOS com DISC → Ranking de Adequação). Candidatos entram pela base
 * (importação + link de mapeamento por WhatsApp — infra existente).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Briefcase, Plus, FileText, Check, Clock, Crown, Sparkles, BarChart3 } from 'lucide-react';
import { listarVagas } from '@/actions/cargo-extracao';
import { gerarPerfilVaga, gerarRankingVaga } from '@/actions/selecao';

const fmtData = (iso: string | null) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

export default function SelecaoPanel({ empresaId, novaVagaHref }: { empresaId: string; novaVagaHref: string }) {
  const [vagas, setVagas] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState<string>(''); // `${id}:perfil` | `${id}:avaliar`
  const [msg, setMsg] = useState<Record<string, { texto: string; url?: string; erro?: boolean }>>({});

  const recarregar = () => listarVagas(empresaId).then((r) => { setVagas(r.vagas); if (r.erro) setErro(r.erro); });
  useEffect(() => { recarregar(); }, [empresaId]);

  async function gerarPerfil(v: any) {
    setBusy(`${v.id}:perfil`); setMsg((m) => ({ ...m, [v.id]: { texto: '' } }));
    try {
      const r = await gerarPerfilVaga(empresaId, v.nome);
      if (r.success) { setMsg((m) => ({ ...m, [v.id]: { texto: `Perfil gerado (${r.competencias} competências).` } })); await recarregar(); }
      else setMsg((m) => ({ ...m, [v.id]: { texto: r.error || 'Falha.', erro: true } }));
    } catch { setMsg((m) => ({ ...m, [v.id]: { texto: 'Falha ao gerar o perfil.', erro: true } })); }
    setBusy('');
  }
  async function avaliar(v: any) {
    setBusy(`${v.id}:avaliar`); setMsg((m) => ({ ...m, [v.id]: { texto: '' } }));
    try {
      const r = await gerarRankingVaga(empresaId, v.nome, { comAnaliseIA: false });
      if (r.success && r.url) setMsg((m) => ({ ...m, [v.id]: { texto: `${r.avaliados} candidatos avaliados.`, url: r.url } }));
      else setMsg((m) => ({ ...m, [v.id]: { texto: r.error || 'Falha.', erro: true } }));
    } catch { setMsg((m) => ({ ...m, [v.id]: { texto: 'Falha ao avaliar candidatos.', erro: true } })); }
    setBusy('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400 max-w-[520px]">Vagas abertas para recrutamento — perfis a preencher, separados dos cargos operacionais. Fluxo: <b className="text-slate-300">1)</b> gerar o perfil ideal · <b className="text-slate-300">2)</b> avaliar os candidatos (todos com DISC) contra a vaga.</p>
        <Link href={novaVagaHref} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 text-sm shrink-0"><Plus size={14} /> Nova vaga</Link>
      </div>

      {vagas === null && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-400" /></div>}
      {erro && <p className="text-xs text-amber-400">{erro}</p>}

      {vagas && vagas.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Briefcase size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-300 mb-1">Nenhuma vaga aberta ainda.</p>
          <p className="text-xs text-slate-500 mb-4">Crie uma vaga extraindo a descrição de um documento (cole o texto ou envie um PDF).</p>
          <Link href={novaVagaHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 text-sm"><Plus size={14} /> Criar primeira vaga</Link>
        </div>
      )}

      {vagas && vagas.length > 0 && (
        <div className="space-y-2">
          {vagas.map((v) => {
            const bPerfil = busy === `${v.id}:perfil`, bAval = busy === `${v.id}:avaliar`;
            const m = msg[v.id];
            return (
              <div key={v.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0"><Briefcase size={16} className="text-brand-300" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{v.nome}</span>
                      {v.ehLideranca && <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300"><Crown size={9} /> liderança</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{v.area || 'sem área'}{v.criadaEm ? ` · aberta em ${fmtData(v.criadaEm)}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${v.temDescricao ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{v.temDescricao ? <Check size={10} /> : <Clock size={10} />} Descrição</span>
                    <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${v.temGabarito ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{v.temGabarito ? <Check size={10} /> : <Clock size={10} />} Perfil ideal</span>
                  </div>
                </div>
                {/* Ações do fluxo */}
                <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-white/5 flex-wrap">
                  {!v.temGabarito
                    ? <button onClick={() => gerarPerfil(v)} disabled={!!busy || !v.temDescricao} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 disabled:opacity-40 text-[11px]">
                        {bPerfil ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {bPerfil ? 'Gerando perfil…' : 'Gerar perfil ideal'}
                      </button>
                    : <>
                        <button onClick={() => avaliar(v)} disabled={!!busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 text-[11px]">
                          {bAval ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />} {bAval ? 'Avaliando…' : 'Avaliar candidatos'}
                        </button>
                        <button onClick={() => gerarPerfil(v)} disabled={!!busy} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 disabled:opacity-40 text-[10px]">{bPerfil ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} refazer perfil</button>
                      </>}
                  <Link href={novaVagaHref} className="text-[11px] text-brand-300 hover:text-brand-200 flex items-center gap-1"><FileText size={11} /> editar descrição</Link>
                  {m?.texto && <span className={`text-[11px] ${m.erro ? 'text-amber-400' : 'text-emerald-400'} ml-auto`}>{m.texto} {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="underline text-brand-300">abrir ranking</a>}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
