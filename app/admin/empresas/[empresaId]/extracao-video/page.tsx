'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Film, Sparkles, FileText, CheckCircle2, Clock, AlertCircle, Send, Layers, ExternalLink } from 'lucide-react';
import BackButton from '@/components/back-button';
import { extrairVideo, gerarModuloBaseDoVideo, submeterExtracaoAsync, listarExtracoesAndamento } from '@/actions/extracao-video';

export default function ExtracaoVideoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  // Síncrono (YouTube / .mp4): extrai → revisa texto-base → gera módulo-base.
  const [url, setUrl] = useState('');
  const [extraindo, setExtraindo] = useState(false);
  const [base, setBase] = useState<any>(null);
  const [escopoGlobal, setEscopoGlobal] = useState(false); // false = exclusivo desta empresa
  const [gerando, setGerando] = useState(false);
  const [modulo, setModulo] = useState<{ id: string; competencia?: string; transicao?: string } | null>(null);
  const [toast, setToast] = useState('');

  // Assíncrono (Vimeo/TED/LMS/longos): só a URL + alcance.
  const [urlAsync, setUrlAsync] = useState('');
  const [escopoGlobalAsync, setEscopoGlobalAsync] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [extracoes, setExtracoes] = useState<any[]>([]);

  function carregarExtracoes() {
    listarExtracoesAndamento(empresaId).then((r) => setExtracoes(r.data || []));
  }

  useEffect(() => {
    carregarExtracoes();
    const t = setInterval(carregarExtracoes, 15000); // poll de status
    return () => clearInterval(t);
  }, [empresaId]);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(''), 4000); }

  async function handleExtrair() {
    if (!url.trim()) { flash('Informe a URL do vídeo'); return; }
    setExtraindo(true); setBase(null); setModulo(null);
    const r = await extrairVideo(empresaId, url.trim());
    setExtraindo(false);
    if (r.error) { flash(r.error); return; }
    setBase(r.data);
  }

  async function handleGerarModulo() {
    if (!base?.texto_base) return;
    setGerando(true);
    const r = await gerarModuloBaseDoVideo(empresaId, {
      url: url.trim(), titulo: base.titulo, texto_base: base.texto_base,
      locale: base.locale, escopoGlobal,
    });
    setGerando(false);
    if (r.error) { flash(r.error); return; }
    setModulo({ id: r.moduloId!, competencia: r.competencia, transicao: r.transicao });
    flash('Módulo-base rascunho criado');
  }

  async function handleSubmeterAsync() {
    if (!urlAsync.trim()) { flash('Informe a URL do vídeo'); return; }
    setSubmetendo(true);
    const r = await submeterExtracaoAsync(empresaId, urlAsync.trim(), escopoGlobalAsync);
    setSubmetendo(false);
    if (r.error) { flash(r.error); return; }
    flash('Extração iniciada em background');
    setUrlAsync('');
    carregarExtracoes();
  }

  // Seletor de alcance reutilizável.
  function SeletorAlcance({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => onChange(false)}
          className={`flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${!value ? 'border-teal-400/50 bg-teal-500/10 text-teal-200' : 'border-white/10 text-gray-400'}`}>
          Exclusivo desta empresa
        </button>
        <button type="button" onClick={() => onChange(true)}
          className={`flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${value ? 'border-teal-400/50 bg-teal-500/10 text-teal-200' : 'border-white/10 text-gray-400'}`}>
          Global (canônico — todos os tenants)
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      <BackButton onClick={() => router.back()} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Film size={20} className="text-purple-400" /> Extração de conteúdo de vídeo</h1>
        <p className="text-xs text-gray-500">Reaproveite vídeos como matéria-prima: extraímos um texto-base e a IA estrutura um <strong className="text-gray-300">Módulo-Base rascunho</strong> (revisado e publicado em Módulos-Base de Conteúdo).</p>
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
        <p className="text-[10px] text-gray-600 mt-1.5">Você revisa o texto-base antes de gerar o módulo. O vídeo não é re-hospedado — guardamos só o link.</p>
      </div>

      {/* Extração em background (Vimeo/TED/LMS ou vídeos longos) */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 mb-5">
        <p className="text-[10px] uppercase tracking-widest text-amber-300 mb-1 flex items-center gap-1.5"><Clock size={13} /> Outra plataforma (Vimeo, TED, LMS) ou vídeo longo — processar em background</p>
        <p className="text-[10px] text-gray-500 mb-2">Cole a URL e escolha o alcance: o conteúdo é extraído em segundo plano, a IA detecta competência canônica + níveis e cria o módulo-base rascunho. Aparece pronto na lista abaixo.</p>
        <input value={urlAsync} onChange={(e) => setUrlAsync(e.target.value)} placeholder="https://vimeo.com/... ou ted.com/talks/..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        <SeletorAlcance value={escopoGlobalAsync} onChange={setEscopoGlobalAsync} />
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
                <span className="text-gray-300 truncate flex-1">{e.titulo || e.url}{e.escopo_global ? ' · global' : ' · empresa'}</span>
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

      {/* Resultado da extração síncrona */}
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

          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Alcance do módulo-base</p>
            <SeletorAlcance value={escopoGlobal} onChange={setEscopoGlobal} />
            <p className="text-[10px] text-gray-600 mt-1.5">A IA detecta a competência canônica e a transição de nível ao estruturar o módulo. Ele nasce como rascunho para revisão.</p>
          </div>

          {!modulo ? (
            <button onClick={handleGerarModulo} disabled={gerando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {gerando ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
              {gerando ? 'Estruturando módulo...' : 'Gerar módulo-base (rascunho)'}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 size={14} /> Módulo-base rascunho criado{modulo.competencia ? ` · ${modulo.competencia} ${modulo.transicao || ''}` : ''}</p>
              <Link href={`/admin/vertho/modulos-base/${modulo.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10">
                <FileText size={12} /> Abrir módulo para revisar <ExternalLink size={11} />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
