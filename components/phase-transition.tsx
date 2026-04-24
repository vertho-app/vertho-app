'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';

/**
 * PhaseTransition — tela fullscreen de passagem de fase.
 *
 * Direção C (forte): glifo gigante, paleta plena da fase, headline em serif.
 * Aparece em duas situações:
 *   1. Conclusão de fase — celebração + convite pra próxima
 *   2. Entrada em nova fase — briefing do que vem pela frente
 *
 * Uso:
 *   <PhaseTransition
 *     type="completed"
 *     faseNum={2}
 *     faseTitulo="Assessment"
 *     proximaFaseNum={3}
 *     proximaFaseTitulo="PDI"
 *     onContinue={() => router.push('/dashboard/pdi')}
 *   />
 *
 * Integração sugerida:
 *   - Verificar na home/jornada se houve mudança de fase (comparar faseNum salvo
 *     no localStorage com o faseNum atual). Se mudou, mostrar a tela.
 *   - Ou chamar diretamente ao final de ações que concluem uma fase.
 */

const PHASE_TOKENS: Record<number, { accent: string; deep: string; glow: string; word: string; glyph: string }> = {
  1: { accent: '#9ae2e6', deep: '#0a1a33', glow: 'rgba(154,226,230,0.3)',  word: 'introspectivo', glyph: 'a' },
  2: { accent: '#34c5cc', deep: '#06202a', glow: 'rgba(52,197,204,0.32)',  word: 'analítico',     glyph: 'b' },
  3: { accent: '#7ba7e0', deep: '#1a1f4a', glow: 'rgba(123,167,224,0.32)', word: 'estratégico',   glyph: 'c' },
  4: { accent: '#b888e8', deep: '#1a0d33', glow: 'rgba(184,136,232,0.32)', word: 'disciplinado',  glyph: 'd' },
  5: { accent: '#e1aaf0', deep: '#1a0220', glow: 'rgba(225,170,240,0.32)', word: 'reflexivo',     glyph: 'e' },
};

const FASE_DESC: Record<number, string> = {
  1: 'Você mapeou seu perfil comportamental. Agora é hora de medir suas competências.',
  2: 'Avaliação concluída. Seu plano de desenvolvimento individual está pronto.',
  3: 'PDI revisado. Sua temporada de 14 semanas começa agora.',
  4: 'Temporada concluída. Vamos medir o quanto você evoluiu.',
  5: 'Jornada completa. Você chegou ao topo.',
};

interface PhaseTransitionProps {
  type: 'completed' | 'entering';
  faseNum: number;
  faseTitulo: string;
  proximaFaseNum?: number;
  proximaFaseTitulo?: string;
  onContinue: () => void;
  onDismiss?: () => void;
}

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export function PhaseTransition({
  type,
  faseNum,
  faseTitulo,
  proximaFaseNum,
  proximaFaseTitulo,
  onContinue,
  onDismiss,
}: PhaseTransitionProps) {
  const tk = PHASE_TOKENS[faseNum] ?? PHASE_TOKENS[2];
  const nextTk = proximaFaseNum ? PHASE_TOKENS[proximaFaseNum] : null;

  // Impede scroll no body enquanto visível
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6 text-center"
      style={{
        background: `radial-gradient(120% 80% at 50% 10%, ${tk.glow}, transparent 60%),
                     linear-gradient(180deg, ${tk.deep} 0%, #06172C 100%)`,
      }}
    >
      {/* Glifo de fundo — decorativo */}
      <div
        aria-hidden
        className="absolute select-none pointer-events-none"
        style={{
          ...serifStyle,
          fontSize: 'clamp(220px, 40vw, 360px)',
          lineHeight: 0.85,
          color: tk.accent,
          opacity: 0.08,
          top: '-4%',
          right: '-4%',
          letterSpacing: '-0.05em',
        }}
      >
        {tk.glyph}
      </div>

      {/* Conteúdo */}
      <div className="relative z-10 max-w-[420px] w-full">

        {/* Badge de fase */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 mx-auto"
          style={{
            background: `color-mix(in oklab, ${tk.accent} 14%, transparent)`,
            border: `1px solid color-mix(in oklab, ${tk.accent} 35%, transparent)`,
          }}
        >
          {type === 'completed' && (
            <span
              className="flex items-center justify-center rounded-full"
              style={{ width: 18, height: 18, background: tk.accent, color: '#062032' }}
            >
              <Check size={11} strokeWidth={3} />
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: tk.accent,
            }}
          >
            {type === 'completed' ? `Fase ${faseNum} concluída` : `Fase ${faseNum} · ${tk.word}`}
          </span>
        </div>

        {/* Headline principal */}
        <h1
          className="mb-4"
          style={{
            ...serifStyle,
            fontSize: 'clamp(36px, 7vw, 56px)',
            lineHeight: 1.0,
            letterSpacing: '-0.025em',
            color: '#fff',
          }}
        >
          {type === 'completed' ? (
            <>
              {faseTitulo}{' '}
              <em style={{ color: tk.accent }}>concluída.</em>
            </>
          ) : (
            <>
              Bem-vindo à{' '}
              <em style={{ color: tk.accent }}>{faseTitulo}.</em>
            </>
          )}
        </h1>

        {/* Subtítulo */}
        <p
          className="mb-10 leading-relaxed"
          style={{ fontSize: 16, color: 'rgba(255,255,255,0.62)', maxWidth: '38ch', margin: '0 auto 40px' }}
        >
          {FASE_DESC[type === 'completed' ? faseNum : faseNum]}
        </p>

        {/* CTA principal */}
        <button
          onClick={onContinue}
          className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] mb-3"
          style={{
            background: tk.accent,
            color: '#062032',
            boxShadow: `0 12px 32px ${tk.glow}`,
            fontSize: 15,
          }}
        >
          {type === 'completed'
            ? (proximaFaseTitulo ? `Começar ${proximaFaseTitulo}` : 'Ver minha evolução')
            : 'Começar agora'}
          <ArrowRight size={18} />
        </button>

        {/* Dismiss opcional */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-sans)' }}
          >
            Ver mais tarde
          </button>
        )}

        {/* Próxima fase (se completou) */}
        {type === 'completed' && nextTk && proximaFaseNum && proximaFaseTitulo && (
          <div
            className="mt-8 p-4 rounded-2xl flex items-center gap-4 text-left"
            style={{
              background: `color-mix(in oklab, ${nextTk.accent} 8%, transparent)`,
              border: `1px solid color-mix(in oklab, ${nextTk.accent} 20%, transparent)`,
            }}
          >
            <span
              style={{
                ...serifStyle,
                fontSize: 36,
                color: nextTk.accent,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {nextTk.glyph}
            </span>
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 10,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  color: nextTk.accent,
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                Próxima · Fase {proximaFaseNum}
              </p>
              <p style={{ ...serifStyle, fontSize: 17, color: '#fff', lineHeight: 1.1 }}>
                {proximaFaseTitulo} · <em style={{ color: nextTk.accent }}>{nextTk.word}</em>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * usePhaseTransition — hook para detectar mudança de fase e mostrar a tela.
 *
 * Uso em qualquer página de fase:
 *
 *   const { showTransition, dismissTransition } = usePhaseTransition(faseNum);
 *
 *   if (showTransition) return (
 *     <PhaseTransition
 *       type="completed"
 *       faseNum={faseNum - 1}
 *       faseTitulo={faseAnteriorTitulo}
 *       proximaFaseNum={faseNum}
 *       proximaFaseTitulo={faseTitulo}
 *       onContinue={dismissTransition}
 *       onDismiss={dismissTransition}
 *     />
 *   );
 */
export function usePhaseTransition(currentFase: number | null) {
  const [showTransition, setShowTransition] = React.useState(false);
  const [previousFase, setPreviousFase] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!currentFase) return;
    const stored = localStorage.getItem('vertho_last_fase');
    const lastFase = stored ? parseInt(stored, 10) : null;

    if (lastFase && lastFase < currentFase) {
      setPreviousFase(lastFase);
      setShowTransition(true);
    }

    localStorage.setItem('vertho_last_fase', String(currentFase));
  }, [currentFase]);

  function dismissTransition() {
    setShowTransition(false);
    setPreviousFase(null);
  }

  return { showTransition, previousFase, dismissTransition };
}
