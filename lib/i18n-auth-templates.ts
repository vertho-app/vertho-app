import { APP_URL } from '@/lib/domain';
import { AppLocale } from '@/i18n/routing';

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const copy = {
  'pt-BR': {
    hello: (name: string) => name ? `Olá, ${escapeHtml(name)}!` : 'Olá!',
    accessTitle: 'Seu link de acesso',
    accessSubject: (company: string) => `${company} — seu link de acesso`,
    accessBody: 'Clique no botão abaixo para entrar — sem precisar de senha. O link expira em 24 horas.',
    cta: 'Entrar agora',
    fallback: 'Se o botão não funcionar, copie o link abaixo no seu navegador:',
    ignore: 'Se você não solicitou este e-mail, ignore-o. Nenhuma ação será feita sem seu clique.',
    footer: 'Este é um e-mail automático, não responda.',
    welcomeTitle: 'Bem-vindo!',
    welcomeSubject: (company: string) => `${company} — bem-vindo!`,
    welcomeBody: 'Seu cadastro foi criado. Clique no botão abaixo para entrar — sem precisar de senha. O link expira em 24 horas.',
    whatsappAccess: (name: string, company: string, link: string) => `Olá, ${name}! 🔐\n\nSeu link de acesso à *${company}*:\n${link}\n\nClique para entrar direto, sem senha.\nEste link expira em 24h.`,
    whatsappWelcome: (name: string, company: string, link: string) => `Olá, ${name}! Bem-vindo à *${company}*! 🎉\n\nSeu link de acesso:\n${link}\n\nClique para entrar direto, sem senha.\nEste link expira em 24h.`,
    otp: (company: string, code: string) => `*${company}* — seu código de acesso:\n\n*${code}*\n\nDigite esse código no app para entrar. Ele expira em 10 minutos.\nSe você não solicitou, ignore esta mensagem.`,
    otpSms: (company: string, code: string) => `${company}: seu código é ${code}. Expira em 10 minutos.`,
  },
  'pt-PT': {
    hello: (name: string) => name ? `Olá, ${escapeHtml(name)}!` : 'Olá!',
    accessTitle: 'O seu link de acesso',
    accessSubject: (company: string) => `${company} — o seu link de acesso`,
    accessBody: 'Clique no botão abaixo para entrar — sem precisar de palavra-passe. O link expira em 24 horas.',
    cta: 'Entrar agora',
    fallback: 'Se o botão não funcionar, copie o link abaixo no seu navegador:',
    ignore: 'Se não solicitou este e-mail, ignore-o. Nenhuma ação será feita sem o seu clique.',
    footer: 'Este é um e-mail automático, não responda.',
    welcomeTitle: 'Bem-vindo!',
    welcomeSubject: (company: string) => `${company} — bem-vindo!`,
    welcomeBody: 'O seu registo foi criado. Clique no botão abaixo para entrar — sem precisar de palavra-passe. O link expira em 24 horas.',
    whatsappAccess: (name: string, company: string, link: string) => `Olá, ${name}! 🔐\n\nO seu link de acesso à *${company}*:\n${link}\n\nClique para entrar diretamente, sem palavra-passe.\nEste link expira em 24h.`,
    whatsappWelcome: (name: string, company: string, link: string) => `Olá, ${name}! Bem-vindo à *${company}*! 🎉\n\nO seu link de acesso:\n${link}\n\nClique para entrar diretamente, sem palavra-passe.\nEste link expira em 24h.`,
    otp: (company: string, code: string) => `*${company}* — o seu código de acesso:\n\n*${code}*\n\nIntroduza este código na app para entrar. Expira em 10 minutos.\nSe não solicitou, ignore esta mensagem.`,
    otpSms: (company: string, code: string) => `${company}: o seu código é ${code}. Expira em 10 minutos.`,
  },
  'es-ES': {
    hello: (name: string) => name ? `Hola, ${escapeHtml(name)}!` : 'Hola!',
    accessTitle: 'Tu enlace de acceso',
    accessSubject: (company: string) => `${company} — tu enlace de acceso`,
    accessBody: 'Haz clic en el botón para entrar sin contraseña. El enlace caduca en 24 horas.',
    cta: 'Entrar ahora',
    fallback: 'Si el botón no funciona, copia el enlace en tu navegador:',
    ignore: 'Si no solicitaste este correo, ignóralo. No se hará ninguna acción sin tu clic.',
    footer: 'Este es un correo automático, no respondas.',
    welcomeTitle: '¡Bienvenido!',
    welcomeSubject: (company: string) => `${company} — ¡bienvenido!`,
    welcomeBody: 'Tu registro fue creado. Haz clic en el botón para entrar sin contraseña. El enlace caduca en 24 horas.',
    whatsappAccess: (name: string, company: string, link: string) => `Hola, ${name}! 🔐\n\nTu enlace de acceso a *${company}*:\n${link}\n\nHaz clic para entrar directamente, sin contraseña.\nEste enlace caduca en 24h.`,
    whatsappWelcome: (name: string, company: string, link: string) => `Hola, ${name}! ¡Bienvenido a *${company}*! 🎉\n\nTu enlace de acceso:\n${link}\n\nHaz clic para entrar directamente, sin contraseña.\nEste enlace caduca en 24h.`,
    otp: (company: string, code: string) => `*${company}* — tu código de acceso:\n\n*${code}*\n\nIntroduce este código en la app para entrar. Caduca en 10 minutos.\nSi no lo solicitaste, ignora este mensaje.`,
    otpSms: (company: string, code: string) => `${company}: tu código es ${code}. Caduca en 10 minutos.`,
  },
  'en-US': {
    hello: (name: string) => name ? `Hi, ${escapeHtml(name)}!` : 'Hi!',
    accessTitle: 'Your access link',
    accessSubject: (company: string) => `${company} — your access link`,
    accessBody: 'Click the button below to sign in without a password. This link expires in 24 hours.',
    cta: 'Sign in now',
    fallback: 'If the button does not work, copy the link below into your browser:',
    ignore: 'If you did not request this email, you can ignore it. No action will be taken without your click.',
    footer: 'This is an automated email. Please do not reply.',
    welcomeTitle: 'Welcome!',
    welcomeSubject: (company: string) => `${company} — welcome!`,
    welcomeBody: 'Your account has been created. Click the button below to sign in without a password. This link expires in 24 hours.',
    whatsappAccess: (name: string, company: string, link: string) => `Hi, ${name}! 🔐\n\nYour access link for *${company}*:\n${link}\n\nTap to sign in directly, no password needed.\nThis link expires in 24h.`,
    whatsappWelcome: (name: string, company: string, link: string) => `Hi, ${name}! Welcome to *${company}*! 🎉\n\nYour access link:\n${link}\n\nTap to sign in directly, no password needed.\nThis link expires in 24h.`,
    otp: (company: string, code: string) => `*${company}* — your access code:\n\n*${code}*\n\nEnter this code in the app to sign in. It expires in 10 minutes.\nIf you did not request it, ignore this message.`,
    otpSms: (company: string, code: string) => `${company}: your code is ${code}. It expires in 10 minutes.`,
  },
} satisfies Record<AppLocale, any>;

function baseEmailHtml({ eyebrow, title, greeting, body, link, footer }: {
  eyebrow: string;
  title: string;
  greeting: string;
  body: string;
  link: string;
  footer?: string;
}, locale: AppLocale) {
  const c = copy[locale];
  const logoUrl = `${APP_URL}/logo-vertho.png`;
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;padding:24px;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#0f2b54;padding:24px 28px;color:#fff;">
      <img src="${logoUrl}" alt="Vertho" height="22" style="height:22px;display:block;margin-bottom:14px;border:0;outline:none;text-decoration:none;" />
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34c5cc;">${escapeHtml(eyebrow)}</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">${title}</h1>
    </td></tr>
    <tr><td style="padding:28px;color:#1e293b;line-height:1.65;font-size:14px;">
      <p>${greeting}</p>
      <p>${body}</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#34c5cc;color:#0f2b54;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block;">${c.cta}</a>
      </p>
      <p style="font-size:12px;color:#64748b;">${c.fallback}</p>
      <p style="font-size:11px;color:#64748b;word-break:break-all;background:#f8fafc;padding:8px;border-radius:6px;">${escapeHtml(link)}</p>
      ${footer ? `<p style="margin-top:24px;color:#94a3b8;font-size:12px;">${footer}</p>` : ''}
    </td></tr>
  </table>
</body></html>`;
}

export function magicLinkEmail(locale: AppLocale, params: { nome: string; empresaNome: string; link: string }) {
  const c = copy[locale];
  return {
    subject: c.accessSubject(params.empresaNome),
    html: baseEmailHtml({
      eyebrow: params.empresaNome,
      title: c.accessTitle,
      greeting: c.hello(params.nome),
      body: c.accessBody,
      link: params.link,
      footer: c.ignore,
    }, locale),
  };
}

export function signupEmail(locale: AppLocale, params: { nome: string; empresaNome: string; link: string }) {
  const c = copy[locale];
  return {
    subject: c.welcomeSubject(params.empresaNome),
    html: baseEmailHtml({
      eyebrow: params.empresaNome,
      title: c.welcomeTitle,
      greeting: c.hello(params.nome),
      body: c.welcomeBody,
      link: params.link,
    }, locale),
  };
}

export function magicLinkWhatsapp(locale: AppLocale, params: { nome: string; empresaNome: string; link: string }) {
  return copy[locale].whatsappAccess(params.nome, params.empresaNome, params.link);
}

export function signupWhatsapp(locale: AppLocale, params: { nome: string; empresaNome: string; link: string }) {
  return copy[locale].whatsappWelcome(params.nome, params.empresaNome, params.link);
}

export function otpWhatsapp(locale: AppLocale, params: { empresaNome: string; code: string }) {
  return copy[locale].otp(params.empresaNome, params.code);
}

/**
 * Nome de empresa cortado para caber num SMS.
 *
 * SMS cobra por SEGMENTO: 160 caracteres em GSM-7, mas apenas **70** quando há
 * qualquer acento — e "código" tem. Com o nome inteiro, um tenant como
 * "Secretaria Municipal de Ibipeba/BA" (34 chars) empurraria toda mensagem para
 * dois segmentos, dobrando o custo de cada login. Em 20 caracteres, as quatro
 * copies abaixo cabem em um segmento com folga.
 *
 * Corta em espaço quando dá, para não partir palavra no meio.
 */
function nomeCurtoSms(nome: string, max = 20): string {
  const limpo = nome.trim();
  if (limpo.length <= max) return limpo;
  const cortado = limpo.slice(0, max);
  const ultimoEspaco = cortado.lastIndexOf(' ');
  return (ultimoEspaco > max / 2 ? cortado.slice(0, ultimoEspaco) : cortado).trim();
}

/**
 * OTP por SMS — contingência de quando o WhatsApp está fora (13/08/2026).
 *
 * NÃO é a copy do WhatsApp reaproveitada, e não pode ser: SMS não interpreta
 * `*negrito*` (os asteriscos chegam literais), não quebra bem em várias linhas
 * e é pago por segmento. Por isso: uma frase, sem markdown, sem emoji e sem a
 * linha "se você não solicitou" — que é boa prática em mensagem gratuita e
 * custaria um segundo segmento aqui.
 */
export function otpSms(locale: AppLocale, params: { empresaNome: string; code: string }) {
  return copy[locale].otpSms(nomeCurtoSms(params.empresaNome), params.code);
}
