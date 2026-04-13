'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { chatWithBeto } from '@/app/actions/beto';
import { getSupabase } from '@/lib/supabase-browser';

export default function BetoChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Oi! Sou o BETO, seu mentor de desenvolvimento. Como posso ajudar?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const scrollRef = useRef(null);

  // Carregar email do usuário para contexto
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email);
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function handleSend(e) {
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
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, tive um problema. Tente novamente.' }]);
    }
    setLoading(false);
  }

  // Escutar evento open-beto (disparado pelo card "Mentor IA")
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-beto', handler);
    return () => window.removeEventListener('open-beto', handler);
  }, []);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        title="Falar com BETO"
        className="fixed bottom-[calc(var(--nav-height)+12px)] right-3 sm:right-4 flex items-center gap-2 w-11 h-11 sm:w-auto sm:h-12 sm:px-4 justify-center rounded-full shadow-lg z-40"
        style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
        <MessageSquare size={18} className="text-white" />
        <span className="hidden sm:inline text-white text-sm font-bold">BETO</span>
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col
                 inset-x-3 top-[calc(var(--header-height)+8px)] bottom-[calc(var(--nav-height)+8px)]
                 sm:inset-auto sm:right-4 sm:bottom-[calc(var(--nav-height)+16px)] sm:top-auto sm:w-[380px] sm:max-h-[70dvh]"
      style={{ background: '#0A1D35' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
        style={{ background: '#0F2A4A' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>B</div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">BETO</p>
            <p className="text-[10px] text-gray-500">Mentor IA</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 sm:min-h-[200px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-cyan-500/15 text-cyan-100'
                : 'bg-white/[0.06] text-gray-300'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.06] px-3 py-2 rounded-xl">
              <Loader2 size={14} className="animate-spin text-gray-500" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-white/[0.06]">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pergunte ao BETO..."
          className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-400/40"
        />
        <button type="submit" disabled={loading || !input.trim()}
          className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
          <Send size={14} className="text-white" />
        </button>
      </form>
    </div>
  );
}
