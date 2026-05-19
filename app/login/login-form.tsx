'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import SignupModal from './signup-modal';

export default function LoginForm({ branding }: { branding: any }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'otp' | 'password' | 'whatsapp'>('otp');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [waStep, setWaStep] = useState<'phone' | 'code'>('phone');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  const router = useRouter();
  const supabase = getSupabase();

  const {
    tenantName,
    logoUrl,
    fontColor,
    fontColorSecondary,
    primaryColor,
    primaryColorEnd,
    accentColor,
    bgGradientStart,
    bgGradientEnd,
    subtitle,
  } = branding;

  // Detect redirect param
  const [redirectTo, setRedirectTo] = useState('/dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redir = params.get('redirect');
    if (redir && redir.startsWith('/')) setRedirectTo(redir);
  }, []);

  // Se já está logado, redireciona
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(redirectTo);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.replace(redirectTo);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [redirectTo]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!trimmed || !trimmed.includes('@')) {
      setErrorMsg('Digite um e-mail válido.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    if (mode === 'password' && password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (error) {
        setErrorMsg(error.message);
        setStatus('error');
      }
      // Se sucesso, o onAuthStateChange redireciona
      return;
    }

    // Antes de mandar magic-link, checa se o email existe nesse tenant.
    // Se não existir e o tenant aceita open signup (sys_config.allow_open_signup),
    // abre modal de cadastro em vez de seguir o fluxo padrão.
    try {
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const check = await checkRes.json();
      if (!checkRes.ok) {
        setErrorMsg(check?.error || 'Erro ao verificar email.');
        setStatus('error');
        return;
      }
      if (!check.exists && check.allowSignup) {
        setShowSignup(true);
        setStatus('idle');
        return;
      }
      if (!check.exists && !check.allowSignup) {
        setErrorMsg('Email não cadastrado. Procure o administrador da empresa.');
        setStatus('error');
        return;
      }
      // exists === true → segue fluxo magic-link tradicional
    } catch (e: any) {
      setErrorMsg(`Erro de rede: ${e.message}`);
      setStatus('error');
      return;
    }

    // /api/auth/magic-link cuida de TUDO server-side:
    // - gera link via admin.generateLink (sem rate limit)
    // - envia email via Resend
    // - dispara WhatsApp via Z-API se telefone cadastrado
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, redirectTo: `${window.location.origin}${redirectTo}` }),
      });
      const data = await res.json();
      if (data?.error) {
        setErrorMsg(data.error);
        setStatus('error');
      } else if (data?.success) {
        setStatus('sent');
      } else {
        setErrorMsg('Não foi possível enviar o link. Tente novamente.');
        setStatus('error');
      }
    } catch (e: any) {
      setErrorMsg(`Erro de rede: ${e.message}`);
      setStatus('error');
    }
  }

  async function handleWhatsappRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMsg('Digite seu WhatsApp com DDD.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/phone-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: digits }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || 'Não foi possível enviar o código.');
        setStatus('error');
        return;
      }
      setWaStep('code');
      setStatus('idle');
    } catch (err: any) {
      setErrorMsg(`Erro de rede: ${err.message}`);
      setStatus('error');
    }
  }

  async function handleWhatsappVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codeClean = code.replace(/\D/g, '');
    if (codeClean.length !== 6) {
      setErrorMsg('Digite o código de 6 dígitos.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/phone-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: phone.replace(/\D/g, ''),
          code: codeClean,
          redirectTo: `${window.location.origin}${redirectTo}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error || !data?.callbackUrl) {
        setErrorMsg(data?.error || 'Código inválido.');
        setStatus('error');
        return;
      }
      // /auth/callback estabelece a sessão Supabase (mesmo caminho do magic-link).
      window.location.href = data.callbackUrl;
    } catch (err: any) {
      setErrorMsg(`Erro de rede: ${err.message}`);
      setStatus('error');
    }
  }

  function switchToWhatsapp() {
    setMode('whatsapp');
    setWaStep('phone');
    setStatus('idle');
    setErrorMsg('');
  }

  function switchToEmail() {
    setMode('otp');
    setStatus('idle');
    setErrorMsg('');
  }

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ background: `linear-gradient(180deg, ${bgGradientStart} 0%, ${bgGradientEnd} 100%)` }}
    >
      <div className="w-full max-w-[360px] text-center">
        {/* Logo — imagem custom ou texto */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={tenantName}
            className="h-14 mx-auto mb-4 object-contain"
          />
        ) : (
          <h1
            className="text-4xl font-bold tracking-tight mb-2"
            style={{ color: accentColor }}
          >
            {tenantName}
          </h1>
        )}

        <p className="text-lg font-semibold mb-1" style={{ color: fontColor || '#FFFFFF' }}>
          {subtitle}
        </p>
        <p className="text-sm mb-7" style={{ color: fontColorSecondary || '#FFFFFF99' }}>
          {mode === 'whatsapp'
            ? (waStep === 'phone' ? 'Digite seu WhatsApp para receber o código' : 'Digite o código que enviamos no seu WhatsApp')
            : 'Digite seu e-mail para acessar'}
        </p>

        {mode === 'whatsapp' ? (
          /* ── Login por WhatsApp (OTP) ── */
          waStep === 'phone' ? (
            <form onSubmit={handleWhatsappRequest}>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="DDD + número (ex: 11912345678)"
                autoComplete="tel"
                className="w-full py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
                onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
                onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full mt-4 py-3.5 rounded-xl border-none text-white text-base font-bold tracking-wide cursor-pointer transition-opacity disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorEnd})` }}
              >
                {status === 'loading' ? 'Enviando...' : 'Enviar código'}
              </button>
              <button type="button" onClick={switchToEmail}
                className="mt-3 text-xs hover:underline" style={{ color: accentColor }}>
                Entrar com e-mail
              </button>
              {status === 'error' && errorMsg && (
                <p className="text-danger text-sm mt-3">{errorMsg}</p>
              )}
            </form>
          ) : (
            <form onSubmit={handleWhatsappVerify}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoComplete="one-time-code"
                className="w-full py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-2xl text-center tracking-[0.5em] outline-none placeholder:text-white/30 transition-colors"
                onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
                onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full mt-4 py-3.5 rounded-xl border-none text-white text-base font-bold tracking-wide cursor-pointer transition-opacity disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorEnd})` }}
              >
                {status === 'loading' ? 'Entrando...' : 'Entrar'}
              </button>
              <button type="button" onClick={() => { setWaStep('phone'); setCode(''); setStatus('idle'); setErrorMsg(''); }}
                className="mt-3 text-xs hover:underline" style={{ color: accentColor }}>
                Reenviar / trocar número
              </button>
              {status === 'error' && errorMsg && (
                <p className="text-danger text-sm mt-3">{errorMsg}</p>
              )}
            </form>
          )
        ) : status === 'sent' ? (
          /* ── Link enviado ── */
          <div className="bg-white/10 rounded-xl p-6 border border-white/15">
            <div className="text-3xl mb-3">🔐</div>
            <p className="font-semibold mb-1" style={{ color: fontColor || '#FFFFFF' }}>Link enviado!</p>
            <p className="text-sm" style={{ color: fontColorSecondary || '#FFFFFF99' }}>
              Clique no link enviado no seu <strong>e-mail</strong> ou <strong>WhatsApp</strong> para acessar seu ambiente de desenvolvimento.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-sm font-medium hover:underline"
              style={{ color: accentColor }}
            >
              Usar outro e-mail
            </button>
          </div>
        ) : (
          /* ── Formulário ── */
          <form onSubmit={handleLogin}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              className="w-full py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
              style={{ ['--tw-ring-color' as any]: accentColor }}
              onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
              onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
            />
            {mode === 'password' && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete="current-password"
                className="w-full mt-3 py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
                onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
                onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
            )}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full mt-4 py-3.5 rounded-xl border-none text-white text-base font-bold tracking-wide cursor-pointer transition-opacity disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorEnd})` }}
            >
              {status === 'loading' ? 'Verificando...' : mode === 'password' ? 'Entrar com senha' : 'Entrar'}
            </button>

            <div className="mt-3 flex flex-col items-center gap-1.5">
              <button type="button" onClick={() => setMode(mode === 'otp' ? 'password' : 'otp')}
                className="text-xs hover:underline" style={{ color: accentColor }}>
                {mode === 'otp' ? 'Entrar com senha' : 'Entrar com Magic Link'}
              </button>
              <button type="button" onClick={switchToWhatsapp}
                className="text-xs hover:underline" style={{ color: accentColor }}>
                Não tenho e-mail · entrar com WhatsApp
              </button>
            </div>

            {status === 'error' && errorMsg && (
              <p className="text-danger text-sm mt-3">{errorMsg}</p>
            )}
          </form>
        )}
      </div>

      {showSignup && (
        <SignupModal
          email={email.trim().toLowerCase()}
          redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}${redirectTo}`}
          branding={{
            tenantName: tenantName || 'Vertho',
            fontColor: fontColor || '#FFFFFF',
            fontColorSecondary: fontColorSecondary || '#FFFFFF99',
            primaryColor: primaryColor || '#34c5cc',
            primaryColorEnd: primaryColorEnd || '#2aa8ae',
            accentColor: accentColor || '#34c5cc',
          }}
          onClose={() => setShowSignup(false)}
          onSuccess={() => {
            setShowSignup(false);
            setStatus('sent');
          }}
        />
      )}
    </div>
  );
}
