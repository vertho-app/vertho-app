'use client';

// Gatilho admin do Kit Semanal. Enfileira o job (enqueueKit → trigger.dev) e faz
// POLLING do progresso (statusKit) — a geração roda em BACKGROUND (longa demais
// p/ síncrono). Mostra o desafio + os conteúdos de cada DISC conforme saem.
// Competência/descritor/cargo de dropdowns; empresa do topo do admin. Ver
// docs/KIT-SEMANAL.md.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { enqueueKit, statusKit } from '@/actions/kits';
import { loadOpcoesGerar } from '@/actions/conteudos';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';

const DISCS = ['D', 'I', 'S', 'C'] as const;
const DISC_NOME: Record<string, string> = { D: 'Comandante', I: 'Inspirador', S: 'Estabilizador', C: 'Analista' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Opcoes = { competencias: { nome: string; descritores: string[] }[]; cargos: string[] };

export default function GerarKitPage() {
  const { empresaFiltro } = useAdminShell();
  const [opcoes, setOpcoes] = useState<Opcoes>({ competencias: [], cargos: [] });
  const [competencia, setCompetencia] = useState('');
  const [descritor, setDescritor] = useState('');
  const [nivelMin, setNivelMin] = useState('1');
  const [nivelMax, setNivelMax] = useState('2');
  const [cargo, setCargo] = useState('todos');
  const [contexto, setContexto] = useState('educacional');
  const [disc, setDisc] = useState<'D' | 'I' | 'S' | 'C'>('D');
  const [renderAudio, setRenderAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef(0);

  useEffect(() => {
    loadOpcoesGerar(empresaFiltro).then((o) => setOpcoes(o as Opcoes)).catch(() => {});
  }, [empresaFiltro]);
  useEffect(() => () => { pollRef.current++; }, []); // cancela polling ao desmontar

  const descritoresDisp = opcoes.competencias.find((c) => c.nome === competencia)?.descritores || [];
  const cargoOptions = ['todos', ...(opcoes.cargos || [])];
  const semEmpresa = !empresaFiltro || empresaFiltro === 'all';

  const baseParams = () => ({
    competencia: competencia.trim(), descritor: descritor.trim(),
    nivelMin: parseFloat(nivelMin) || 1, nivelMax: parseFloat(nivelMax) || 2,
    cargo: cargo.trim() || 'todos', contexto: contexto.trim() || 'generico',
    empresaId: empresaFiltro && empresaFiltro !== 'all' ? empresaFiltro : null,
  });

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

  async function run(modo: 'um' | 'lote') {
    if (semEmpresa) { setErro('Selecione uma empresa no topo do admin antes de gerar o kit.'); return; }
    if (!competencia.trim() || !descritor.trim()) { setErro('Escolha competência e descritor.'); return; }
    setBusy(true); setErro(null); setJob(null);
    try {
      const discs = modo === 'um' ? [disc] : [...DISCS];
      const r = await enqueueKit({ ...baseParams(), discs: discs as any, renderAudio: modo === 'lote' ? renderAudio : false });
      if (!r.success) { setErro((r as any).error || 'Falha ao enfileirar'); setBusy(false); return; }
      setJob({ status: 'queued', progress: { done: 0, total: discs.length, current: 'na fila…', kits: [] } });
      poll((r as any).jobId);
    } catch (e: any) {
      setErro(e?.message || 'Erro'); setBusy(false);
    }
  }

  const prog = job?.progress || {};
  const kits = prog.kits || [];

  return (
    <div className="min-h-screen bg-[#0d1426] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">🎁 Gerar Kit Semanal</h1>
          <Link href="/admin/conteudos" className="text-xs text-cyan-400 hover:underline">← voltar a Conteúdos</Link>
        </div>
        <p className="text-xs text-gray-400 mb-4">1 núcleo → 4 formatos coesos + desafio por DISC. Roda em background; o progresso aparece abaixo. Contexto/PPP da empresa é tecido no conteúdo.</p>

        {semEmpresa && (
          <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-sm text-amber-200">
            ⚠️ Selecione uma <b>empresa</b> no topo do admin — o kit é gerado no contexto dela (módulo-base + PPP municipal).
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
          <label className="text-xs col-span-2">Competência
            <select value={competencia} onChange={(e) => { setCompetencia(e.target.value); setDescritor(''); }}
              className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm">
              <option value="" className="bg-[#0d1426]">— escolha —</option>
              {opcoes.competencias.map((c) => <option key={c.nome} value={c.nome} className="bg-[#0d1426]">{c.nome}</option>)}
            </select>
          </label>
          <label className="text-xs col-span-2">Descritor
            <select value={descritor} onChange={(e) => setDescritor(e.target.value)} disabled={!competencia}
              className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
              <option value="" className="bg-[#0d1426]">{competencia ? '— escolha —' : 'escolha a competência primeiro'}</option>
              {descritoresDisp.map((d) => <option key={d} value={d} className="bg-[#0d1426]">{d}</option>)}
            </select>
          </label>
          <label className="text-xs">Nível mín.
            <input value={nivelMin} onChange={(e) => setNivelMin(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">Nível máx.
            <input value={nivelMax} onChange={(e) => setNivelMax(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">Cargo
            <select value={cargo} onChange={(e) => setCargo(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm">
              {cargoOptions.map((c) => <option key={c} value={c} className="bg-[#0d1426]">{c}</option>)}
            </select>
          </label>
          <label className="text-xs">Contexto
            <select value={contexto} onChange={(e) => setContexto(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm">
              {['educacional', 'corporativo', 'generico'].map((c) => <option key={c} value={c} className="bg-[#0d1426]">{c}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">DISC:</span>
            <select value={disc} onChange={(e) => setDisc(e.target.value as any)} className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs">
              {DISCS.map((d) => <option key={d} value={d} className="bg-[#0d1426]">{d} — {DISC_NOME[d]}</option>)}
            </select>
            <button onClick={() => run('um')} disabled={busy || semEmpresa}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 disabled:opacity-50 text-sm font-bold">
              Gerar 1 DISC
            </button>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <label className="flex items-center gap-1.5 text-xs text-gray-300">
            <input type="checkbox" checked={renderAudio} onChange={(e) => setRenderAudio(e.target.checked)} /> renderizar podcasts (TTS)
          </label>
          <button onClick={() => run('lote')} disabled={busy || semEmpresa}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold">
            Gerar os 4 DISC (lote)
          </button>
        </div>

        {erro && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-300">{erro}</div>}

        {job && (
          <div className="mb-4 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${job.status === 'done' ? 'bg-emerald-600/30 text-emerald-200' : job.status === 'error' ? 'bg-red-600/30 text-red-200' : 'bg-amber-600/30 text-amber-200'}`}>
              {job.status === 'queued' ? 'na fila' : job.status === 'running' ? 'gerando' : job.status === 'done' ? 'concluído' : 'erro'}
            </span>
            <span className="text-gray-300">{prog.current || '…'}</span>
            {typeof prog.done === 'number' && <span className="text-gray-500 text-xs">{prog.done}/{prog.total} DISC</span>}
            {busy && <span className="text-amber-300 animate-pulse text-xs">acompanhando…</span>}
          </div>
        )}

        {kits.map((k: any, i: number) => (
          <div key={i} className="mb-4 rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-purple-600/30 text-purple-200 text-xs font-bold">{k.disc} · {DISC_NOME[k.disc]}</span>
              <span className={`text-xs ${k.ok ? 'text-emerald-400' : 'text-red-400'}`}>{k.ok ? 'kit publicado' : 'erro'}</span>
            </div>
            {k.desafio && (
              <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-amber-400 mb-0.5">Desafio da semana</div>
                <div className="text-sm text-amber-100">{typeof k.desafio === 'string' ? k.desafio : k.desafio.desafio_texto}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(k.conteudos || []).map((c: any, j: number) => (
                <div key={j} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-[10px] uppercase text-gray-500">{c.formato}</div>
                  <div className={`text-xs ${c.ok ? 'text-gray-200' : 'text-red-400'}`}>{c.ok ? (c.titulo || 'ok') : (c.error || 'erro')}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
