'use client';

import React from 'react';

/**
 * UserAvatar
 *
 * Monograma em Instrument Serif itálico.
 * Borda herda --phase-accent do ancestral com data-phase="N".
 * Aceita foto_url — se carregar, exibe a foto; se falhar, mostra monograma.
 *
 * Uso:
 *   <UserAvatar name="Beatriz Souza" size={40} />
 *   <UserAvatar name="Beatriz" photoUrl={colaborador.foto_url} size={48} />
 */

interface UserAvatarProps {
  /** Nome completo ou parcial — usa a inicial de cada palavra (máx 2). */
  name?: string | null;
  /** URL da foto. Se carregar, exibe em destaque; se falhar, mostra monograma. */
  photoUrl?: string | null;
  /** Tamanho em px (largura = altura). Default: 40 */
  size?: number;
  /** Preset de avatar (emoji ou ID) */
  avatarPreset?: string | null;
  /** Classe extra pro elemento raiz */
  className?: string;
  onClick?: () => void;
}

export function UserAvatar({
  name,
  photoUrl,
  avatarPreset: _avatarPreset,
  size = 40,
  className = '',
  onClick,
}: UserAvatarProps) {
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const monogram = toMonogram(name);
  const showPhoto = !!photoUrl && !photoFailed;

  const fontSize = Math.round(size * 0.38);
  const borderWidth = size >= 48 ? 2 : 1.5;

  return (
    <button
      onClick={onClick}
      className={`relative shrink-0 rounded-full overflow-hidden transition-all active:scale-95 ${className}`}
      style={{
        width: size,
        height: size,
        // Fundo base — gradiente suave da marca
        background: showPhoto
          ? 'transparent'
          : 'linear-gradient(145deg, #0c2a4d 0%, #091d35 100%)',
        // Borda usa o token de fase; fallback ciano da marca
        border: `${borderWidth}px solid var(--phase-accent, #34C5CC)`,
        boxShadow: '0 0 0 3px color-mix(in oklab, var(--phase-accent, #34C5CC) 18%, transparent)',
      }}
      aria-label={name ? `Perfil de ${name}` : 'Meu perfil'}
    >
      {/* Foto real */}
      {photoUrl && (
        <img
          src={photoUrl}
          alt={name || 'Avatar'}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      )}

      {/* Monograma (visível quando não há foto) */}
      {!showPhoto && (
        <span
          className="absolute inset-0 flex items-center justify-center select-none"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'italic',
            fontSize,
            lineHeight: 1,
            color: 'var(--phase-accent, #9AE2E6)',
            // Leve glow no monograma
            textShadow: '0 0 12px color-mix(in oklab, var(--phase-accent, #34C5CC) 35%, transparent)',
          }}
          aria-hidden
        >
          {monogram}
        </span>
      )}

      {/* Overlay sutil ao hover */}
      <span className="absolute inset-0 bg-white/0 hover:bg-white/[0.06] transition-colors rounded-full" />
    </button>
  );
}

// ─── helpers ───────────────────────────────────────────

/** "Beatriz Souza Lima" → "BS" · "beatriz.souza" → "BS" · "" → "?" */
function toMonogram(name?: string | null): string {
  if (!name) return '?';
  const words = name
    .trim()
    .replace(/[._@-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const second = words[1]?.[0] ?? '';
  return (first + second).toUpperCase() || '?';
}
