'use client';

import React from 'react';

/**
 * EmptyState — estado vazio com personalidade.
 *
 * Usa a cor da fase atual via --phase-accent.
 * Três variantes pré-definidas + suporte a custom.
 *
 * Uso:
 *   <EmptyState variant="capacitacao" />
 *   <EmptyState variant="pdi" onAction={() => router.push('/dashboard/assessment')} />
 *   <EmptyState variant="videos" />
 *   <EmptyState
 *     glyph="c"
 *     title="Seu PDI ainda está sendo montado"
 *     description="Complete o Assessment para receber seu plano personalizado."
 *     actionLabel="Ir para Assessment"
 *     onAction={() => router.push('/dashboard/assessment')}
 *   />
 */

type EmptyVariant = 'capacitacao' | 'pdi' | 'videos' | 'custom';

interface EmptyStateProps {
  variant?: EmptyVariant;
  /** Glifo em Instrument Serif itálico — letra a/b/c/d/e ou símbolo */
  glyph?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const VARIANTS: Record<Exclude<EmptyVariant, 'custom'>, Omit<EmptyStateProps, 'variant' | 'className' | 'onAction'>> = {
  capacitacao: {
    glyph: 'c',
    title: 'Nenhum conteúdo recomendado ainda',
    description: 'Assim que seu perfil e competências forem mapeados, vamos montar uma trilha personalizada pra você.',
    actionLabel: 'Ver minha jornada',
  },
  pdi: {
    glyph: 'b',
    title: 'Seu PDI está sendo preparado',
    description: 'Complete o Assessment de competências para receber seu plano de desenvolvimento individual.',
    actionLabel: 'Ir para Assessment',
  },
  videos: {
    glyph: 'a',
    title: 'Nenhum vídeo assistido ainda',
    description: 'Acesse sua trilha de capacitação e comece pelo primeiro conteúdo da semana.',
    actionLabel: 'Ver trilha',
  },
};

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export function EmptyState({
  variant = 'custom',
  glyph,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  const preset = variant !== 'custom' ? VARIANTS[variant] : {};
  const g = glyph ?? preset.glyph ?? '?';
  const t = title ?? preset.title ?? 'Nada aqui ainda';
  const d = description ?? preset.description;
  const a = actionLabel ?? preset.actionLabel;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      {/* Glifo grande — âncora visual */}
      <div
        className="relative mb-6 flex items-center justify-center"
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'color-mix(in oklab, var(--phase-accent, #34c5cc) 10%, transparent)',
          border: '1px solid color-mix(in oklab, var(--phase-accent, #34c5cc) 24%, transparent)',
        }}
      >
        {/* Halo externo */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: '0 0 0 12px color-mix(in oklab, var(--phase-accent, #34c5cc) 5%, transparent)',
          }}
          aria-hidden
        />
        <span
          style={{
            ...serifStyle,
            fontSize: 52,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: 'var(--phase-accent, #34c5cc)',
          }}
          aria-hidden
        >
          {g}
        </span>
      </div>

      {/* Título */}
      <h3
        className="mb-3 max-w-[28ch]"
        style={{
          ...serifStyle,
          fontSize: 22,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: '#fff',
        }}
      >
        {t}
      </h3>

      {/* Descrição */}
      {d && (
        <p
          className="text-sm leading-relaxed max-w-[36ch] mb-6"
          style={{ color: 'rgba(255,255,255,0.52)' }}
        >
          {d}
        </p>
      )}

      {/* CTA opcional */}
      {a && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 rounded-[var(--radius-md,16px)] text-sm font-bold transition-all active:scale-95"
          style={{
            background: 'color-mix(in oklab, var(--phase-accent, #34c5cc) 14%, transparent)',
            border: '1px solid color-mix(in oklab, var(--phase-accent, #34c5cc) 32%, transparent)',
            color: 'var(--phase-accent, #34c5cc)',
          }}
        >
          {a} →
        </button>
      )}
    </div>
  );
}
