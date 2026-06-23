'use client';

// Gatilho admin do Kit Semanal (Fase 1/2). Dispara gerarKit (1 DISC) ou
// gerarKitSemanal (os 4 DISC) e mostra o desafio + os conteúdos de cada um.
// Ver docs/KIT-SEMANAL.md.
import { useState } from 'react';
import Link from 'next/link';
import { gerarKit, gerarKitSemanal } from '@/actions/kits';

const DISCS = ['D', 'I', 'S', 'C'] as const;
const DISC_NOME: Record<string, string> = { D: 'Comandante', I: 'Inspirador', S: 'Estabilizador', C: 'Analista' };

export default function GerarKitPage() {
  const [competencia, setCompetencia] = useState('');
  const [descritor, setDescritor] = useState('');
  const [nivelMin, setNivelMin] = useState('1');
  const [nivelMax, setNivelMax] = useState('2');
  const [cargo, setCargo] = useState('todos');
  const [contexto, setContexto] = useState('generico');
  const [disc, setDisc] = useState<'D' | 'I' | 'S' | 'C'>('D');
  const [renderAudio, setRenderAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  const baseParams = () => ({
    competencia: competencia.trim(), descritor: descritor.trim(),
    nivelMin: parseFloat(nivelMin) || 1, nivelMax: parseFloat(nivelMax) || 2,
    cargo: cargo.trim() || 'todos', contexto: contexto.trim() || 'generico',
  });

  async function run(modo: 'um' | 'lote') {
    if (!competencia.trim() || !descritor.trim()) { setErro('Competência e descritor são obrigatórios'); return; }
    setBusy(true); setErro(null); setRes(null);
    try {
      const r = modo === 'um'
        ? await gerarKit({ ...baseParams(), disc })
        : await gerarKitSemanal({ ...baseParams(), renderAudio });
      if (!r.success) setErro((r as any).error || 'Falha na geração');
      setRes(r);
    } catch (e: any) {
      setErro(e?.message || 'Erro');
    } finally {
      setBusy(false);
    }
  }

  const kits = res?.kits || (res?.kitId ? [{ disc: res.disc, kitId: res.kitId, ok: res.success, desafio: res.desafio, conteudos: res.conteudos }] : []);

  return (
    <div className="min-h-screen bg-[#0d1426] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">🎁 Gerar Kit Semanal</h1>
          <Link href="/admin/conteudos" className="text-xs text-cyan-400 hover:underline">← voltar a Conteúdos</Link>
        </div>
        <p className="text-xs text-gray-400 mb-6">1 núcleo → 4 formatos coesos + desafio por DISC. Um kit por (competência × descritor × DISC).</p>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
          <label className="text-xs col-span-2">Competência
            <input value={competencia} onChange={e => setCompetencia(e.target.value)} placeholder="ex.: Planejamento Estratégico"
              className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs col-span-2">Descritor
            <input value={descritor} onChange={e => setDescritor(e.target.value)} placeholder="ex.: Definir metas claras para a escola"
              className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">Nível mín.
            <input value={nivelMin} onChange={e => setNivelMin(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">Nível máx.
            <input value={nivelMax} onChange={e => setNivelMax(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">Cargo
            <input value={cargo} onChange={e => setCargo(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">Contexto
            <input value={contexto} onChange={e => setContexto(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">DISC:</span>
            <select value={disc} onChange={e => setDisc(e.target.value as any)} className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs">
              {DISCS.map(d => <option key={d} value={d} className="bg-[#0d1426]">{d} — {DISC_NOME[d]}</option>)}
            </select>
            <button onClick={() => run('um')} disabled={busy}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 disabled:opacity-50 text-sm font-bold">
              Gerar 1 DISC
            </button>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <label className="flex items-center gap-1.5 text-xs text-gray-300">
            <input type="checkbox" checked={renderAudio} onChange={e => setRenderAudio(e.target.checked)} /> renderizar podcasts (TTS)
          </label>
          <button onClick={() => run('lote')} disabled={busy}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold">
            Gerar os 4 DISC (lote)
          </button>
          {busy && <span className="text-xs text-amber-300 animate-pulse">gerando… (pode levar 1-3 min)</span>}
        </div>

        {erro && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-300">{erro}</div>}
        {res?.message && <div className="mb-4 text-sm text-emerald-300">{res.message}</div>}

        {kits.map((k: any, i: number) => (
          <div key={i} className="mb-4 rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-purple-600/30 text-purple-200 text-xs font-bold">{k.disc} · {DISC_NOME[k.disc]}</span>
              <span className={`text-xs ${k.ok ? 'text-emerald-400' : 'text-red-400'}`}>{k.ok ? 'kit publicado' : 'erro'}</span>
              {k.error && <span className="text-xs text-red-300">{k.error}</span>}
            </div>
            {k.desafio && (
              <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-amber-400 mb-0.5">Desafio da semana</div>
                <div className="text-sm text-amber-100">{k.desafio.desafio_texto}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(k.conteudos || []).map((c: any, j: number) => (
                <div key={j} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-[10px] uppercase text-gray-500">{c.formato}</div>
                  <div className={`text-xs ${c.ok ? 'text-gray-200' : 'text-red-400'}`}>{c.ok ? (c.titulo || c.conteudoId) : (c.error || 'erro')}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
