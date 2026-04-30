'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { WhatsappIcon } from './whatsapp-icon';
import { capturarLead } from '../../radar/actions';
import { capturarLeadComercial } from '@/actions/lead-comercial';
import { track } from '../_lib/tracking';

type Pre = {
  scopeType?: 'escola' | 'municipio';
  scopeId?: string;
  scopeLabel?: string;
};

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_RODRIGO_WHATSAPP || '';

/**
 * Modal de lead em 2 passos.
 * Passo 1: dados pessoais (nome, email, whatsapp, cargo)
 * Passo 2: instituição (preenchido se vier de busca)
 *
 * Após envio: mensagem de sucesso + 2 CTAs (Agendar / WhatsApp).
 */
export function BettLeadModal({
  open,
  onClose,
  pre,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  pre?: Pre;
  onSuccess?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 'done'>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Passo 1
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cargo, setCargo] = useState('');

  // Passo 2
  const [instituicao, setInstituicao] = useState(pre?.scopeLabel || '');
  const [municipio, setMunicipio] = useState('');
  const [tipo, setTipo] = useState<'publica' | 'privada'>('publica');
  const [qtdAlunos, setQtdAlunos] = useState('');
  const [qtdEscolas, setQtdEscolas] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (open) {
      track('bett_lead_open');
      setStep(1);
      setError('');
      setInstituicao(pre?.scopeLabel || '');
    }
  }, [open, pre?.scopeLabel]);

  if (!open) return null;

  const passo1Valido = nome.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && cargo.trim().length >= 2;
  const passo2Valido = instituicao.trim().length >= 2 && consent;

  function avancarPasso1(e: React.FormEvent) {
    e.preventDefault();
    if (!passo1Valido) { setError('Preencha todos os campos corretamente.'); return; }
    setError('');
    track('bett_lead_step1');
    setStep(2);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!passo2Valido) { setError('Confirme a instituição e aceite o consentimento LGPD.'); return; }
    setSubmitting(true);
    setError('');
    track('bett_lead_step2');

    try {
      // Caminho 1: lead com escopo válido de busca prévia (escola/município
      // selecionado) — usa capturarLead que valida INEP/IBGE e dispara worker
      // de PDF.
      // Caminho 2: lead comercial sem escopo (clicou em "Agendar conversa"
      // direto, sem buscar) — usa capturarLeadComercial que aceita lead
      // sem escopo, salva como scope_type='comercial' e NÃO valida.
      const orgComplemento = [
        municipio && `Município: ${municipio}`,
        tipo && `Tipo: ${tipo === 'publica' ? 'pública' : 'privada'}`,
        qtdAlunos && `Alunos: ${qtdAlunos}`,
        qtdEscolas && `Escolas: ${qtdEscolas}`,
      ].filter(Boolean).join(' · ');
      const organizacao = [instituicao, orgComplemento].filter(Boolean).join(' — ');

      let r: any;
      if (pre?.scopeType && pre?.scopeId) {
        r = await capturarLead({
          scopeType: pre.scopeType,
          scopeId: pre.scopeId,
          scopeLabel: pre.scopeLabel || instituicao,
          nome: nome.trim(),
          email: email.trim(),
          cargo: cargo.trim(),
          organizacao,
          consentimento_lgpd: consent,
        });
      } else {
        r = await capturarLeadComercial({
          nome: nome.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim() || undefined,
          cargo: cargo.trim(),
          instituicao: instituicao.trim(),
          municipio: municipio.trim() || undefined,
          tipo,
          qtd_alunos: qtdAlunos.trim() || undefined,
          qtd_escolas: qtdEscolas.trim() || undefined,
          origem: 'radarbett',
          consentimento_lgpd: consent,
        });
      }

      if (r?.error) {
        setError(r.error);
        // Não trata como sucesso — força o usuário a corrigir.
        return;
      }

      track('bett_lead_submit');
      setStep('done');
      if (onSuccess) onSuccess();
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleWhatsApp() {
    track('bett_schedule_click');
    track('bett_wpp_click');
    if (!WHATSAPP_NUMBER) { window.location.href = 'mailto:rodrigo@vertho.ai'; return; }
    const msg = encodeURIComponent(`Olá! Acabei de pedir o diagnóstico inicial do Radar Vertho (${instituicao}). Gostaria de agendar uma conversa.`);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(6,23,44,0.8)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className="w-full max-w-[520px] rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0c2848, #091D35)',
          borderColor: 'rgba(52,197,204,0.25)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-3"
          style={{ background: 'linear-gradient(135deg, rgba(52,197,204,0.18), rgba(52,197,204,0.04))' }}>
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase font-mono mb-1" style={{ color: '#9ae2e6' }}>
              {step === 'done' ? 'Diagnóstico solicitado' : `Passo ${step} de 2`}
            </p>
            <h3 className="text-white text-lg font-bold leading-tight">
              {step === 1 && 'Receba o diagnóstico inicial'}
              {step === 2 && 'Sua escola ou rede'}
              {step === 'done' && 'Tudo certo!'}
            </h3>
            {step !== 'done' && (
              <p className="text-[11px] text-white/55 mt-1 leading-relaxed">
                {step === 1
                  ? 'Preencha seus dados para liberar a leitura resumida e entender como a Vertho pode apoiar.'
                  : pre?.scopeLabel
                    ? `Já encontramos: ${pre.scopeLabel}. Confirme ou ajuste os dados abaixo.`
                    : 'Conte um pouco sobre sua escola ou rede.'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/55 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {step !== 'done' && (
          <div className="h-1 bg-white/[0.06] mx-6 rounded-full overflow-hidden mt-2">
            <div className="h-full transition-all" style={{ width: step === 1 ? '50%' : '100%', background: '#34c5cc' }} />
          </div>
        )}

        {/* Body */}
        <div className="p-6">
          {step === 1 && (
            <form onSubmit={avancarPasso1} className="space-y-3">
              <Field label="Seu nome" value={nome} onChange={setNome} required />
              <Field label="E-mail profissional" type="email" value={email} onChange={setEmail} required />
              <Field label="WhatsApp (opcional)" value={whatsapp} onChange={setWhatsapp} placeholder="(11) 99999-9999" />
              <Field label="Cargo" value={cargo} onChange={setCargo} required placeholder="ex: diretor(a), secretário(a), gestor de rede" />
              {error && <p className="text-[11px] text-red-300">{error}</p>}
              <button
                type="submit"
                disabled={!passo1Valido}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                  color: '#06172C',
                }}
              >
                Continuar <ArrowRight size={14} />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={enviar} className="space-y-3">
              <Field label="Escola ou rede" value={instituicao} onChange={setInstituicao} required />
              <Field label="Município" value={municipio} onChange={setMunicipio} placeholder="opcional" />
              <div>
                <p className="text-[11px] text-white/65 mb-1.5">Tipo de instituição</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTipo('publica')}
                    className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                      tipo === 'publica' ? 'border-cyan-400/50 text-cyan-300' : 'border-white/10 text-white/55 hover:border-white/20'
                    }`}
                    style={{ background: tipo === 'publica' ? 'rgba(52,197,204,0.08)' : 'rgba(255,255,255,0.02)' }}>
                    Pública
                  </button>
                  <button type="button" onClick={() => setTipo('privada')}
                    className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                      tipo === 'privada' ? 'border-cyan-400/50 text-cyan-300' : 'border-white/10 text-white/55 hover:border-white/20'
                    }`}
                    style={{ background: tipo === 'privada' ? 'rgba(52,197,204,0.08)' : 'rgba(255,255,255,0.02)' }}>
                    Privada
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Qtde alunos (aprox.)" value={qtdAlunos} onChange={setQtdAlunos} placeholder="opcional" />
                <Field label="Qtde escolas (aprox.)" value={qtdEscolas} onChange={setQtdEscolas} placeholder="opcional" />
              </div>
              <label className="flex items-start gap-2 cursor-pointer text-[11px] text-white/65 leading-relaxed">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-cyan-400" />
                <span>
                  Concordo com o tratamento dos meus dados conforme a LGPD para fins de geração do
                  diagnóstico e contato comercial pela Vertho.
                </span>
              </label>
              {error && <p className="text-[11px] text-red-300">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-full text-xs text-white/65 hover:text-white inline-flex items-center gap-1.5">
                  <ArrowLeft size={12} /> Voltar
                </button>
                <button type="submit" disabled={!passo2Valido || submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-all disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                    color: '#06172C',
                  }}>
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Receber diagnóstico
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'rgba(52,211,153,0.18)' }}>
                <CheckCircle size={28} style={{ color: '#34D399' }} />
              </div>
              <p className="text-sm text-white/85 leading-relaxed mb-4">
                Diagnóstico solicitado. A equipe Vertho entrará em contato para ajudar a transformar a
                leitura em plano de ação.
              </p>
              <div className="mt-4">
                <button onClick={handleWhatsApp}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[13px] font-bold transition-all"
                  style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#06172C' }}>
                  <WhatsappIcon size={16} /> Agendar conversa
                </button>
              </div>
              <button onClick={onClose} className="mt-3 text-[11px] text-white/40 hover:text-white/65">
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required, placeholder,
}: {
  label: string; value: string; onChange: (s: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-white/65 mb-1">{label} {required && <span className="text-cyan-400">*</span>}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/40"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      />
    </label>
  );
}
