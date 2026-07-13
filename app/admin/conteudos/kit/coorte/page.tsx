'use client';

// Agendador por COORTE (manual por empresa): varre o temporada_plano de todos os
// colaboradores da empresa, deduplica os (competência × descritor × DISC) que a
// coorte vai demandar e gera SÓ os faltantes (em lote/Batch). Dry-run primeiro
// (preview), depois "Gerar faltantes". Ver docs/KIT-SEMANAL.md.
import { useState } from 'react';
import Link from 'next/link';
import { planejarKitsCoorte, statusKit } from '@/actions/kits';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CoorteKitPage() {
  const { empresaFiltro } = useAdminShell();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const [incluirVideo, setIncluirVideo] = useState(true);
  const [semanaMax, setSemanaMax] = useState<string>('');
  const [jobStatus, setJobStatus] = useState<Record<string, any>>({});

  const semEmpresa = !empresaFiltro || empresaFiltro === 'all';

  async function analisar(executar: boolean) {
    if (semEmpresa) { setErro('Selecione uma empresa no topo do admin.'); return; }
    setBusy(true); setErro(null);
    if (!executar) { setRes(null); setJobStatus({}); }
    try {
      const r: any = await planejarKitsCoorte(empresaFiltro, { executar, incluirVideo, semanaMax: semanaMax ? Number(semanaMax) : undefined });
      if (r.error) { setErro(r.error); setBusy(false); return; }
      setRes(r);
      if (executar) pollJobs(r.plano.filter((p: any) => p.jobId).map((p: any) => p.jobId));
    } catch (e: any) { setErro(e?.message || 'Erro'); }
    setBusy(false);
  }

  async function pollJobs(jobIds: string[]) {
    for (let i = 0; i < 400 && jobIds.length; i++) {
      const entries = await Promise.all(jobIds.map(async (id) => [id, await statusKit(id)] as const));
      const map: Record<string, any> = {};
      for (const [id, s] of entries) if (s) map[id] = s;
      setJobStatus({ ...map });
      if (entries.every(([, s]) => s && (s.status === 'done' || s.status === 'error'))) return;
      await sleep(4000);
    }
  }

  const plano = res?.plano || [];
  const resumo = res?.resumo;

  return (
    <div className="min-h-screen bg-[#0d1426] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">🗓️ Kits por coorte</h1>
          <Link href="/admin/conteudos/kit" className="text-xs text-cyan-400 hover:underline">← Gerar Kit avulso</Link>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Varre a trilha de todos os colaboradores da empresa, deduplica os (competência × descritor × DISC) demandados e gera <b>só os que faltam</b>. Analise primeiro; depois gere.
        </p>

        {semEmpresa && (
          <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-sm text-amber-200">
            ⚠️ Selecione uma <b>empresa</b> no topo do admin.
          </div>
        )}

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => analisar(false)} disabled={busy || semEmpresa}
            className="px-4 py-2 rounded-lg text-sm font-bold border border-white/15 hover:bg-white/5 disabled:opacity-40">
            {busy ? 'Analisando…' : 'Analisar coorte'}
          </button>
          <label className="text-xs text-white/60 flex items-center gap-2">
            <input type="checkbox" checked={incluirVideo} onChange={(e) => setIncluirVideo(e.target.checked)} disabled={busy} />
            incluir vídeo (HeyGen/render — custo de GPU)
          </label>
          <label className="text-xs text-white/60 flex items-center gap-2">
            até a semana
            <input type="number" min="1" max="14" value={semanaMax} onChange={(e) => setSemanaMax(e.target.value)} disabled={busy}
              placeholder="todas" className="w-16 bg-white/5 border border-white/15 rounded px-2 py-1 text-white text-center outline-none" />
          </label>
          {resumo && resumo.totalFaltantes > 0 && (
            <button onClick={() => analisar(true)} disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#c026d3,#a21caf)' }}>
              Gerar {resumo.totalFaltantes} kit(s) faltante(s)
            </button>
          )}
        </div>

        {erro && <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 mb-4 text-sm text-red-200">{erro}</div>}

        {resumo && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              ['Colaboradores', resumo.colaboradores],
              ['Combinações', resumo.combinacoes],
              ['Faltantes', resumo.totalFaltantes],
              ['Jobs enfileirados', resumo.jobsEnfileirados],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="text-2xl font-bold">{v as number}</div>
                <div className="text-[11px] text-white/50">{l}</div>
              </div>
            ))}
          </div>
        )}

        {plano.length > 0 && (
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/60 text-[11px] uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Competência › Descritor</th>
                  <th className="px-2 py-2">Pessoas</th>
                  <th className="px-2 py-2">Demandados</th>
                  <th className="px-2 py-2">Já existem</th>
                  <th className="px-2 py-2">Faltam</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {plano.map((p: any, i: number) => {
                  const st = p.jobId ? jobStatus[p.jobId] : null;
                  return (
                    <tr key={i} className="border-t border-white/[0.06]">
                      <td className="px-3 py-2"><b>{p.competencia}</b> <span className="text-white/40">› {p.descritor}</span></td>
                      <td className="px-2 py-2 text-center text-white/60">{p.pessoas}</td>
                      <td className="px-2 py-2 text-center font-mono text-cyan-200">{p.demandadas.join(' ') || '—'}</td>
                      <td className="px-2 py-2 text-center font-mono text-emerald-300/70">{p.existentes.join(' ') || '—'}</td>
                      <td className="px-2 py-2 text-center font-mono text-fuchsia-300">{p.faltantes.join(' ') || '—'}</td>
                      <td className="px-2 py-2 text-center text-[11px]">
                        {p.jobErro ? <span className="text-red-300">{p.jobErro}</span>
                          : st ? <span className={st.status === 'done' ? 'text-emerald-300' : st.status === 'error' ? 'text-red-300' : 'text-cyan-200'}>{st.status === 'done' ? 'pronto' : st.status === 'error' ? 'erro' : (st.progress?.current || st.status)}</span>
                          : p.jobId ? <span className="text-cyan-200">enfileirado</span>
                          : p.faltantes.length ? <span className="text-white/40">a gerar</span>
                          : <span className="text-emerald-300/60">completo</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
