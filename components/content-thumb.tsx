'use client';

import React from 'react';

export type ThumbFormato = 'video' | 'audio' | 'texto' | 'case';

const THEME: Record<ThumbFormato, {
  bg: string;
  border: string;
  accent: string;
  glyph: string;
  label: string;
}> = {
  video: {
    bg: 'radial-gradient(120% 80% at 20% 10%, rgba(154,226,230,.2), transparent 55%), linear-gradient(150deg,#0c2a4d,#072239)',
    border: 'rgba(154,226,230,.22)',
    accent: '#9AE2E6',
    glyph: '▸',
    label: 'Vídeo',
  },
  audio: {
    bg: 'radial-gradient(120% 80% at 80% 20%, rgba(225,170,240,.18), transparent 55%), linear-gradient(160deg,#281044,#0a0220)',
    border: 'rgba(225,170,240,.22)',
    accent: '#E1AAF0',
    glyph: '~',
    label: 'Áudio',
  },
  texto: {
    bg: 'radial-gradient(120% 80% at 10% 85%, rgba(45,212,191,.14), transparent 55%), linear-gradient(155deg,#092d2a,#02201e)',
    border: 'rgba(45,212,191,.22)',
    accent: '#5FD4C0',
    glyph: '¶',
    label: 'Leitura',
  },
  case: {
    bg: 'radial-gradient(120% 80% at 85% 15%, rgba(232,169,78,.16), transparent 60%), linear-gradient(150deg,#2a1c0a,#12100a)',
    border: 'rgba(232,169,78,.24)',
    accent: '#E8A94E',
    glyph: '§',
    label: 'Caso',
  },
};

interface ContentThumbProps {
  formato: ThumbFormato;
  /** Número do módulo/lição — ex: 4 vira "04" */
  ordem?: number | null;
  /** Duração formatada — ex: "08:42" ou "6 min" */
  duracao?: string | null;
  titulo?: string | null;
  /** ID do vídeo no Bunny — exibe thumb real por cima (duotone) */
  bunnyId?: string | null;
}

export function ContentThumb({
  formato,
  ordem,
  duracao,
  titulo,
  bunnyId,
}: ContentThumbProps) {
  const t = THEME[formato] ?? THEME.video;
  const isAudio = formato === 'audio';

  return (
    <div
      className="relative aspect-[1.25/1] rounded-[18px] overflow-hidden flex flex-col justify-between p-4"
      style={{ background: t.bg, border: `1px solid ${t.border}` }}
    >
      {/* Bunny thumbnail (duotone) para vídeos que têm asset */}
      {bunnyId && formato === 'video' && (
        <img
          src={`/api/bunny-thumb/${bunnyId}`}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover opacity-35 mix-blend-luminosity"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      {/* Header: glifo + tipo + duração */}
      <div
        className="relative z-10 flex items-center gap-2 text-[9.5px] font-semibold tracking-[.18em] uppercase"
        style={{ color: t.accent }}
      >
        <span style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 18, lineHeight: '.8' }}>
          {t.glyph}
        </span>
        <span>{t.label}</span>
        {duracao && (
          <span className="ml-auto px-2 py-[2px] rounded-full bg-white/10 border border-white/[.14] text-[9px] text-white/70 tracking-wider">
            {duracao}
          </span>
        )}
      </div>

      {/* Onda SVG — só para áudio */}
      {isAudio && <AudioWave color={t.accent} />}

      {/* Número em itálico — para todos exceto áudio */}
      {!isAudio && ordem != null && (
        <span
          className="absolute right-[-6px] bottom-[-18px] opacity-90 select-none"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'italic',
            fontSize: 108,
            lineHeight: '.85',
            letterSpacing: '-.04em',
            color: t.accent,
            textShadow: `0 0 24px ${t.accent}33`,
          }}
          aria-hidden
        >
          {String(ordem).padStart(2, '0')}
        </span>
      )}

      {/* Título (última palavra em itálico) */}
      {titulo && (
        <h3
          className="relative z-10 max-w-[70%] leading-tight"
          style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18 }}
        >
          <EmphasizedTitle text={titulo} color={t.accent} />
        </h3>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────

/** Coloca a última palavra em italic com a cor do tema */
function EmphasizedTitle({ text, color }: { text: string; color: string }) {
  const words = text.trim().split(/\s+/);
  if (words.length <= 2) {
    return <em style={{ fontStyle: 'italic', color }}>{text}</em>;
  }
  const last = words.pop()!;
  return (
    <>
      {words.join(' ')}{' '}
      <em style={{ fontStyle: 'italic', color }}>{last}</em>
    </>
  );
}

function AudioWave({ color }: { color: string }) {
  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-[58%] w-full opacity-90"
      viewBox="0 0 280 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0,50 C20,20 35,80 55,50 C75,22 95,78 115,50 C135,22 155,80 175,50 C195,22 215,78 235,50 C255,22 270,65 280,50"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M0,50 C20,40 35,60 55,50 C75,38 95,62 115,50 C135,38 155,62 175,50 C195,40 215,60 235,50 C255,44 270,56 280,50"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".45"
      />
    </svg>
  );
}
