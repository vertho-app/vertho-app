'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { registrarVideoWatched } from '@/actions/video-tracking';

/**
 * Tracking de play/ended de um iframe Bunny Stream (protocolo player.js da Embedly),
 * gravando play_started/play_finished em videos_watched. Extraído do VideoModal pra
 * reuso (ex.: card de vídeo personalizado na tela da semana).
 *
 * O iframe deve ser /embed/ do Bunny e ter `ref` ligado ao `iframeRef`. Tracking só
 * roda quando colaboradorId e videoId estão definidos.
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
    const s = document.createElement('script');
    s.src = PLAYERJS_CDN; s.async = true;
    s.onload = () => resolve((window as any).playerjs);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function useBunnyTracking(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  colaboradorId?: string | null,
  videoId?: string | null,
  sessionKey?: string | number,
) {
  useEffect(() => {
    if (!iframeRef.current) return;
    // semana vem do metaData do embed (trilha-X_semana-N) — evita prop extra na página.
    const semana = (() => { const m = (iframeRef.current.src || '').match(/semana-(\d+)/); return m ? Number(m[1]) : null; })();
    let cancelled = false;
    let player: any = null;
    let started = false, finished = false, dur = 0, time = 0, ultimoMarco = 0;

    // Loga % assistido em marcos de 25% (25/50/75) — sem spam, pra ter progresso
    // de quem NÃO termina o vídeo (o 'ended' cobre os que terminam).
    function marcarProgresso() {
      if (finished || dur <= 0) return;
      const marco = Math.floor(((time / dur) * 100) / 25) * 25;
      if (marco > ultimoMarco && marco >= 25 && marco < 100) {
        ultimoMarco = marco;
        registrarVideoWatched({ colaboradorId, videoId, eventType: 'play_progress', secondsWatched: Math.round(time), videoLength: Math.round(dur), semana }).catch(() => {});
      }
    }

    function setup(pj: any) {
      if (cancelled || !iframeRef.current) return;
      try { player = new pj.Player(iframeRef.current); } catch { return; }
      player.on('ready', () => {
        // O Bunny pode restaurar a posição da sessão anterior. Cada montagem do
        // player representa uma nova abertura e deve começar em 00:00.
        try { player.setCurrentTime(0)?.catch?.(() => {}); } catch { /* player antigo sem seek */ }
        time = 0;
        if (!colaboradorId || !videoId) return;
        player.getDuration((d: any) => { dur = Number(d) || 0; });
        player.on('play', () => {
          if (started) return; started = true;
          registrarVideoWatched({ colaboradorId, videoId, eventType: 'play_started', secondsWatched: Math.round(time), videoLength: Math.round(dur), semana }).catch(() => {});
        });
        player.on('timeupdate', ({ seconds, duration }: { seconds?: number; duration?: number } = {}) => {
          if (Number.isFinite(seconds)) time = seconds as number;
          if (Number.isFinite(duration)) dur = duration as number;
          marcarProgresso();
        });
        player.on('ended', () => {
          if (finished) return; finished = true;
          const d = Math.round(dur || time);
          registrarVideoWatched({ colaboradorId, videoId, eventType: 'play_finished', secondsWatched: d, videoLength: d, semana }).catch(() => {});
        });
      });
    }

    loadPlayerJs().then((pj) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      if (iframe.contentWindow) setup(pj);
      else iframe.addEventListener('load', () => setup(pj), { once: true });
    }).catch(() => {});

    return () => {
      cancelled = true;
      // Flush: se começou e não terminou, registra até onde assistiu (SPA nav / fechou).
      if (started && !finished && time > 0 && dur > 0) {
        registrarVideoWatched({ colaboradorId, videoId, eventType: 'play_progress', secondsWatched: Math.round(time), videoLength: Math.round(dur), semana }).catch(() => {});
      }
      if (player) ['play', 'ended', 'timeupdate', 'ready'].forEach((e) => { try { player.off(e); } catch {} });
    };
  }, [colaboradorId, videoId, sessionKey]);
}
