'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Film, Sparkles, Save, FileText, Headphones, CheckCircle2, Clock, AlertCircle, Send } from 'lucide-react';
import BackButton from '@/components/back-button';
import { extrairVideo, salvarVideoExtraido, gerarComplementoDoVideo, loadCompetenciasDescritores, submeterExtracaoAsync, listarExtracoesAndamento } from '@/actions/extracao-video';

export default function ExtracaoVideoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [extraindo, setExtraindo] = useState(false);
  const [base, setBase] = useState<any>(null);
  const [comp, setComp] = useState('');
  const [desc, setDesc] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [comps, setComps] = useState<{ competencia: string; descritores: string[] }[]>([]);

  // Async (background): URL/competência/descritor próprios + lista de status.
  const [urlAsync, setUrlAsync] = useState('');
  const [compAsync, setCompAsync] = useState('');
  const [descAsync, setDescAsync] = useState('');
  const [submetendo, setSubmetendo] = useState(false);
  const [extracoes, setExtracoes] = useState<any[]>([]);

  function carregarExtracoes() {
    listarExtracoesAndamento(empresaId).then((r) => setExtracoes(r.data || []));
  }

  useEffect(() => {
    loadCompetenciasDescritores(empresaId).then((r) => setComps(r.data || []));
    carregarExtracoes();
    const t = setInterval(carregarExtracoes, 15000); // poll de status
    return () => clearInterval(t);
  }, [empresaId]);

  const descritoresDaComp = comps.find((c) => c.competencia === comp)?.descritores || [];
  const descritoresAsync = comps.find((c) => c.competencia === compAsync)?.descritores || [];

  async function handleSubmeterAsync() {
    if (!urlAsync.trim()) { flash('Informe a URL do vídeo'); return; }
    if (!compAsync || !descAsync) { flash('Escolha competência e descritor'); return; }
    setSubmetendo(true);
    const r = await submeterExtracaoAsync(empresaId, urlAsync.trim(), compAsync, descAsync);
    setSubmetendo(false);
    if (r.error) { flash(r.error); return; }
    flash('Extração iniciada em background');
    setUrlAsync(''); setCompAsync(''); setDescAsync('');
    carregarExtracoes();
  }

  function flash(m: string) { setToast(m); setTimeout(() => setToast(''), 4000); }

  async function handleExtrair() {
    if (!url.trim()) { flash('Informe a URL do vídeo'); return; }
    setExtraindo(true); setBase(null); setSavedId(null);
    const r = await extrairVideo(empresaId, url.trim());
    setExtraindo(false);
    if (r.error) { flash(r.error); return; }
    setBase(r.data);
    // Pré-seleciona a sugestão da IA se ela casar com uma competência/descritor existente.
    const sug = comps.find((c) => c.competencia.toLowerCase() === String(r.data.competencia_sugerida || '').toLowerCase());
    setComp(sug?.competencia || '');
    const sugDesc = sug?.descritores.find((d) => d.toLowerCase() === String(r.data.descritor_sugerido || '').toLowerCase());
    setDesc(sugDesc || '');
  }

  async function handleSalvar() {
    if (!comp || !desc) { flash('Selecione competência e descritor'); return; }
    setSalvando(true);
    const r = await salvarVideoExtraido(empresaId, {
      url: url.trim(), titulo: base.titulo, resumo: base.resumo, texto_base: base.texto_base,
      competencia: comp.trim() || null, descritor: desc.trim() || null, duracao_min: base.duracao_min,
    });
    setSalvando(false);
    if (r.error) { flash(r.error); return; }
    setSavedId(r.id);
    flash('Vídeo salvo na biblioteca');
  }

  async function handleComplemento(formato: 'texto' | 'audio') {
    if (!savedId) return;
    setGerando(formato);
    const r = await gerarComplementoDoVideo(savedId, formato);
    setGerando(null);
    flash(r.error ? r.error : `Complemento (${formato === 'audio' ? 'podcast' : 'texto'}) gerado`);
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      <BackButton onClick={() => router.back()} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Film size={20} className="text-purple-400" /> Extração de conteúdo de vídeo</h1>
        <p className="text-xs text-gray-500">Reaproveite vídeos que a empresa já tem: extraímos um texto-base e geramos os micro-conteúdos complementares.</p>
      </div>

      {/* URL síncrona (YouTube / .mp4 direto) — extrai na hora */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-5">
        <label className="text-[10px] uppercase tracking-widest text-gray-500">YouTube ou link direto .mp4 — extração na hora</label>
        <div className="flex gap-2 mt-1.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500" />
          <button onClick={handleExtrair} disabled={extraindo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}>
            {extraindo ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {extraindo ? 'Extraindo...' : 'Extrair'}
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">Você revisa o texto-base antes de salvar. O vídeo não é re-hospedado — guardamos só o link.</p>
      </div>

      {/* Extração em background (Vimeo/TED/LMS ou vídeos longos) */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 mb-5">
        <p className="text-[10px] uppercase tracking-widest text-amber-300 mb-1 flex items-center gap-1.5"><Clock size={13} /> Outra plataforma (Vimeo, TED, LMS) ou vídeo longo — processar em background</p>
        <p className="text-[10px] text-gray-500 mb-2">Escolha competência e descritor; o conteúdo é extraído em segundo plano e aparece pronto na lista abaixo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={urlAsync} onChange={(e) => setUrlAsync(e.target.value)} placeholder="https://vimeo.com/... ou ted.com/talks/..."
            className="sm:col-span-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          <select value={compAsync} onChange={(e) => { setCompAsync(e.target.value); setDescAsync(''); }}
            className="bg-[#091D35] border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none">
            <option value="">Competência…</option>
            {comps.map((c) => <option key={c.competencia} value={c.competencia}>{c.competencia}</option>)}
          </select>
          <select value={descAsync} onChange={(e) => setDescAsync(e.target.value)} disabled={!compAsync}
            className="bg-[#091D35] border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none disabled:opacity-50">
            <option value="">Descritor…</option>
            {descritoresAsync.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button onClick={handleSubmeterAsync} disabled={submetendo}
          className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #D97706, #B45309)' }}>
          {submetendo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Processar em background
        </button>

        {extracoes.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {extracoes.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5" style={{ background: '#091D35' }}>
                {e.extracao_status === 'processing' && <Loader2 size={12} className="animate-spin text-amber-400 shrink-0" />}
                {e.extracao_status === 'done' && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                {e.extracao_status === 'error' && <AlertCircle size={12} className="text-red-400 shrink-0" />}
                <span className="text-gray-300 truncate flex-1">{e.titulo} · {e.competencia} › {e.descritor}</span>
                <span className={`shrink-0 ${e.extracao_status === 'done' ? 'text-emerald-400' : e.extracao_status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                  {e.extracao_status === 'processing' ? 'processando' : e.extracao_status === 'done' ? 'pronto' : 'erro'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resultado */}
      {base && (
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/5 p-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-purple-300 mb-1">Título</p>
            <input value={base.titulo} onChange={(e) => setBase({ ...base, titulo: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </div>
          {base.resumo && <p className="text-xs text-gray-400">{base.resumo}{base.duracao_min ? ` · ~${base.duracao_min} min` : ''}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Competência</p>
              <select value={comp} onChange={(e) => { setComp(e.target.value); setDesc(''); }}
                className="w-full bg-[#091D35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                <option value="">— selecione —</option>
                {comps.map((c) => <option key={c.competencia} value={c.competencia}>{c.competencia}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Descritor</p>
              <select value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!comp}
                className="w-full bg-[#091D35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-50">
                <option value="">{comp ? '— selecione —' : '(escolha a competência)'}</option>
                {descritoresDaComp.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {base.competencia_sugerida && (
            <p className="text-[10px] text-gray-500">Sugestão da IA: {base.competencia_sugerida}{base.descritor_sugerido ? ` › ${base.descritor_sugerido}` : ''}</p>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Texto-base (matéria-prima — editável)</p>
            <textarea value={base.texto_base} onChange={(e) => setBase({ ...base, texto_base: e.target.value })} rows={12}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono outline-none" />
          </div>

          {!savedId ? (
            <button onClick={handleSalvar} disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar na biblioteca
            </button>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 size={14} /> Salvo · gere os complementos:</p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => handleComplemento('texto')} disabled={gerando !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50">
                  {gerando === 'texto' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Complemento em texto
                </button>
                <button onClick={() => handleComplemento('audio')} disabled={gerando !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 border border-amber-400/30 hover:bg-amber-400/10 disabled:opacity-50">
                  {gerando === 'audio' ? <Loader2 size={12} className="animate-spin" /> : <Headphones size={12} />} Complemento em podcast
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
