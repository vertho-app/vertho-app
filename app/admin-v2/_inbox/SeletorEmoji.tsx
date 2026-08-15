'use client';

import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

/**
 * Seletor de emoji — grade fixa, sem dependência nova.
 *
 * POR QUE UMA LISTA CURTA E NÃO UMA BIBLIOTECA
 * ────────────────────────────────────────────
 * Emoji já funcionava no campo (o corpo vai como UTF-8 e nada no caminho
 * sanitiza): o teclado do sistema resolve. O que faltava era não precisar
 * lembrar do atalho no meio de um atendimento. Para isso, umas dezenas dos que
 * realmente aparecem numa conversa de trabalho bastam — um pacote com 1.800
 * emojis e busca resolveria o mesmo problema com um bundle que a tela inteira
 * não tem.
 *
 * Se um dia faltar variedade, o caminho é crescer esta lista, não trocar por
 * dependência: o custo de manutenção some e o de bundle não.
 */

const GRUPOS: { nome: string; emojis: string[] }[] = [
  {
    nome: 'Reações',
    emojis: ['👍', '👏', '🙌', '🤝', '💪', '🙏', '❤️', '🔥', '🎉', '✨', '⭐', '💡'],
  },
  {
    nome: 'Rostos',
    emojis: ['🙂', '😊', '😀', '😅', '😉', '😍', '🤔', '😌', '😴', '😕', '😢', '😉'],
  },
  {
    nome: 'Trabalho',
    emojis: ['✅', '❌', '⚠️', '📌', '📎', '📅', '⏰', '📊', '📝', '📚', '🎯', '🚀'],
  },
  {
    nome: 'Conversa',
    emojis: ['👋', '🗣️', '💬', '📞', '📱', '✉️', '🔗', '👀', '🤗', '🫡', '☕', '😎'],
  },
];

export default function SeletorEmoji({ onEscolher, desabilitado }: {
  onEscolher: (emoji: string) => void;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora e no Esc. Sem isso o painel fica por cima da thread e
  // esconde justamente a mensagem que a pessoa está respondendo.
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', clique);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', clique);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={desabilitado}
        aria-label="Inserir emoji"
        aria-expanded={aberto}
        title="Emoji"
        className="rounded-lg p-2 text-[var(--ink-faint)] transition-colors hover:bg-white/[0.05] hover:text-[var(--cyan)] disabled:opacity-40"
      >
        <Smile size={16} />
      </button>

      {aberto && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-[268px] rounded-xl border border-white/[0.12] bg-[#06172c] p-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          {GRUPOS.map((g) => (
            <div key={g.nome} className="mb-1.5 last:mb-0">
              <p className="px-1 pb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                {g.nome}
              </p>
              <div className="grid grid-cols-6 gap-0.5">
                {g.emojis.map((e, i) => (
                  <button
                    key={`${g.nome}-${i}`}
                    type="button"
                    onClick={() => { onEscolher(e); setAberto(false); }}
                    className="rounded-md p-1 text-[18px] leading-none transition-colors hover:bg-white/[0.08]"
                    aria-label={`emoji ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
