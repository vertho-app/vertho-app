'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BettLeadModal } from '../_components/bett-lead-modal';
import { WhatsappIcon } from '../_components/whatsapp-icon';
import { openWhatsAppAgendar } from '../_lib/whatsapp';
import { track } from '../_lib/tracking';

export function JornadaCTA() {
  const [leadOpen, setLeadOpen] = useState(false);

  return (
    <section
      className="rounded-3xl p-7 sm:p-10 border text-center"
      style={{
        background: 'linear-gradient(135deg, rgba(52,197,204,0.10), rgba(158,78,221,0.06))',
        borderColor: 'rgba(255,255,255,0.10)',
      }}
    >
      <p
        className="text-[10px] tracking-[0.20em] uppercase font-bold mb-3"
        style={{ color: '#34c5cc' }}
      >
        Próximo passo
      </p>
      <h3
        className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
          fontSize: 'clamp(24px, 3.2vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}
      >
        Quer ver isso aplicado na sua escola ou rede?
      </h3>
      <p className="text-white/65 leading-relaxed mb-6 max-w-[640px] mx-auto" style={{ fontSize: 15 }}>
        A conversa começa com a leitura do diagnóstico já feito pelo Radar e segue com o desenho da
        jornada para a sua realidade.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            track('bett_schedule_click');
            openWhatsAppAgendar({ tipo: 'cta' });
          }}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
          style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#06172C' }}
        >
          <WhatsappIcon size={14} /> Agendar conversa
        </button>
        <button
          type="button"
          onClick={() => {
            track('bett_lead_open');
            setLeadOpen(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
          style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
        >
          Receber proposta por e-mail <ArrowRight size={14} />
        </button>
      </div>
      <BettLeadModal open={leadOpen} onClose={() => setLeadOpen(false)} />
    </section>
  );
}
