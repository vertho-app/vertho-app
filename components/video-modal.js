'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { registrarVideoWatched } from '@/actions/video-tracking';

/**
 * Modal que abre um vídeo hospedado no Bunny Stream dentro de um iframe.
 *
 * Tracking de play/ended:
 * O iframe do Bunny (Plyr) não emite postMessage por padrão. Usamos a
 * biblioteca player.js (protocolo oficial de embeds) carregada via CDN
 * pra conversar com o iframe e escutar os eventos. Quando `colaboradorId`
 * é passado, cada play_started/play_finished gera 1 row em videos_watched.
 */
const PLAYERJS_CDN = 'https://cdn.jsdelivr.net/npm/player.js@0.1.0/dist/player.min.js';

function loadPlayerJs() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.playerjs) return Promise.resolve(window.playerjs);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAYERJS_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.playerjs));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = PLAYERJS_CDN;
    script.async = true;
    script.onload = () => resolve(window.playerjs);
    script.onerror = () => reject(new Error('falha ao carregar player.js'));
    document.body.appendChild(script);
  });
}

export default function VideoModal({ libraryId, videoId, title, onClose, colaboradorId }) {
  const iframeRef = useRef(null);
  const playerRef = useRef(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const durationRef = useRef(0);
  const timeRef = useRef(0);
  const openedAtRef = useRef(Date.now());

  // Fecha com ESC e trava scroll do body enquanto aberto
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Removemos o fallback "session_end por tempo de modal" porque ele conta
  // pausa/abas em segundo plano como assistido. Só gravamos eventos reais
  // vindos do player (via player.js). Se o player não emitir, a tabela
  // fica vazia — preferível a dado mentiroso.

  // metaData é passado pro Bunny e retorna nos eventos de status (não de play).
  // Usamos pra manter atribuição futura se a API mudar.
  const metaParam = colaboradorId ? `&metaData=colab-${encodeURIComponent(colaboradorId)}` : '';
  const src = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=true&loop=false&muted=false&preload=true&responsive=true${metaParam}`;

  // ─── Tracking via player.js (comunicação iframe ↔ pai) ────────────────
  useEffect(() => {
    if (!colaboradorId || !videoId) return;
    startedRef.current = false;
    finishedRef.current = false;
    durationRef.current = 0;
    timeRef.current = 0;
    let cancelled = false;
    let player = null;

    function setupPlayer(pj) {
      if (cancelled || !iframeRef.current) return;
      console.log('[VideoModal] player.js carregado, instanciando Player...');
      try {
        player = new pj.Player(iframeRef.current);
      } catch (e) {
        console.error('[VideoModal] erro ao instanciar Player:', e);
        return;
      }
      playerRef.current = player;

      const timeoutReady = setTimeout(() => {
        console.warn('[VideoModal] player.js: evento "ready" não chegou em 10s — iframe não responde ao protocolo player.js');
      }, 10_000);

      player.on('ready', () => {
        clearTimeout(timeoutReady);
        console.log('[VideoModal] player.js: ready ✓');
        player.getDuration(d => {
          durationRef.current = Number(d) || 0;
          console.log('[VideoModal] player.js: duration =', d);
        });

        player.on('play', () => {
          console.log('[VideoModal] player.js: play');
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

        player.on('timeupdate', ({ seconds, duration } = {}) => {
          if (Number.isFinite(seconds)) timeRef.current = seconds;
          if (Number.isFinite(duration)) durationRef.current = duration;
        });

        player.on('ended', () => {
          console.log('[VideoModal] player.js: ended');
          if (finishedRef.current) return;
          finishedRef.current = true;
          const dur = Math.round(durationRef.current || timeRef.current);
          registrarVideoWatched({
            colaboradorId,
            videoId,
            eventType: 'play_finished',
            secondsWatched: dur,
            videoLength: dur,
          }).catch(() => {});
        });
      });
    }

    loadPlayerJs()
      .then(pj => {
        // Espera iframe carregar pra garantir que o Player consegue conversar
        const iframe = iframeRef.current;
        if (!iframe) return;
        if (iframe.contentWindow) {
          setupPlayer(pj);
        } else {
          iframe.addEventListener('load', () => setupPlayer(pj), { once: true });
        }
      })
      .catch(err => console.warn('[VideoModal] player.js load falhou:', err));

    return () => {
      cancelled = true;
      if (player) {
        try { player.off('play'); } catch {}
        try { player.off('ended'); } catch {}
        try { player.off('timeupdate'); } catch {}
        try { player.off('ready'); } catch {}
      }
    };
  }, [colaboradorId, videoId]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8"
      style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-[1100px] rounded-2xl overflow-hidden border border-white/10"
        style={{ background: '#0A1D35', boxShadow: '0 0 60px rgba(0,180,216,0.15)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-white truncate">{title || 'Vídeo'}</p>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            ref={iframeRef}
            src={src}
            loading="lazy"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            title={title || 'Vídeo'}
          />
        </div>
      </div>
    </div>
  );
}
