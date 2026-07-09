'use client';

/**
 * Import de manuscrito autoral (DOCX) → Módulos-Base, em lote.
 *
 * Três etapas na mesma tela. A do meio existe para que o admin veja o que será
 * gerado ANTES de comprometer o custo de IA: o parse é determinístico e de graça,
 * então o preview não custa nada.
 *
 * Ver docs/EXTRACAO-MANUSCRITO.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, Loader2, Upload, Play, XCircle, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react';
import BackButton from '@/components/back-button';
import { analisarManuscrito, enqueueManuscritoBatch, type PreviewManuscrito } from '@/actions/manuscrito-batch';
import { statusIAJob, cancelIAJob } from '@/actions/ia-pipeline-batch';
import { listarEmpresasParaEscopo } from '@/actions/extracao-video';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ResultadoItem { modulo: string; ok: boolean; id?: string; error?: string }

export default function ImportarManuscritoPage() {
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [b64, setB64] = useState<string>('');
  const [filename, setFilename] = useState<string>('');

  const [analisando, setAnalisando] = useState(false);
  const [preview, setPreview] = useState<PreviewManuscrito | null>(null);
  const [termo, setTermo] = useState('');
  const [substituir, setSubstituir] = useState(false);
  const [auditar, setAuditar] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const [jobId, setJobId] = useState<string | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number; current: string; pulados?: number } | null>(null);
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const [statusJob, setStatusJob] = useState<string>('');
  const pollRef = useRef(0);

  useEffect(() => { listarEmpresasParaEscopo().then((r) => setEmpresas(r.data || [])); }, []);
  useEffect(() => () => { pollRef.current++; }, []); // cancela polling ao desmontar

  function reset() {
    setPreview(null); setJobId(null); setProg(null); setResultados([]); setStatusJob('');
    setSelecionados(new Set()); setSubstituir(false); setAuditar(true);
  }

  async function handleArquivo(file: File) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Suba o .docx original. PDFs impressos perdem a camada de texto.');
      return;
    }
    reset();
    setFilename(file.name);
    setB64(Buffer.from(await file.arrayBuffer()).toString('base64'));
  }

  async function handleAnalisar() {
    if (!b64) { toast.error('Escolha o arquivo .docx'); return; }
    setAnalisando(true);
    try {
      const r = await analisarManuscrito({ arquivoBase64: b64, filename, empresaId: empresaId || null });
      if (r.error || !r.preview) { toast.error(r.error || 'Falha ao analisar'); return; }
      setPreview(r.preview);
      setTermo(r.preview.termoSugerido);
      setSelecionados(new Set(r.preview.descritores.map((d) => d.indice)));
      toast.success(`${r.preview.stats.totalMicroblocos} microblocos · ${r.preview.stats.totalDescritores} descritores`);
    } finally {
      setAnalisando(false);
    }
  }

  const poll = useCallback(async (id: string) => {
    const myRun = ++pollRef.current;
    for (let i = 0; i < 1600 && myRun === pollRef.current; i++) {
      const s = await statusIAJob(id);
      if (myRun !== pollRef.current) return;
      const p: any = s?.progress || {};
      setProg({ done: p.done ?? 0, total: p.total ?? 0, current: p.current || '', pulados: p.pulados });
      setResultados(p.resultados || []);
      if (s && (s.status === 'done' || s.status === 'error' || s.status === 'cancelled')) {
        setStatusJob(s.status);
        if (s.status === 'error') toast.error(`Lote falhou: ${s.error || ''}`);
        else if (s.status === 'cancelled') toast('Lote cancelado');
        else toast.success('Lote concluído');
        return;
      }
      await sleep(3000);
    }
  }, []);

  async function handleGerar() {
    if (!preview) return;
    const apenas = selecionados.size === preview.descritores.length ? undefined : [...selecionados];
    const r = await enqueueManuscritoBatch({
      arquivoBase64: b64,
      empresaId: empresaId || null,
      termoCanonico: termo.trim() || undefined,
      apenasDescritores: apenas,
      substituirExistentes: substituir,
      auditar,
    });
    if (!r.success) { toast.error(r.error); return; }
    setJobId(r.jobId!); setStatusJob('running');
    toast.success(`Lote enfileirado: ${r.total} módulo(s)`);
    poll(r.jobId!);
  }

  async function handleCancelar() {
    if (!jobId) return;
    await cancelIAJob(jobId);
    pollRef.current++;
    setStatusJob('cancelled');
  }

  const aGerar = preview
    ? preview.descritores
        .filter((d) => selecionados.has(d.indice))
        .reduce((n, d) => n + d.celulas.filter((c) => substituir || !c.jaExiste).length, 0)
    : 0;
  // Autoria medida em $0,197/módulo (Sonnet 4.6); auditora GPT-5.4 ~$0,08, fora do batch.
  const custoAudit = auditar ? aGerar * 0.08 : 0;
  const custoEstimado = (aGerar * 0.197 + custoAudit).toFixed(2);
  const custoBatch = (aGerar * 0.197 * 0.5 + custoAudit).toFixed(2);

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton href="/admin/vertho/modulos-base" />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen size={20} className="text-emerald-400" /> Importar manuscrito
        </h1>
        <p className="text-xs text-gray-500">
          Um manuscrito autoral em <strong className="text-gray-300">.docx</strong> vira Módulos-Base em lote. O nível está
          codificado no número do microbloco, então a separação é <strong className="text-gray-300">determinística</strong> — nenhuma
          IA adivinha. Cada descritor rende 3 módulos (N1→N2, N2→N3, N3→N4).
        </p>
      </div>

      {/* ── 1. Upload ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4 mb-5">
        <p className="text-[10px] uppercase tracking-widest text-emerald-300 mb-2 flex items-center gap-1.5"><Upload size={13} /> 1. Manuscrito</p>

        <label className="block text-[11px] text-gray-400 mb-1">Competência da empresa (vazio = catálogo canônico)</label>
        <select value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); reset(); }}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none mb-3">
          <option value="">— catálogo canônico (competencias_base) —</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>

        <div className="flex items-center gap-2 flex-wrap">
          <input type="file" accept=".docx" disabled={analisando}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleArquivo(f); e.currentTarget.value = ''; }}
            className="text-xs text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-400/15 file:text-emerald-200 file:text-xs file:font-semibold disabled:opacity-50" />
          <button onClick={handleAnalisar} disabled={!b64 || analisando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
            {analisando ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Analisar manuscrito
          </button>
          <span className="text-[10px] text-gray-500">análise não gasta IA</span>
        </div>
      </div>

      {/* ── 2. Preview ────────────────────────────────────────────────────── */}
      {preview && !jobId && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-5">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">2. Preview</p>

          <div className="mb-3">
            <p className="text-sm font-bold text-white">{preview.titulo}</p>
            <p className="text-[11px] text-gray-500">{preview.subtitulo}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              <span className="text-emerald-300 font-mono">{preview.cod_comp}</span> · {preview.cargoManuscrito} ·{' '}
              {preview.stats.totalMicroblocos} microblocos · {preview.stats.totalDescritores} descritores ·{' '}
              {(preview.stats.charsUteis / 1000).toFixed(0)}k chars úteis
            </p>
          </div>

          {preview.avisos.length > 0 && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-500/5 p-2.5 mb-3">
              {preview.avisos.map((a, i) => (
                <p key={i} className="text-[11px] text-amber-200 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{a}</p>
              ))}
            </div>
          )}

          <label className="block text-[11px] text-gray-400 mb-1">
            Termo canônico — como a autora deve nomear o profissional. Sem isto ela alterna sinônimos entre módulos.
          </label>
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder='ex.: "o técnico"'
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none mb-3" />

          {/* Matriz descritor × transição */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] mb-1">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1.5 pr-2 font-medium w-6"></th>
                  <th className="py-1.5 pr-2 font-medium">Descritor</th>
                  <th className="py-1.5 pr-2 font-medium">Banco</th>
                  {['N1→N2', 'N2→N3', 'N3→N4'].map((t) => <th key={t} className="py-1.5 px-2 font-medium text-center">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.descritores.map((d) => (
                  <tr key={d.indice} className="border-t border-white/5">
                    <td className="py-1.5">
                      <input type="checkbox" checked={selecionados.has(d.indice)}
                        onChange={(e) => setSelecionados((s) => {
                          const n = new Set(s); e.target.checked ? n.add(d.indice) : n.delete(d.indice); return n;
                        })} />
                    </td>
                    <td className="py-1.5 pr-2 text-gray-200">{d.descritorManuscrito}</td>
                    <td className="py-1.5 pr-2 text-gray-500">
                      <span className="font-mono text-[10px]">{d.cod_desc}</span>
                      {!d.matchExato && <span className="ml-1 text-amber-300" title={`banco: ${d.descritorBanco}`}>≠</span>}
                    </td>
                    {d.celulas.map((c) => (
                      <td key={`${c.nivel_entrada}${c.nivel_destino}`} className="py-1.5 px-2 text-center">
                        {c.jaExiste && !substituir
                          ? <span className="text-gray-600" title="já existe — será pulado">—</span>
                          : <span className="text-emerald-300" title={`${(c.chars / 1000).toFixed(0)}k chars · ${c.microblocos.join(', ')}`}>
                              {(c.chars / 1000).toFixed(0)}k
                            </span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-600 mb-3">— = módulo já existe para essa transição · ≠ = nome do descritor diverge do banco (casado pela ordem)</p>

          {preview.jaExistem > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-gray-300 mb-3">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
              Regerar os {preview.jaExistem} módulo(s) que já existem
            </label>
          )}

          <label className="flex items-center gap-2 text-[11px] text-gray-300 mb-3">
            <input type="checkbox" checked={auditar} onChange={(e) => setAuditar(e.target.checked)} />
            Auditoria Dual-IA (GPT-5.4) ao final — auditados sobem de rascunho para revisão
          </label>

          {preview.recursos.length > 0 && (
            <p className="text-[11px] text-gray-500 mb-3 flex items-center gap-1.5">
              <Link2 size={12} /> {preview.recursos.length} recursos externos no apêndice (importação separada)
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleGerar} disabled={!aGerar}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              <Play size={14} /> Gerar {aGerar} Módulo{aGerar === 1 ? '' : 's'}-Base
            </button>
            <span className="text-[10px] text-gray-500">
              ~US$ {custoBatch} em lote (US$ {custoEstimado} se o batch falhar e cair no síncrono) · ~{Math.round(aGerar * 3.7)} min
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Progresso ──────────────────────────────────────────────────── */}
      {jobId && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-400">3. Geração</p>
            {statusJob === 'running' && (
              <button onClick={handleCancelar} className="flex items-center gap-1 text-[11px] text-red-300 hover:text-red-200">
                <XCircle size={12} /> Cancelar
              </button>
            )}
          </div>

          {prog && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all"
                    style={{ width: `${prog.total ? (100 * prog.done) / prog.total : 0}%` }} />
                </div>
                <span className="text-[11px] text-gray-400 tabular-nums">{prog.done}/{prog.total}</span>
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                {statusJob === 'running' && <Loader2 size={11} className="inline animate-spin mr-1" />}
                {prog.current}
                {!!prog.pulados && ` · ${prog.pulados} pulado(s)`}
              </p>
            </>
          )}

          {resultados.length > 0 && (
            <div className="space-y-1">
              {resultados.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {r.ok
                    ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    : <XCircle size={12} className="text-red-400 shrink-0" />}
                  <span className="text-gray-300">{r.modulo}</span>
                  {r.ok && r.id && (
                    <a href={`/admin/vertho/modulos-base/${r.id}`} target="_blank" rel="noreferrer"
                      className="text-emerald-300 hover:underline">abrir</a>
                  )}
                  {!r.ok && <span className="text-red-300">{r.error}</span>}
                </div>
              ))}
            </div>
          )}

          {statusJob && statusJob !== 'running' && (
            <button onClick={() => { reset(); setB64(''); setFilename(''); }}
              className="mt-4 px-3 py-1.5 rounded-lg text-[11px] text-gray-300 border border-white/10 hover:bg-white/5">
              Importar outro manuscrito
            </button>
          )}
        </div>
      )}
    </div>
  );
}
