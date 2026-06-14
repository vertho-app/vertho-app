'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles, FileText, CheckCircle2, Clock, AlertCircle, Send, Layers, ExternalLink, Upload } from 'lucide-react';
import { extrairVideo, gerarModuloBaseDoVideo, submeterExtracaoAsync, listarExtracoesAndamento, extrairModulosDeMaterial } from '@/actions/extracao-video';

/**
 * Painel de extração de vídeo → Módulo-Base, compartilhado por:
 *  - tela da empresa (`origemEmpresaId` setado; alcance = esta empresa | global)
 *  - tela Vertho de Módulos-Base (`modoVertho`; alcance = global | empresa do picker)
 *
 * `escopoEmpresaId` (alvo do módulo, null=global) é separado de `origemEmpresaId`
 * (de onde foi disparado, p/ listar). O resultado é sempre módulo-base rascunho.
 */
export default function ExtracaoVideoPanel({
  origemEmpresaId = null,
  nomeEmpresaContexto,
  modoVertho = false,
  empresas = [],
}: {
  origemEmpresaId?: string | null;
  nomeEmpresaContexto?: string;
  modoVertho?: boolean;
  empresas?: { id: string; nome: string }[];
}) {
  // Alcance: 'global' (canônico) | 'empresa' (exclusivo).
  const [alcance, setAlcance] = useState<'global' | 'empresa'>(modoVertho ? 'global' : 'empresa');
  const [empresaPick, setEmpresaPick] = useState<string>(''); // só no modo Vertho
  const escopoEmpresaId = alcance === 'global' ? null : (modoVertho ? (empresaPick || null) : origemEmpresaId);

  // Síncrono.
  const [url, setUrl] = useState('');
  const [extraindo, setExtraindo] = useState(false);
  const [base, setBase] = useState<any>(null);
  const [gerando, setGerando] = useState(false);
  const [modulosSync, setModulosSync] = useState<any[]>([]);
  const [toast, setToast] = useState('');

  // Assíncrono.
  const [urlAsync, setUrlAsync] = useState('');
  const [submetendo, setSubmetendo] = useState(false);
  const [extracoes, setExtracoes] = useState<any[]>([]);

  // Material (PDF/DOCX/TXT) — síncrono, mesmo pipeline.
  const [matNome, setMatNome] = useState('');
  const [processandoMat, setProcessandoMat] = useState(false);
  const [modulosMat, setModulosMat] = useState<any[]>([]);

  function carregarExtracoes() {
    listarExtracoesAndamento(origemEmpresaId).then((r) => setExtracoes(r.data || []));
  }
  useEffect(() => {
    carregarExtracoes();
    const t = setInterval(carregarExtracoes, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origemEmpresaId]);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(''), 4000); }

  async function handleExtrair() {
    if (!url.trim()) { flash('Informe a URL do vídeo'); return; }
    setExtraindo(true); setBase(null); setModulosSync([]);
    const r = await extrairVideo(escopoEmpresaId || origemEmpresaId, url.trim());
    setExtraindo(false);
    if (r.error) { flash(r.error); return; }
    setBase(r.data);
  }

  async function handleGerarModulo() {
    if (!base?.texto_base) return;
    if (modoVertho && alcance === 'empresa' && !empresaPick) { flash('Escolha a empresa do alcance'); return; }
    setGerando(true);
    const r = await gerarModuloBaseDoVideo(escopoEmpresaId, {
      url: url.trim(), titulo: base.titulo, texto_base: base.texto_base, locale: base.locale,
    });
    setGerando(false);
    if (r.error) { flash(r.error); return; }
    setModulosSync(r.modulos || []);
    flash(`${r.n} módulo(s) rascunho criado(s)`);
  }

  async function handleMaterial(file: File) {
    if (modoVertho && alcance === 'empresa' && !empresaPick) { flash('Escolha a empresa do alcance'); return; }
    if (file.size > 20 * 1024 * 1024) { flash('Arquivo > 20MB — divida ou comprima'); return; }
    setProcessandoMat(true); setModulosMat([]); setMatNome(file.name);
    try {
      const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      const r = await extrairModulosDeMaterial(escopoEmpresaId, { arquivoBase64: b64, filename: file.name, mime: file.type, locale: undefined });
      if (r.error) { flash(r.error); return; }
      setModulosMat(r.modulos || []);
      flash(`${r.n} módulo(s) criado(s) do material`);
    } finally {
      setProcessandoMat(false);
    }
  }

  async function handleSubmeterAsync() {
    if (!urlAsync.trim()) { flash('Informe a URL do vídeo'); return; }
    if (modoVertho && alcance === 'empresa' && !empresaPick) { flash('Escolha a empresa do alcance'); return; }
    setSubmetendo(true);
    const r = await submeterExtracaoAsync(origemEmpresaId, urlAsync.trim(), escopoEmpresaId);
    setSubmetendo(false);
    if (r.error) { flash(r.error); return; }
    flash('Extração iniciada em background');
    setUrlAsync('');
    carregarExtracoes();
  }

  // Seletor de alcance.
  function SeletorAlcance() {
    return (
      <div className="mt-2">
        <div className="flex gap-2">
          {!modoVertho && (
            <button type="button" onClick={() => setAlcance('empresa')}
              className={`flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${alcance === 'empresa' ? 'border-teal-400/50 bg-teal-500/10 text-teal-200' : 'border-white/10 text-gray-400'}`}>
              Exclusivo {nomeEmpresaContexto ? `de ${nomeEmpresaContexto}` : 'desta empresa'}
            </button>
          )}
          <button type="button" onClick={() => setAlcance('global')}
            className={`flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${alcance === 'global' ? 'border-teal-400/50 bg-teal-500/10 text-teal-200' : 'border-white/10 text-gray-400'}`}>
            Global (canônico — todos os tenants)
          </button>
          {modoVertho && (
            <button type="button" onClick={() => setAlcance('empresa')}
              className={`flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${alcance === 'empresa' ? 'border-teal-400/50 bg-teal-500/10 text-teal-200' : 'border-white/10 text-gray-400'}`}>
              Empresa específica
            </button>
          )}
        </div>
        {modoVertho && alcance === 'empresa' && (
          <select value={empresaPick} onChange={(e) => setEmpresaPick(e.target.value)}
            className="mt-2 w-full bg-[#091D35] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none">
            <option value="">— escolha a empresa —</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
      </div>
    );
  }

  return (
    <div>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Síncrona (YouTube / .mp4) */}
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
        <SeletorAlcance />
        <p className="text-[10px] text-gray-600 mt-1.5">Você revisa o texto-base antes de gerar o módulo (no alcance escolhido). O vídeo não é re-hospedado — guardamos só o link.</p>
      </div>

      {/* Material (PDF/DOCX/TXT) — mesmo pipeline, síncrono */}
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 mb-5">
        <p className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1 flex items-center gap-1.5"><Upload size={13} /> Material (PDF, DOCX, TXT) — extrair na hora</p>
        <p className="text-[10px] text-gray-500 mb-2">Suba um material e o app faz o mesmo que com vídeo: extrai o texto, segmenta em temas e cria N módulos-base rascunho (a IA detecta competência canônica + níveis por tema).</p>
        <SeletorAlcance />
        <div className="mt-2 flex items-center gap-2">
          <input type="file" accept=".pdf,.docx,.txt,.md" disabled={processandoMat}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMaterial(f); e.currentTarget.value = ''; }}
            className="text-xs text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:text-cyan-200 file:text-xs file:font-semibold disabled:opacity-50" />
          {processandoMat && <span className="flex items-center gap-1.5 text-[11px] text-cyan-200"><Loader2 size={13} className="animate-spin" /> processando {matNome}…</span>}
        </div>
        {modulosMat.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={13} /> {modulosMat.length} módulo(s) rascunho criado(s):</p>
            {modulosMat.map((m) => (
              <Link key={m.id} href={`/admin/vertho/modulos-base/${m.id}`}
                className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5 hover:bg-white/[0.03]" style={{ background: '#091D35' }}>
                <FileText size={12} className="text-cyan-300 shrink-0" />
                <span className="text-gray-300 truncate flex-1">{m.competencia || 'módulo'} · {m.nivel_entrada}→{m.nivel_destino}</span>
                <ExternalLink size={11} className="text-cyan-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Assíncrona (Vimeo/TED/LMS/longos) */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 mb-5">
        <p className="text-[10px] uppercase tracking-widest text-amber-300 mb-1 flex items-center gap-1.5"><Clock size={13} /> Outra plataforma (Vimeo, TED, LMS) ou vídeo longo — processar em background</p>
        <p className="text-[10px] text-gray-500 mb-2">Cole a URL e escolha o alcance: o conteúdo é extraído em segundo plano, a IA detecta competência canônica + níveis e cria o módulo-base rascunho.</p>
        <input value={urlAsync} onChange={(e) => setUrlAsync(e.target.value)} placeholder="https://vimeo.com/... ou ted.com/talks/..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        <SeletorAlcance />
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
                {e.status === 'processing' && <Loader2 size={12} className="animate-spin text-amber-400 shrink-0" />}
                {e.status === 'done' && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                {e.status === 'error' && <AlertCircle size={12} className="text-red-400 shrink-0" />}
                <span className="text-gray-300 truncate flex-1">{e.titulo || e.url}{e.escopo_empresa_id ? ' · empresa' : ' · global'}{e.n_modulos > 1 ? ` · ${e.n_modulos} módulos` : ''}</span>
                {e.status === 'done' && e.modulo_base_id ? (
                  <Link href={`/admin/vertho/modulos-base/${e.modulo_base_id}`} className="shrink-0 text-emerald-300 flex items-center gap-1 hover:underline">
                    ver módulo <ExternalLink size={11} />
                  </Link>
                ) : (
                  <span className={`shrink-0 ${e.status === 'error' ? 'text-red-400' : 'text-amber-400'}`} title={e.error || ''}>
                    {e.status === 'processing' ? 'processando' : 'erro'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resultado síncrono */}
      {base && (
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/5 p-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-purple-300 mb-1">Título</p>
            <input value={base.titulo} onChange={(e) => setBase({ ...base, titulo: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </div>
          {base.resumo && <p className="text-xs text-gray-400">{base.resumo}{base.duracao_min ? ` · ~${base.duracao_min} min` : ''}</p>}

          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Texto-base (matéria-prima — editável)</p>
            <textarea value={base.texto_base} onChange={(e) => setBase({ ...base, texto_base: e.target.value })} rows={12}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono outline-none" />
          </div>

          <p className="text-[10px] text-gray-600">A IA detecta a competência canônica + descritor e a transição de nível, e pode gerar <strong className="text-gray-400">mais de um módulo</strong> se o conteúdo cobrir temas distintos (alcance: {alcance === 'global' ? 'global' : 'empresa'}). Nascem como rascunho para revisão.</p>

          {modulosSync.length === 0 ? (
            <button onClick={handleGerarModulo} disabled={gerando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {gerando ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
              {gerando ? 'Estruturando módulos...' : 'Gerar módulo(s)-base (rascunho)'}
            </button>
          ) : (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 size={14} /> {modulosSync.length} módulo(s) rascunho criado(s):</p>
              {modulosSync.map((m) => (
                <Link key={m.id} href={`/admin/vertho/modulos-base/${m.id}`}
                  className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5 hover:bg-white/[0.03]" style={{ background: '#091D35' }}>
                  <FileText size={12} className="text-cyan-300 shrink-0" />
                  <span className="text-gray-300 truncate flex-1">{m.competencia || 'módulo'} · {m.nivel_entrada}→{m.nivel_destino}</span>
                  <ExternalLink size={11} className="text-cyan-300 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
