'use client';

import { useEffect, useState, useRef } from 'react';
import { Gift, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { enqueueKit, statusKit } from '@/actions/kits';
import { listarEmpresasParaEscopo } from '@/actions/extracao-video';

const DISCS = ['D', 'I', 'S', 'C'] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gera o KIT SEMANAL deste módulo (competência × descritor) em background.
 * Reusa o módulo-base atual (resolverOuCriarBrief casa por competência+descritor)
 * e tece o contexto/PPP da empresa escolhida. Espelha /admin/conteudos/kit, mas
 * pré-preenchido pelo módulo. Ver docs/KIT-SEMANAL.md.
 */
export default function KitGeradorCard({
  competenciaNome, descritor, nivelEntrada, nivelDestino,
}: { competenciaNome: string; descritor: string; nivelEntrada?: number; nivelDestino?: number }) {
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [cargo, setCargo] = useState('todos');
  const [renderAudio, setRenderAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef(0);

  useEffect(() => { listarEmpresasParaEscopo().then((r) => setEmpresas(r.data || [])).catch(() => {}); }, []);
  useEffect(() => () => { pollRef.current++; }, []); // cancela polling ao desmontar

  async function poll(jobId: string) {
    const myRun = ++pollRef.current;
    for (let i = 0; i < 800 && myRun === pollRef.current; i++) {
      const s = await statusKit(jobId);
      if (myRun !== pollRef.current) return;
      if (s) {
        setJob(s);
        if (s.status === 'done' || s.status === 'error') {
          if (s.status === 'error') setErro(s.error || 'Falhou');
          setBusy(false);
          return;
        }
      }
      await sleep(3000);
    }
    setBusy(false);
  }

  async function run(modo: 'um' | 'lote', disc?: string) {
    if (!empresaId) { setErro('Escolha a empresa — o kit é gerado no contexto/PPP dela.'); return; }
    if (!competenciaNome || !descritor) { setErro('Este módulo precisa ter competência e descritor definidos.'); return; }
    setBusy(true); setErro(null); setJob(null);
    try {
      const discs = modo === 'um' ? [disc!] : [...DISCS];
      const r = await enqueueKit({
        competencia: competenciaNome, descritor,
        nivelMin: nivelEntrada || 1, nivelMax: nivelDestino || 2,
        cargo, contexto: 'educacional', empresaId,
        discs: discs as any, renderAudio: modo === 'lote' ? renderAudio : false,
      });
      if (!r.success) { setErro((r as any).error || 'Falha ao enfileirar'); setBusy(false); return; }
      setJob({ status: 'queued', progress: { done: 0, total: discs.length, current: 'na fila…', kits: [] } });
      poll((r as any).jobId);
    } catch (e: any) { setErro(e?.message || 'Erro'); setBusy(false); }
  }

  const prog = job?.progress || {};
  const kits = prog.kits || [];
  const semDados = !competenciaNome || !descritor;

  return (
    <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Gift size={16} className="text-fuchsia-300" />
        <h2 className="text-sm font-bold text-white">Kit Semanal</h2>
        <span className="text-[10px] text-white/40">4 formatos coesos + desafio por DISC (vídeo incluso)</span>
      </div>

      {semDados ? (
        <p className="text-[11px] text-amber-200/80 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Defina competência e descritor do módulo antes de gerar o kit.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-white/45 mb-3">
            <b className="text-white/70">{competenciaNome}</b> › {descritor}. Roda em background (~5–10 min); o vídeo de cada DISC é renderizado à parte.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <label className="text-[11px] text-white/60 col-span-2">Empresa (contexto/PPP)
              <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} disabled={busy}
                className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
                <option value="" className="bg-[#0d1426]">— escolha —</option>
                {empresas.map((e) => <option key={e.id} value={e.id} className="bg-[#0d1426]">{e.nome}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-white/60">Cargo
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={busy}
                className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
            </label>
            <label className="text-[11px] text-white/60 flex items-end gap-2 pb-2">
              <input type="checkbox" checked={renderAudio} onChange={(e) => setRenderAudio(e.target.checked)} disabled={busy} />
              renderizar áudio (podcast)
            </label>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-2.5 mb-3 text-xs text-red-200 flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{erro}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => run('lote')} disabled={busy || !empresaId}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#c026d3,#a21caf)' }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
              {busy ? 'Gerando…' : 'Gerar Kit (4 DISC)'}
            </button>
            <button onClick={() => run('um', 'D')} disabled={busy || !empresaId}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-white/80 border border-white/15 hover:bg-white/5 disabled:opacity-40">
              só DISC D (teste)
            </button>
          </div>

          {job && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-white/70">{prog.current || job.status}</span>
                <span className="text-white/40 font-mono">{prog.done || 0}/{prog.total || 0}</span>
              </div>
              {kits.length > 0 && (
                <ul className="space-y-1">
                  {kits.map((k: any, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 text-[11px] text-white/60">
                      {k.ok ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Loader2 size={12} className="animate-spin text-cyan-300" />}
                      DISC {k.disc} — {k.ok ? 'pronto' : 'gerando'}{typeof k.kitId === 'string' ? ` (${k.kitId.slice(0, 8)})` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {job.status === 'done' && <p className="text-[11px] text-emerald-300 mt-1.5 flex items-center gap-1"><CheckCircle2 size={12} /> Kit concluído.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
