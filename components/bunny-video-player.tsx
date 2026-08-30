'use client';

import { useEffect, useRef } from 'react';
import { registrarVideoWatched } from '@/actions/video-tracking';

/**
 * Player Bunny reutilizável.
 *
 * O mesmo player vive no modal legado e na experiência interna de conteúdo.
 * Manter o tracking aqui evita que abrir o vídeo pela nova tela deixe de contar
 * início/conclusão enquanto o modal antigo continue contando.
 */
const PLAYERJS_CDN = 'https://cdn.embed.ly/player-0.1.0.min.js';

function loadPlayerJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as any).playerjs) return Promise.resolve((window as any).playerjs);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAYERJS_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).playerjs));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = PLAYERJS_CDN;
    script.async = true;
    script.onload = () => resolve((window as any).playerjs);
    script.onerror = () => reject(new Error('falha ao carregar player.js'));
    document.body.appendChild(script);
  });
}

export interface BunnyVideoPlayerProps {
  libraryId: string | number;
  videoId: string;
  title?: string;
  colaboradorId?: string | null;
  autoplay?: boolean;
  className?: string;
}

export function BunnyVideoPlayer({
  libraryId,
  videoId,
  title,
  colaboradorId,
  autoplay = false,
  className = 'absolute inset-0 h-full w-full border-0',
}: BunnyVideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const durationRef = useRef(0);
  const timeRef = useRef(0);

  const metaParam = colaboradorId ? `&metaData=colab-${encodeURIComponent(colaboradorId)}` : '';
  const src = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=${autoplay ? 'true' : 'false'}&loop=false&muted=false&preload=true&responsive=true${metaParam}`;

  useEffect(() => {
    if (!colaboradorId || !videoId) return;

    startedRef.current = false;
    finishedRef.current = false;
    durationRef.current = 0;
    timeRef.current = 0;

    let cancelled = false;
    let player: any = null;

    function setupPlayer(playerJs: any) {
      if (cancelled || !iframeRef.current) return;
      try {
        player = new playerJs.Player(iframeRef.current);
      } catch (error) {
        console.error('[BunnyVideoPlayer] erro ao instanciar Player:', error);
        return;
      }

      player.on('ready', () => {
        player.getDuration((duration: any) => {
          durationRef.current = Number(duration) || 0;
        });

        player.on('play', () => {
          if (startedRef.current) return;
          startedRef.current = true;
          registrarVideoWatched({
            colaboradorId,
            videoId,
            eventType: 'play_started',
            secondsWatched: Math.round(timeRef.current),
            videoLength: Math.round(durationRef.current),
          }).catch(() => {});
        });

        player.on('timeupdate', ({ seconds, duration }: { seconds?: number; duration?: number } = {}) => {
          if (Number.isFinite(seconds)) timeRef.current = seconds as number;
          if (Number.isFinite(duration)) durationRef.current = duration as number;
        });

        player.on('ended', () => {
          if (finishedRef.current) return;
          finishedRef.current = true;
          const duration = Math.round(durationRef.current || timeRef.current);
          registrarVideoWatched({
            colaboradorId,
            videoId,
            eventType: 'play_finished',
            secondsWatched: duration,
            videoLength: duration,
          }).catch(() => {});
        });
      });
    }

    loadPlayerJs()
      .then((playerJs) => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        if (iframe.contentWindow) setupPlayer(playerJs);
        else iframe.addEventListener('load', () => setupPlayer(playerJs), { once: true });
      })
      .catch((error) => console.warn('[BunnyVideoPlayer] player.js load falhou:', error));

    return () => {
      cancelled = true;
      if (!player) return;
      try { player.off('play'); } catch {}
      try { player.off('ended'); } catch {}
      try { player.off('timeupdate'); } catch {}
      try { player.off('ready'); } catch {}
    };
  }, [colaboradorId, videoId]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      loading="eager"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className={className}
      title={title || 'Vídeo'}
    />
  );
}
