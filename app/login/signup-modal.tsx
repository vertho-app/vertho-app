'use client';

import { useState, useEffect } from 'react';

type Branding = {
  tenantName: string;
  fontColor: string;
  fontColorSecondary: string;
  primaryColor: string;
  primaryColorEnd: string;
  accentColor: string;
};

export type SignupResult = { success: true } | { error: string };

export default function SignupModal({
  email,
  redirectTo,
  branding,
  onClose,
  onSuccess,
}: {
  email: string;
  redirectTo: string;
  branding: Branding;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [telefone, setTelefone] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cargos, setCargos] = useState<{ id: string; nome: string }[]>([]);
  const [cargosLoaded, setCargosLoaded] = useState(false);

  const { tenantName, fontColor, fontColorSecondary, primaryColor, primaryColorEnd, accentColor } = branding;

  // Carrega cargos cadastrados na empresa pra montar o dropdown
  useEffect(() => {
    fetch('/api/auth/cargos')
      .then((r) => r.json())
      .then((d) => setCargos(d.cargos || []))
      .catch(() => setCargos([]))
      .finally(() => setCargosLoaded(true));
  }, []);

  // Trava scroll do body enquanto modal aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Esc fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Máscara simples de telefone (BR): (XX) XXXXX-XXXX
  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg('');

    const nomeTrimmed = nome.trim();
    const telefoneDigits = telefone.replace(/\D/g, '');

    if (nomeTrimmed.length < 2) {
      setErrorMsg('Digite seu nome completo.');
      setStatus('error');
      return;
    }
    if (telefoneDigits.length < 10) {
      setErrorMsg('Telefone com DDD obrigatório.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          nome_completo: nomeTrimmed,
          cargo: cargo.trim() || null,
          telefone: telefoneDigits,
          redirectTo,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || 'Não foi possível criar o cadastro.');
        setStatus('error');
        return;
      }
      onSuccess();
    } catch (err: any) {
      setErrorMsg(`Erro de rede: ${err.message}`);
      setStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl p-6 sm:p-7 border"
        style={{
          background: 'linear-gradient(180deg,#0f1d33,#091d33)',
          borderColor: 'rgba(255,255,255,0.10)',
          color: fontColor || '#FFFFFF',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <p className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: accentColor }}>
            {tenantName} · cadastro
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white text-xl leading-none -mt-1"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <h2 className="text-[20px] font-bold mb-1" style={{ color: fontColor || '#FFFFFF' }}>
          Bem-vindo!
        </h2>
        <p className="text-[13px] mb-5" style={{ color: fontColorSecondary || '#FFFFFF99' }}>
          Você ainda não tem cadastro. Preencha pra criar seu acesso.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="E-mail" required>
            <input
              type="email"
              value={email}
              readOnly
              disabled
              className="w-full py-2.5 px-3 rounded-lg border-2 border-white/10 bg-white/[0.04] text-white/60 text-[14px] outline-none cursor-not-allowed"
            />
          </Field>

          <Field label="Nome completo" required>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como você quer ser chamado(a)"
              autoComplete="name"
              autoFocus
              className="w-full py-2.5 px-3 rounded-lg border-2 border-white/10 bg-white/[0.06] text-white text-[14px] outline-none placeholder:text-white/30 transition-colors"
              onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
              onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = '')}
            />
          </Field>

          <Field label="WhatsApp" required hint="Pra receber o link de acesso">
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(formatPhone(e.target.value))}
              placeholder="(11) 91234-5678"
              autoComplete="tel"
              inputMode="tel"
              className="w-full py-2.5 px-3 rounded-lg border-2 border-white/10 bg-white/[0.06] text-white text-[14px] outline-none placeholder:text-white/30 transition-colors"
              onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
              onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = '')}
            />
          </Field>

          <Field
            label="Cargo"
            hint={!cargosLoaded ? 'Carregando…' : cargos.length === 0 ? 'Opcional' : 'Selecione'}
          >
            {cargos.length > 0 ? (
              <div className="relative">
                <select
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  className="w-full appearance-none py-2.5 pl-3 pr-9 rounded-lg border-2 border-white/10 bg-white/[0.06] text-white text-[14px] outline-none transition-colors cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                  onFocus={(e) => ((e.target as HTMLSelectElement).style.borderColor = accentColor)}
                  onBlur={(e) => ((e.target as HTMLSelectElement).style.borderColor = '')}
                >
                  <option value="" style={{ background: '#0f1d33' }}>
                    {cargosLoaded ? '— selecione —' : 'Carregando…'}
                  </option>
                  {cargos.map((c) => (
                    <option key={c.id} value={c.nome} style={{ background: '#0f1d33' }}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-[10px]"
                  aria-hidden="true"
                >
                  ▼
                </span>
              </div>
            ) : (
              // Empresa sem cargos cadastrados — fallback pra input texto livre
              <input
                type="text"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex: Diretor pedagógico"
                autoComplete="organization-title"
                disabled={!cargosLoaded}
                className="w-full py-2.5 px-3 rounded-lg border-2 border-white/10 bg-white/[0.06] text-white text-[14px] outline-none placeholder:text-white/30 transition-colors"
                onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
                onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
            )}
          </Field>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full mt-2 py-3 rounded-xl border-none text-white text-[14px] font-bold tracking-wide cursor-pointer transition-opacity disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorEnd})` }}
          >
            {status === 'loading' ? 'Criando acesso...' : 'Criar acesso e enviar link'}
          </button>

          {status === 'error' && errorMsg && (
            <p className="text-[12.5px] mt-1" style={{ color: '#fca5a5' }}>{errorMsg}</p>
          )}

          <p className="text-[11px] text-center mt-3" style={{ color: fontColorSecondary || '#FFFFFF66' }}>
            Ao se cadastrar, você concorda em receber o link de acesso por e-mail e WhatsApp.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-left">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] font-bold tracking-[0.05em] text-white/85">
          {label}{required && <span className="text-white/40 ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10.5px] text-white/40">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
