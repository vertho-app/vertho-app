'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Send, Loader2 } from 'lucide-react';
import { chatWithBeto } from '@/app/actions/beto';
import { getSupabase } from '@/lib/supabase-browser';

// ─── Beto Design Tokens ────────────────────────────────────────────────────
// Cor própria — violeta, separado do sistema de fase.
// Não usa --phase-accent, não compete com a identidade de fase.
const BETO = {
  bg:     '#2D1B69',       // deep violet
  mid:    '#6D28D9',       // violet
  light:  '#A78BFA',       // lavender
  glow:   'rgba(109,40,217,0.35)',
  text:   '#EDE9FE',
};

// ─── Beto Avatar ───────────────────────────────────────────────────────────
// Imagem do Beto em recorte circular, com dot de status (online) e um leve
// pulse quando está "pensando".
function BetoAvatar({ size = 32, state = 'idle' }: { size?: number; state?: 'idle' | 'thinking' | 'typing' }) {
  const dot = Math.max(8, size * 0.3);
  const ring = Math.max(1.5, size * 0.055);

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
      aria-label="Beto"
    >
      <img
        src="/beto-avatar.jpg"
        alt="Beto"
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px ${BETO.glow}`,
          opacity: state === 'thinking' ? 0.85 : 1,
          animation: state === 'thinking' ? 'beto-pulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      {/* Dot de status (online) */}
      <span
        className="absolute rounded-full"
        style={{
          width: dot, height: dot,
          right: -ring * 0.4, bottom: -ring * 0.4,
          background: '#2ECC71',
          border: `${ring}px solid ${BETO.bg}`,
        }}
      />
      <style>{`
        @keyframes beto-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </span>
  );
}

// ─── Typing indicator ──────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: 6, height: 6,
            background: BETO.light,
            opacity: 0.7,
            animation: `beto-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes beto-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Markdown renderer (mantido do original) ──────────────────────────────
function MarkdownText({ children }: { children: React.ReactNode }) {
  const text = String(children || '');
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isList = lines.every(l => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc list-inside space-y-0.5 my-1">
              {lines.map((l, li) => <li key={li}>{renderInline(l.replace(/^\s*[-*]\s+/, ''))}</li>)}
            </ul>
          );
        }
        return (
          <p key={bi} className={bi > 0 ? 'mt-2' : ''}>
            {lines.map((l, li) => (
              <span key={li}>
                {renderInline(l)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let last = 0, m, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={`s${key++}`} className="font-bold text-white">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={`c${key++}`} className="px-1 py-0.5 rounded text-[12px]" style={{ background: 'rgba(167,139,250,0.15)', color: BETO.light }}>{tok.slice(1, -1)}</code>);
    else parts.push(<em key={`e${key++}`} className="italic" style={{ color: BETO.light }}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── Main component ────────────────────────────────────────────────────────
export default function BetoChat() {
  const t = useTranslations('Beto');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: t('greeting') },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function handleSend(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const reply = await chatWithBeto(userMsg, messages.slice(-10), userEmail);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t('error') }]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-beto', handler);
    return () => window.removeEventListener('open-beto', handler);
  }, []);

  // ── FAB fechado ─────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-beto-trigger
        title={t('fabTitle')}
        className="fixed bottom-[calc(var(--nav-height)+12px)] right-3 sm:right-4 z-40 flex items-center gap-2.5 pl-1 pr-4 py-1 rounded-full transition-all active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${BETO.bg}, ${BETO.mid})`,
          boxShadow: `0 8px 24px ${BETO.glow}`,
          border: `1px solid rgba(167,139,250,0.25)`,
        }}
      >
        <BetoAvatar size={36} state="idle" />
        <span className="text-white text-sm font-bold tracking-wide hidden sm:inline"
          style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 16, letterSpacing: '-0.01em' }}>
          Beto
        </span>
      </button>
    );
  }

  // ── Chat aberto ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed z-50 rounded-2xl overflow-hidden shadow-2xl flex flex-col
                 inset-x-3 top-[calc(var(--header-height)+8px)] bottom-[calc(var(--nav-height)+8px)]
                 sm:inset-auto sm:right-4 sm:bottom-[calc(var(--nav-height)+16px)] sm:top-auto sm:w-[380px] sm:max-h-[70dvh]"
      style={{
        background: '#0A1020',
        border: `1px solid rgba(167,139,250,0.18)`,
        boxShadow: `0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.1)`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ background: BETO.bg, borderColor: 'rgba(167,139,250,0.2)' }}
      >
        <div className="flex items-center gap-3">
          <BetoAvatar size={36} state={loading ? 'thinking' : 'idle'} />
          <div>
            <p className="font-bold text-white leading-tight"
              style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 17 }}>
              Beto
            </p>
            <p className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: BETO.light, opacity: 0.7 }}>
              {t('subtitle')}
            </p>
          </div>
        </div>
        <button onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 transition-colors"
          style={{ color: BETO.light }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 sm:min-h-[200px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="shrink-0 mb-0.5">
                <BetoAvatar size={24} state="idle" />
              </div>
            )}
            <div
              className="max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
              style={m.role === 'user'
                ? { background: 'rgba(109,40,217,0.25)', color: BETO.text, borderBottomRightRadius: 6 }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(243,247,251,0.85)', borderBottomLeftRadius: 6 }
              }
            >
              {m.role === 'assistant' ? <MarkdownText>{m.content}</MarkdownText> : m.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-end gap-2 justify-start">
            <div className="shrink-0 mb-0.5"><BetoAvatar size={24} state="thinking" /></div>
            <div className="rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)', borderBottomLeftRadius: 6 }}>
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend}
        className="flex items-center gap-2 p-3 border-t"
        style={{ borderColor: 'rgba(167,139,250,0.12)' }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t('placeholder')}
          className="flex-1 px-3 py-2 rounded-xl text-sm text-white outline-none placeholder:text-white/30"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(167,139,250,0.18)',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(167,139,250,0.45)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(167,139,250,0.18)')}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 transition-all active:scale-95"
          style={{ background: `linear-gradient(135deg, ${BETO.mid}, ${BETO.bg})` }}
        >
          <Send size={14} className="text-white" />
        </button>
      </form>
    </div>
  );
}
