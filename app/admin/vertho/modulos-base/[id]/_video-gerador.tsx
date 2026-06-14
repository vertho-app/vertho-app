'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Clapperboard, Loader2, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { dispararVideoDeModulo, listarVideosDoModulo } from '@/actions/gerar-video';

type VideoRow = {
  id: string;
  status: 'processing' | 'done' | 'error';
  etapa?: string | null;
  video_url?: string | null;
  bunny_video_id?: string | null;
  bunny_library?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

const ETAPA_LABEL: Record<string, string> = {
  roteiro: 'Gerando roteiro (IA)',
  narracao: 'Narrando as cenas (TTS)',
  avatar: 'Gerando o avatar (HeyGen) — pode levar ~4 min/clipe',
  render: 'Renderizando as cenas (Remotion)',
  upload: 'Finalizando e publicando',
};

export default function VideoGeradorCard({ moduloId, status }: { moduloId: string; status: string }) {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const pollRef = useRef<any>(null);

  const carregar = useCallback(async () => {
    const r = await listarVideosDoModulo(moduloId);
    setVideos((r.data || []) as VideoRow[]);
    setLoading(false);
  }, [moduloId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Polling enquanto houver vídeo em processamento.
  useEffect(() => {
    const temProc = videos.some((v) => v.status === 'processing');
    if (temProc && !pollRef.current) {
      pollRef.current = setInterval(carregar, 8000);
    } else if (!temProc && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current && !videos.some((v) => v.status === 'processing')) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [videos, carregar]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function gerar() {
    setErro(''); setGerando(true);
    const r = await dispararVideoDeModulo(moduloId);
    setGerando(false);
    if ((r as any)?.error) setErro((r as any).error);
    else carregar();
  }

  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.04] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Clapperboard size={16} className="text-violet-300" />
          <h2 className="text-sm font-bold text-white">Vídeo gerado</h2>
          <span className="text-[10px] text-white/40">avatar + cenas + narração própria</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} disabled={loading}
            className="p-2 rounded-lg border border-white/10 text-white/50 hover:bg-white/5" title="Atualizar">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={gerar} disabled={gerando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}>
            {gerando ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
            {gerando ? 'Disparando…' : 'Gerar vídeo'}
          </button>
        </div>
      </div>

      {status !== 'publicado' && (
        <p className="text-[11px] text-amber-200/80 mb-3 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Este módulo ainda não está publicado — gere o vídeo só depois de aprovar o conteúdo.
        </p>
      )}

      {erro && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-2.5 mb-3 text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{erro}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-white/50 text-xs py-3"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : videos.length === 0 ? (
        <p className="text-[12px] text-white/45 py-1">Nenhum vídeo gerado ainda. O pipeline leva ~6–12 min (roteiro → narração → avatar → render).</p>
      ) : (
        <ul className="space-y-2.5">
          {videos.map((v) => (
            <li key={v.id} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {v.status === 'processing' && <Loader2 size={13} className="animate-spin text-cyan-300 shrink-0" />}
                  <span className={`text-[11px] font-semibold ${
                    v.status === 'done' ? 'text-emerald-300' : v.status === 'error' ? 'text-red-300' : 'text-cyan-200'
                  }`}>
                    {v.status === 'done' ? 'Pronto' : v.status === 'error' ? 'Erro' : (ETAPA_LABEL[v.etapa || ''] || 'Processando')}
                  </span>
                </div>
                <span className="text-[10px] text-white/35 font-mono shrink-0">{new Date(v.updated_at).toLocaleString('pt-BR')}</span>
              </div>

              {v.status === 'error' && v.error && (
                <p className="text-[11px] text-red-200/80 mt-1.5 font-mono break-words">{v.error}</p>
              )}

              {v.status === 'done' && v.bunny_video_id && v.bunny_library && (
                <div className="mt-2.5">
                  <div className="relative w-full rounded-lg overflow-hidden border border-white/10" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={`https://iframe.mediadelivery.net/embed/${v.bunny_library}/${v.bunny_video_id}?autoplay=false`}
                      loading="lazy" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                  {v.video_url && (
                    <a href={v.video_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200 mt-1.5">
                      <ExternalLink size={11} /> Abrir no player
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
