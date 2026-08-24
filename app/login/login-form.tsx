'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { localeCookieName } from '@/lib/i18n';
import { locales } from '@/i18n/routing';
import SignupModal from './signup-modal';
import AvisoNavegadorEmbutido from '@/components/auth/aviso-navegador-embutido';

// O painel da equipe Vertho não é um tenant: ele vive no endereço genérico
// (`app.vertho.ai`), e é o `next` pedido — não o cadastro — que faz a sessão
// nascer lá (ver o bloco "O DESTINO PEDIDO MANDA NO HOST" em
// `api/auth/magic-link`). `/admin` sozinho não tem página: a porta é o dashboard.
const DESTINO_PAINEL = '/admin/dashboard';
const ehDestinoDoPainel = (path: string) => /^\/admin(-v2)?(\/|$|\?)/.test(path);

export default function LoginForm({ branding, embutido = false, ios = false }: { branding: any; embutido?: boolean; ios?: boolean }) {
  const t = useTranslations('Login');
  const common = useTranslations('Common');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 'login' = tela unificada (e-mail OU WhatsApp); 'password' = e-mail + senha
  const [mode, setMode] = useState<'login' | 'password'>('login');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  // true depois que o OTP por WhatsApp foi solicitado → mostra o campo de código
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  // Organizações do e-mail quando o login não vem de um subdomínio de tenant.
  // Vazio = nada a perguntar (o caso normal: subdomínio, ou uma empresa só).
  const [orgs, setOrgs] = useState<Array<{ slug: string; nome: string }>>([]);
  // Equipe Vertho: o painel da plataforma entra como uma opção a mais na mesma
  // tela. Não é uma empresa — por isso não cabe em `orgs`.
  const [painelAdmin, setPainelAdmin] = useState(false);
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
  // Por que a pessoa caiu aqui vindo de um link de acesso.
  const [avisoLink, setAvisoLink] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redir = params.get('redirect');
    if (redir && redir.startsWith('/')) setRedirectTo(redir);

    // 🔴 O `?error=` chegava aqui desde sempre e NINGUÉM o lia (medido 18/08):
    // quem clicava num link já usado via a tela de login limpa, sem uma palavra
    // sobre o que aconteceu — e a conclusão natural é "o sistema não funciona".
    // Ficou mais provável desde que a tela do link entra sozinha: reabrir a
    // mensagem antiga do WhatsApp agora consome sem passar por um botão.
    //
    // ⚠️ A mensagem do Supabase NÃO vai para a tela. Ela vem em inglês ("Email
    // link is invalid or has expired") e é detalhe de fornecedor; aqui traduzimos
    // para o que a pessoa precisa FAZER.
    const erro = params.get('error');
    if (erro) {
      setAvisoLink(
        erro === 'indisponivel' ? t('linkErrors.unavailable') : t('linkErrors.expired'),
      );
      // Tira o parâmetro da URL: recarregar a página não deve repetir o aviso de
      // um link que a pessoa já desistiu de usar.
      params.delete('error');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  function handleLocaleChange(nextLocale: string) {
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  // Se já está logado, redireciona.
  //
  // ⚠️ getUser() (valida o token na rede) e NÃO getSession(): getSession devolve
  // a sessão que o client guarda em MEMÓRIA, que sobrevive ao cookie morto. Com
  // ela, o /login mandava de volta pra rota protegida, cujo gate server-side via
  // anônimo e mandava de novo pro /login — o pisca-pisca de 22/07. Aqui a
  // pergunta é a MESMA que o servidor faz, então os dois lados não divergem.
  useEffect(() => {
    let vivo = true;

    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!vivo) return;
      if (user) {
        router.replace(redirectTo);
        return;
      }
      // 4xx = o servidor de auth recusou o token (morto/ausente): limpa o
      // resíduo local pra não reencenar o laço. 0/5xx = rede — NÃO desloga.
      const status = (error as any)?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.replace(redirectTo);
        }
      }
    );

    return () => { vivo = false; subscription.unsubscribe(); };
  }, [redirectTo]);

  // Fluxo de e-mail: senha (se mode==='password') ou check-email → magic-link/signup.
  async function submitEmail(trimmed: string) {
    if (!trimmed.includes('@')) {
      setErrorMsg(t('errors.invalidEmail'));
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    if (mode === 'password' && password) {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
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
        setErrorMsg(check?.error || t('errors.checkEmail'));
        setStatus('error');
        return;
      }
      if (!check.exists && check.allowSignup) {
        setShowSignup(true);
        setStatus('idle');
        return;
      }
      if (!check.exists && !check.allowSignup) {
        setErrorMsg(t('errors.emailNotRegistered'));
        setStatus('error');
        return;
      }
      // Sem subdomínio de tenant, o mesmo e-mail pode existir em mais de uma
      // organização. Perguntar é o que faz o link nascer NA CASA certa: o
      // cookie de sessão fica preso ao host exato, e o botão do template de
      // WhatsApp precisa do slug para existir. Antes disso, o registro era
      // sorteado e a sessão nascia num host sem tenant.
      //
      // Para quem administra a plataforma há um destino a mais, que não é
      // empresa nenhuma: o painel. Sem ele na lista, os platform admins (todos
      // com cadastro em 2+ empresas) só tinham como escolher um tenant — e a
      // sessão nascia no subdomínio, longe do painel.
      const listaOrgs: Array<{ slug: string; nome: string }> =
        Array.isArray(check.orgs) ? check.orgs : [];
      const painel = check.painelPlataforma === true;

      // Quem JÁ pediu o painel (`/login?redirect=/admin/...`) não tem o que
      // escolher: nesse caso a rota do magic link ignora a organização e manda a
      // sessão nascer no host genérico. Perguntar aqui seria uma pergunta cuja
      // resposta é jogada fora.
      if (painel && ehDestinoDoPainel(redirectTo)) {
        await enviarMagicLink(trimmed);
        return;
      }
      if (painel && listaOrgs.length === 0) {
        await enviarMagicLink(trimmed, undefined, DESTINO_PAINEL);
        return;
      }
      if (listaOrgs.length + (painel ? 1 : 0) > 1) {
        setOrgs(listaOrgs);
        setPainelAdmin(painel);
        setStatus('idle');
        return;
      }
      // exists === true → segue fluxo magic-link tradicional
    } catch (e: any) {
      setErrorMsg(t('errors.network', { message: e.message }));
      setStatus('error');
      return;
    }

    await enviarMagicLink(trimmed);
  }

  /**
   * Pede o link de acesso. `empresaSlug` só viaja quando a pessoa escolheu a
   * organização na tela — no subdomínio do tenant ele é ignorado pelo servidor,
   * que prefere o host.
   *
   * `destino` sobrescreve o `redirectTo` da página para esta chamada só. Existe
   * para a opção do painel: o destino é o que decide o HOST em que a sessão
   * nasce, então mandar `/dashboard` (o padrão) devolveria a pessoa ao tenant.
   */
  async function enviarMagicLink(trimmed: string, empresaSlug?: string, destino?: string) {
    setStatus('loading');
    setErrorMsg('');

    // /api/auth/magic-link cuida de TUDO server-side:
    // - gera link via admin.generateLink (sem rate limit)
    // - envia email via Resend
    // - dispara WhatsApp pelo template da Cloud API
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          redirectTo: `${window.location.origin}${destino || redirectTo}`,
          locale,
          ...(empresaSlug ? { empresaSlug } : {}),
        }),
      });
      const data = await res.json();
      if (data?.error) {
        setErrorMsg(data.error);
        setStatus('error');
      } else if (data?.success) {
        setStatus('sent');
      } else {
        setErrorMsg(t('errors.sendLink'));
        setStatus('error');
      }
    } catch (e: any) {
      setErrorMsg(t('errors.network', { message: e.message }));
      setStatus('error');
    }
  }

  /**
   * Fluxo de WhatsApp: envia magic link direto pelo WhatsApp.
   *
   * ⚠️ DECISÃO DE PRODUTO (14/08/2026): fica o magic link, e NÃO o OTP por
   * código. Chegou a ser trocado e foi revertido no mesmo dia — a troca é de UX,
   * não só de canal, e não compensava o ganho técnico.
   *
   * O que isso implica, e é bom estar escrito:
   *  - **O magic link não sai pela Cloud API oficial.** Link de acesso foi
   *    rejeitado como UTILITY e como MARKETING (`INCORRECT_CATEGORY` nos dois):
   *    a Meta trata login como AUTHENTICATION, e template de autenticação carrega
   *    CÓDIGO com botão de copiar, não link. Então este fluxo continua no
   *    caminho por QR (Z-API), que é o que caiu em 11 e 13/08.
   *  - No período medido, o magic link por WhatsApp teve **88 falhas para 23
   *    sucessos**; o mesmo magic link por E-MAIL teve **83 sucessos e 0 falhas**.
   *
   * A infra do OTP fica pronta e inerte (`otp_acesso` aprovado na Meta,
   * `enviarTemplateOtp`, `/api/auth/phone-otp/*`): se um dia a confiabilidade do
   * acesso pesar mais que a UX, é trocar o endpoint desta função.
   */
  async function submitWhatsapp(digits: string) {
    if (digits.length < 10) {
      setErrorMsg(t('errors.invalidWhatsapp'));
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/phone-magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: digits, redirectTo: `${window.location.origin}${redirectTo}`, locale }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || t('errors.sendLink'));
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch (err: any) {
      setErrorMsg(t('errors.network', { message: err.message }));
      setStatus('error');
    }
  }

  // Submit unificado: e-mail tem prioridade; senão WhatsApp.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const digits = phone.replace(/\D/g, '');

    // Modo senha é sempre por e-mail.
    if (mode === 'password') {
      await submitEmail(trimmedEmail);
      return;
    }

    if (trimmedEmail) {
      await submitEmail(trimmedEmail); // e-mail vence quando ambos preenchidos
    } else if (digits) {
      await submitWhatsapp(digits);
    } else {
      setErrorMsg(t('errors.emptyIdentifier'));
      setStatus('error');
    }
  }

  async function handleWhatsappVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codeClean = code.replace(/\D/g, '');
    if (codeClean.length !== 6) {
      setErrorMsg(t('errors.invalidCodeLength'));
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
        setErrorMsg(data?.error || t('errors.invalidCode'));
        setStatus('error');
        return;
      }
      // /auth/callback estabelece a sessão Supabase (mesmo caminho do magic-link).
      window.location.href = data.callbackUrl;
    } catch (err: any) {
      setErrorMsg(t('errors.network', { message: err.message }));
      setStatus('error');
    }
  }

  // Uma régua só para a lista e para o texto acima dela — as duas divergindo
  // dariam um "Entre com seu e-mail" em cima de uma lista de organizações.
  const mostrarEscolhaDeOrg = orgs.length + (painelAdmin ? 1 : 0) > 1;

  const promptText = awaitingCode
    ? t('whatsappCodePrompt')
    : mostrarEscolhaDeOrg
      ? t('chooseOrgPrompt')
      : mode === 'password'
        ? t('emailPrompt')
        : t('unifiedPrompt');

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ background: `linear-gradient(180deg, ${bgGradientStart} 0%, ${bgGradientEnd} 100%)` }}
    >
      <div className="absolute right-4 top-4">
        <select
          value={locale}
          onChange={(e) => handleLocaleChange(e.target.value)}
          aria-label="Idioma"
          className="rounded-lg border border-white/10 bg-white/[0.08] px-2 py-1 text-xs text-white outline-none"
          style={{ colorScheme: 'dark' }}
        >
          {locales.map((item) => (
            <option key={item} value={item} style={{ background: '#091D35' }}>
              {common(`locales.${item}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="w-full max-w-[360px] text-center">
        {/* Logo — imagem custom ou texto */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={tenantName}
            className="h-28 mx-auto mb-4 object-contain"
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
          {promptText}
        </p>

        {/* Só aparece dentro de app embutido — e chegar aqui já prova que NESTE
            navegador não há sessão. Ver o componente para o porquê de isto viver
            no login, e não no link. */}
        {embutido ? <AvisoNavegadorEmbutido ios={ios} /> : null}

        {/* Chegou aqui vindo de um link de acesso que não deu certo. */}
        {avisoLink ? (
          <p className="mb-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-left text-[13px] leading-relaxed text-amber-100">
            {avisoLink}
          </p>
        ) : null}

        {awaitingCode ? (
          /* ── Passo de código (OTP por WhatsApp) ── */
          <form onSubmit={handleWhatsappVerify}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('codePlaceholder')}
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
              {status === 'loading' ? t('entering') : common('actions.enter')}
            </button>
            <button type="button" onClick={() => { setAwaitingCode(false); setCode(''); setStatus('idle'); setErrorMsg(''); }}
              className="mt-3 text-xs hover:underline" style={{ color: accentColor }}>
              {t('resendOrChangePhone')}
            </button>
            {status === 'error' && errorMsg && (
              <p className="text-danger text-sm mt-3">{errorMsg}</p>
            )}
          </form>
        ) : mostrarEscolhaDeOrg ? (
          /* ── Em qual organização? (só sem subdomínio de tenant) ── */
          <div className="flex flex-col gap-2">
            {/* Equipe Vertho: primeiro da lista porque é o destino de quem
                administra a plataforma — as empresas abaixo são o cadastro de
                colaborador da mesma pessoa. */}
            {painelAdmin && (
              <button
                type="button"
                disabled={status === 'loading'}
                onClick={() => {
                  setOrgs([]);
                  setPainelAdmin(false);
                  enviarMagicLink(email.trim().toLowerCase(), undefined, DESTINO_PAINEL);
                }}
                className="w-full py-3.5 px-4 rounded-xl border-2 bg-white/[0.08] text-white text-base font-semibold cursor-pointer transition-colors hover:bg-white/[0.14] disabled:opacity-60"
                style={{ borderColor: accentColor }}
              >
                {t('platformPanelOption')}
              </button>
            )}
            {orgs.map((org) => (
              <button
                key={org.slug}
                type="button"
                disabled={status === 'loading'}
                onClick={() => { setOrgs([]); enviarMagicLink(email.trim().toLowerCase(), org.slug); }}
                className="w-full py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base cursor-pointer transition-colors hover:bg-white/[0.14] disabled:opacity-60"
                onFocus={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = accentColor)}
                onBlur={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = '')}
              >
                {org.nome}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setOrgs([]); setPainelAdmin(false); setStatus('idle'); setErrorMsg(''); }}
              className="mt-1 text-sm font-medium hover:underline"
              style={{ color: accentColor }}
            >
              {t('useAnotherEmail')}
            </button>
            {status === 'error' && errorMsg && (
              <p className="text-danger text-sm mt-1">{errorMsg}</p>
            )}
          </div>
        ) : status === 'sent' ? (
          /* ── Link enviado ── */
          <div className="bg-white/10 rounded-xl p-6 border border-white/15">
            <div className="text-3xl mb-3">🔐</div>
            <p className="font-semibold mb-1" style={{ color: fontColor || '#FFFFFF' }}>{t('linkSentTitle')}</p>
            <p className="text-sm" style={{ color: fontColorSecondary || '#FFFFFF99' }}>
              {t.rich('linkSentDescription', {
                email: (chunks) => <strong>{chunks}</strong>,
                whatsapp: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-sm font-medium hover:underline"
              style={{ color: accentColor }}
            >
              {t('useAnotherEmail')}
            </button>
          </div>
        ) : (
          /* ── Formulário unificado (e-mail OU WhatsApp) ── */
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              autoComplete="email"
              className="w-full py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
              style={{ ['--tw-ring-color' as any]: accentColor }}
              onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
              onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
            />

            {mode === 'password' ? (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                autoComplete="current-password"
                className="w-full mt-3 py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
                onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
                onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
            ) : (
              <>
                {/* divisor "ou" */}
                <div className="flex items-center gap-3 my-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-white/15" />
                  <span className="text-xs uppercase tracking-wide" style={{ color: fontColorSecondary || '#FFFFFF99' }}>
                    {t('orDivider')}
                  </span>
                  <span className="h-px flex-1 bg-white/15" />
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder={t('phonePlaceholder')}
                  autoComplete="tel"
                  className="w-full py-3.5 px-4 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-base text-center outline-none placeholder:text-white/40 transition-colors"
                  onFocus={e => ((e.target as HTMLInputElement).style.borderColor = accentColor)}
                  onBlur={e => ((e.target as HTMLInputElement).style.borderColor = '')}
                />
              </>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full mt-4 py-3.5 rounded-xl border-none text-white text-base font-bold tracking-wide cursor-pointer transition-opacity disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorEnd})` }}
            >
              {status === 'loading' ? t('checking') : mode === 'password' ? t('enterWithPassword') : common('actions.enter')}
            </button>

            <div className="mt-3 flex flex-col items-center gap-1.5">
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'password' : 'login'); setStatus('idle'); setErrorMsg(''); }}
                className="text-xs hover:underline" style={{ color: accentColor }}>
                {mode === 'login' ? t('enterWithPassword') : t('enterWithMagicLink')}
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
