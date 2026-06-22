import React from 'react';
import { interpolate, Easing } from 'remotion';
import { ICON_NODES, type IconNode } from './icons-data';

/** Nomes válidos do vocabulário (sincronizar com o prompt do roteiro). */
export const ICON_NAMES = Object.keys(ICON_NODES);

// Curva-assinatura do DESENHO: ease-in-out suave (velocidade ~constante de "caneta").
// NÃO usar o EASE_OUT do `reveal` (front-loaded demais → parece que só o fim desenha).
const DRAW_EASE = Easing.inOut(Easing.cubic);
/** Progresso do stroke-draw (0→1) do ícone do item `i`, em ritmo de caneta. */
export function drawProgress(frame: number, delay: number, dur = 46): number {
  return interpolate(frame, [delay, delay + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: DRAW_EASE });
}

// Fallback (cena sem ícone ou nome inválido): ciclo neutro e variado.
const FALLBACK = ['ideia', 'meta', 'direcao', 'checklist'];

/** Resolve o iconNode (paths crus) do item `idx` pelo nome semântico, ou fallback. */
export function iconByName(name: string | undefined, idx: number): IconNode {
  const key = String(name || '').trim().toLowerCase();
  return ICON_NODES[key] || ICON_NODES[FALLBACK[idx % FALLBACK.length]];
}

/**
 * ASSINATURA DE MARCA: o ícone DESENHA o traço na tela (stroke-draw-on) em vez de
 * só aparecer. Cada elemento é normalizado com `pathLength="1"` e desenhado via
 * `stroke-dashoffset` 1→0 → traço UNIFORME (independe do comprimento do path).
 * `draw` (0→1, JÁ na curva-assinatura — passe `reveal(...)`). `pulse` (~0.05) = um
 * respiro/pulso sutil no ícone ACENTUADO da cena (um-acento/cena). Renderiza os
 * paths CRUS (icons-data) — NÃO depende do componente lucide em runtime, então
 * funciona no bundle minificado. Glyph e container inalterados.
 */
export const DrawIcon: React.FC<{ node: IconNode; size: number; color: string; draw: number; pulse?: number }> = ({ node, size, color, draw, pulse = 0 }) => {
  const d = Math.max(0, Math.min(1, draw));
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ overflow: 'visible', ...(pulse ? { transform: `scale(${1 + pulse})`, transformOrigin: 'center' } : null) }}
    >
      {node.map(([tag, attrs], i) =>
        React.createElement(tag, { ...attrs, key: i, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - d }),
      )}
    </svg>
  );
};
