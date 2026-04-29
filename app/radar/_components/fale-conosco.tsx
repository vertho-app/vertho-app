'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Mail, X } from 'lucide-react';
import { registrarEventoClient } from '../actions';

type ScopeType = 'escola' | 'municipio' | 'rede' | 'estado' | 'home' | 'comparar';

type Props = {
  scopeType: ScopeType;
  scopeId?: string;
  scopeName?: string;
  scopeUf?: string;
};

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_RODRIGO_WHATSAPP || '';
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'rodrigo@vertho.ai';

const TRACKABLE_SCOPES = new Set(['escola', 'municipio', 'estado']);

function track(
  tipo: 'fale_conosco_open' | 'wpp_click' | 'email_click',
  scopeType: ScopeType,
  scopeId?: string,
) {
  // registrarEventoClient só aceita escola/municipio/estado como scope.tipo
  if (scopeId && TRACKABLE_SCOPES.has(scopeType)) {
    registrarEventoClient(tipo, { tipo: scopeType as 'escola' | 'municipio' | 'estado', id: scopeId }).catch(() => {});
  } else {
    registrarEventoClient(tipo).catch(() => {});
  }
}

export function FaleConosco({ scopeType, scopeId, scopeName, scopeUf }: Props) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 30000);
    return () => clearTimeout(t);
  }, []);

  if (!WHATSAPP_NUMBER) {
    // Sem número configurado → não renderiza nada (evita CTA quebrado)
    return null;
  }

  const buildMessage = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (scopeType === 'escola' && scopeName) {
      return `Olá! Vi os dados da escola "${scopeName}" no Radar Vertho. Gostaria de conversar sobre como a Vertho pode ajudar.\n\nLink: ${url}`;
    }
    if (scopeType === 'municipio' && scopeName) {
      return `Olá! Vi os dados de ${scopeName}${scopeUf ? '/' + scopeUf : ''} no Radar Vertho. Sou gestor(a) de educação e gostaria de uma conversa.\n\nLink: ${url}`;
    }
    if (scopeType === 'rede' && scopeName) {
      return `Olá! Vi a rede municipal de ${scopeName} no Radar. Quero entender como a Vertho pode ajudar nossa rede.\n\nLink: ${url}`;
    }
    if (scopeType === 'estado' && scopeUf) {
      return `Olá! Estou olhando dados de ${scopeUf} no Radar Vertho e gostaria de conversar sobre a Vertho.\n\nLink: ${url}`;
    }
    if (scopeType === 'comparar') {
      return `Olá! Estou comparando escolas no Radar Vertho. Gostaria de uma conversa sobre a Vertho.\n\nLink: ${url}`;
    }
    return `Olá! Estou no Radar Vertho e gostaria de conversar sobre a Vertho.${url ? '\n\nLink: ' + url : ''}`;
  };

  const handleOpen = () => {
    setOpen(true);
    setPulse(false);
    track('fale_conosco_open', scopeType, scopeId);
  };

  const handleWhatsapp = () => {
    track('wpp_click', scopeType, scopeId);
    const msg = encodeURIComponent(buildMessage());
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  };

  const handleEmail = () => {
    track('email_click', scopeType, scopeId);
    const subject = encodeURIComponent('Interesse na Vertho — via Radar');
    const body = encodeURIComponent(buildMessage());
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Falar com sócio da Vertho"
        className={`fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold shadow-xl transition-transform hover:scale-[1.03] ${
          pulse ? 'animate-pulse' : ''
        }`}
        style={{
          background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
          color: '#06172C',
          boxShadow: '0 10px 30px rgba(52,197,204,0.35)',
        }}
      >
        <MessageCircle size={18} />
        <span className="hidden sm:inline">Falar com sócio</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(6,23,44,0.6)', backdropFilter: 'blur(2px)' }}
          />
          <div
            className="fixed bottom-6 right-6 z-50 w-[min(380px,calc(100vw-3rem))] rounded-2xl overflow-hidden border"
            style={{
              background: 'linear-gradient(180deg,#0c2848,#091D35)',
              borderColor: 'rgba(52,197,204,0.25)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-start justify-between px-5 pt-5 pb-3"
              style={{ background: 'linear-gradient(135deg, rgba(52,197,204,0.18), rgba(52,197,204,0.04))' }}>
              <div>
                <p className="text-[10px] tracking-[0.25em] uppercase font-mono mb-1" style={{ color: '#9ae2e6' }}>
                  Vamos conversar?
                </p>
                <h3 className="text-white text-lg font-bold leading-tight">
                  Falar com um sócio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 space-y-2">
              <button
                type="button"
                onClick={handleWhatsapp}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left border transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.18)' }}>
                  <MessageCircle size={16} style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">WhatsApp direto</div>
                  <div className="text-xs text-white/55">Pergunta rápida ou agendamento</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleEmail}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left border transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(52,197,204,0.18)' }}>
                  <Mail size={16} style={{ color: '#34c5cc' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">Email</div>
                  <div className="text-xs text-white/55">Abre seu cliente de e-mail com mensagem pronta</div>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-white/40 text-center px-4 pb-4 pt-1">
              Resposta normalmente em poucas horas
            </p>
          </div>
        </>
      )}
    </>
  );
}
