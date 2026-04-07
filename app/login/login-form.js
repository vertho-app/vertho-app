'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';

export default function LoginForm({ branding }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('otp'); // otp | password
  const [status, setStatus] = useState('idle'); // idle | loading | sent | error
  const [errorMsg, setErrorMsg] = useState('');
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

  async function handleLogin(e) {
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

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectTo}`,
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
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
          Digite seu e-mail para acessar
        </p>

        {status === 'sent' ? (
          /* ── Link enviado ── */
          <div className="bg-white/10 rounded-xl p-6 border border-white/15">
            <div className="text-3xl mb-3">&#9993;&#65039;</div>
            <p className="font-semibold mb-1" style={{ color: fontColor || '#FFFFFF' }}>Link enviado!</p>
            <p className="text-sm" style={{ color: fontColorSecondary || '#FFFFFF99' }}>
              Verifique sua caixa de entrada em{' '}
              <span className="font-medium" style={{ color: accentColor }}>{email}</span>{' '}
              e clique no link para acessar.
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
              style={{ '--tw-ring-color': accentColor }}
              onFocus={e => (e.target.style.borderColor = accentColor)}
              onBlur={e => (e.target.style.borderColor = '')}
            />
            {mode === 'password' && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete="current-password"
                className="w-full mt-3 py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
                onFocus={e => (e.target.style.borderColor = accentColor)}
                onBlur={e => (e.target.style.borderColor = '')}
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

            <button type="button" onClick={() => setMode(mode === 'otp' ? 'password' : 'otp')}
              className="mt-3 text-xs hover:underline" style={{ color: accentColor }}>
              {mode === 'otp' ? 'Entrar com senha' : 'Entrar com Magic Link'}
            </button>

            {status === 'error' && errorMsg && (
              <p className="text-danger text-sm mt-3">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
