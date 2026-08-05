'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Zap, Send, Trash2, ChevronDown, Settings } from 'lucide-react';
import BackButton from '@/components/back-button';

const MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gpt-5.6-sol', label: 'GPT 5.6 Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT 5.6 Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT 5.6 Luna' },
];

const DEFAULT_SYSTEM = 'Voce e um assistente util e responde em portugues brasileiro.';

export default function SimuladorPage() {
  const t = useTranslations('AdminSimulator');
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [model, setModel] = useState(MODELS[0].id);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chat-simulador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, messages: newMessages, model }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages([...newMessages, { role: 'assistant', content: data.mensagem }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: t('messages.errorResponse', { error: data.error || t('messages.callFailed') }) }]);
      }
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: t('messages.errorResponse', { error: err.message }) }]);
    }
    setSending(false);
  }

  function handleClear() {
    setMessages([]);
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6 flex flex-col" style={{ minHeight: '100dvh' }}>
      <BackButton href="/admin/dashboard" />
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Zap size={20} className="text-amber-400" /> {t('title')}</h1>
            <p className="text-xs text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-amber-400/30 hover:text-amber-400 transition-all">
            <Settings size={14} /> {t('actions.config')}
          </button>
          <button onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-red-400/30 hover:text-red-400 transition-all">
            <Trash2 size={14} /> {t('actions.clear')}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="rounded-xl border border-amber-400/20 p-4 mb-4" style={{ background: '#0F2A4A' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-amber-400 mb-1">{t('fields.systemPrompt')}</label>
              <textarea value={system} onChange={e => setSystem(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-amber-400/50 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-amber-400 mb-1">{t('fields.model')}</label>
              <div className="relative">
                <select value={model} onChange={e => setModel(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 pr-8 focus:outline-none focus:border-amber-400/50">
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
              <p className="text-[10px] text-gray-600 mt-1">{t('fields.currentModel', { model })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 rounded-xl border border-white/[0.06] overflow-hidden mb-4" style={{ background: '#0F2A4A' }}>
        <div className="h-[calc(100dvh-320px)] overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Zap size={32} className="text-amber-400/30 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{t('empty.title')}</p>
                <p className="text-xs text-gray-600 mt-1">{t('fields.model')}: {MODELS.find(m => m.id === model)?.label}</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-amber-500/20 text-amber-100 border border-amber-400/20'
                  : 'bg-white/[0.04] text-gray-200 border border-white/[0.06]'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-xl px-4 py-2.5 bg-white/[0.04] border border-white/[0.06]">
                <Loader2 size={16} className="animate-spin text-amber-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex items-end gap-2">
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          rows={1} placeholder={t('inputPlaceholder')}
          className="flex-1 rounded-xl border border-white/10 bg-[#0F2A4A] text-white text-sm px-4 py-3 focus:outline-none focus:border-amber-400/50 resize-none"
          style={{ minHeight: '44px', maxHeight: '120px' }} />
        <button onClick={handleSend} disabled={sending || !input.trim()}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-400 text-[#091D35] transition-colors disabled:opacity-40 shrink-0">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
