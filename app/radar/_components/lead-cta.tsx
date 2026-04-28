'use client';

import { useState, useTransition } from 'react';
import { Loader2, FileText, Mail, X } from 'lucide-react';
import { capturarLead, registrarEventoClient } from '../actions';

type Props = {
  scopeType: 'escola' | 'municipio';
  scopeId: string;
  scopeLabel: string;
};

export function LeadCTA({ scopeType, scopeId, scopeLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await capturarLead({
        scopeType,
        scopeId,
        scopeLabel,
        nome: String(formData.get('nome') || ''),
        email: String(formData.get('email') || ''),
        cargo: String(formData.get('cargo') || ''),
        organizacao: String(formData.get('organizacao') || ''),
        consentimento_lgpd: formData.get('consentimento_lgpd') === 'on',
      });
      if (r?.success) {
        setDone(true);
      } else {
        setError(r?.error || 'Erro ao enviar. Tente novamente.');
      }
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          registrarEventoClient('cta_lead_click', { tipo: scopeType, id: scopeId }).catch(() => {});
        }}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white transition-all"
        style={{
          background: 'linear-gradient(135deg, #34c5cc, #0D9488)',
          boxShadow: '0 8px 24px -8px rgba(52,197,204,0.6)',
        }}
      >
        <FileText size={15} />
        Receba diagnóstico Vertho em PDF
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => !pending && !done && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 relative"
            style={{ background: '#0a1f3a', borderColor: 'rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => !pending && setOpen(false)}
              className="absolute right-4 top-4 text-white/40 hover:text-white"
            >
              <X size={18} />
            </button>

            {done ? (
              <div className="text-center py-4">
                <div
                  className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-4"
                  style={{ background: 'rgba(52,197,204,0.18)' }}
                >
                  <Mail size={20} style={{ color: '#34c5cc' }} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Pedido recebido!</h3>
                <p className="text-sm text-white/65 leading-relaxed">
                  Estamos gerando seu diagnóstico em PDF. Você vai receber por e-mail nos próximos minutos.
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-base font-bold text-white mb-1">Diagnóstico Vertho em PDF</h3>
                <p className="text-xs text-white/55 mb-4 leading-relaxed">
                  Análise contextualizada de <strong className="text-white/80">{scopeLabel}</strong> com fontes oficiais e plano de ação. Gratuito.
                </p>
                <form action={handleSubmit} className="space-y-3">
                  <Input name="nome" placeholder="Seu nome" required />
                  <Input name="email" placeholder="E-mail profissional" type="email" required />
                  <Input name="cargo" placeholder="Cargo (ex: Secretário de Educação)" />
                  <Input name="organizacao" placeholder="Organização (ex: Prefeitura de Ibipeba)" />

                  <label className="flex items-start gap-2 text-[11px] text-white/60 leading-relaxed">
                    <input
                      type="checkbox"
                      name="consentimento_lgpd"
                      required
                      className="mt-0.5 accent-cyan-400"
                    />
                    <span>
                      Concordo em receber o diagnóstico por e-mail e que a Vertho entre em contato sobre soluções pedagógicas. Posso solicitar exclusão a qualquer momento (LGPD).
                    </span>
                  </label>

                  {error && (
                    <p className="text-[11px] text-red-300 bg-red-500/10 rounded p-2 text-center">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full py-3 rounded-lg text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #34c5cc, #0D9488)' }}
                  >
                    {pending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Enviando...
                      </span>
                    ) : (
                      'Receber PDF'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2.5 rounded-lg text-sm text-white bg-white/[0.04] border border-white/10 outline-none focus:border-cyan-400/40 placeholder:text-white/30"
    />
  );
}
