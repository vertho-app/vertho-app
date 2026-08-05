import { Resend } from 'resend';
import { EMAIL_FROM_DEFAULT } from '@/lib/domain';
import type { AppLocale } from '@/i18n/routing';
import { magicLinkEmail, magicLinkWhatsapp, signupEmail, signupWhatsapp } from '@/lib/i18n-auth-templates';
import { sendWhatsapp } from '@/lib/whatsapp';
import { isTenantDemo } from '@/lib/demo/envio-guard';

/**
 * Serviço CENTRAL de envio de link de acesso (magic link) por canal.
 *
 * Existe para acabar com o "sucesso silencioso": cada canal devolve um status
 * EXPLÍCITO (`sent` | `skipped` | `failed`) + o motivo quando não envia, e
 * `anySent` diz se ALGO saiu de fato. O chamador nunca deve reportar sucesso ao
 * usuário sem checar `anySent`.
 *
 * Centraliza o que antes estava reimplementado em ~8 rotas (magic-link, signup,
 * pulse, whatsapp-lote, …). Não gera o magic link nem resolve tenant — recebe os
 * links já montados (cada rota monta seu callback com token_hash/redirect).
 */

export type ChannelStatus = 'sent' | 'skipped' | 'failed';

export type SendAccessLinkResult = {
  email: ChannelStatus;
  whatsapp: ChannelStatus;
  emailReason?: string;
  whatsappReason?: string;
  /** true se pelo menos um canal foi realmente enviado */
  anySent: boolean;
};

export type SendAccessLinkInput = {
  /** email de destino */
  to: string;
  telefone?: string | null;
  nome: string;
  empresaNome: string;
  /** tenant de origem — quando é demo (is_demo), o envio real é bloqueado. */
  empresaId?: string | null;
  locale: AppLocale;
  /** link já montado para o corpo do email (callback com token_hash ou action_link) */
  emailLink?: string | null;
  /** link já montado para o WhatsApp (callback com token_hash) */
  whatsappLink?: string | null;
  /** canais a tentar; default: ambos */
  channels?: Array<'email' | 'whatsapp'>;
  /** conjunto de templates: 'magic-link' (login, default) ou 'signup' (boas-vindas) */
  kind?: 'magic-link' | 'signup';
};

async function enviarEmail(p: SendAccessLinkInput, out: SendAccessLinkResult): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    out.email = 'failed';
    out.emailReason = 'RESEND_API_KEY ausente';
    return;
  }
  if (!p.emailLink) {
    out.email = 'skipped';
    out.emailReason = 'link de email não disponível';
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const buildEmail = p.kind === 'signup' ? signupEmail : magicLinkEmail;
    const tpl = buildEmail(p.locale, { nome: p.nome, empresaNome: p.empresaNome, link: p.emailLink });
    const r = await resend.emails.send({ from: EMAIL_FROM_DEFAULT, to: p.to, subject: tpl.subject, html: tpl.html });
    if ((r as any)?.error) {
      out.email = 'failed';
      out.emailReason = String((r as any).error?.message || (r as any).error).slice(0, 200);
    } else {
      out.email = 'sent';
    }
  } catch (e: any) {
    out.email = 'failed';
    out.emailReason = String(e?.message || e).slice(0, 200);
  }
}

async function enviarWhatsapp(p: SendAccessLinkInput, out: SendAccessLinkResult): Promise<void> {
  if (!p.telefone) {
    out.whatsapp = 'skipped';
    out.whatsappReason = 'colaborador sem telefone';
    return;
  }
  if (!p.whatsappLink) {
    out.whatsapp = 'skipped';
    out.whatsappReason = 'link de whatsapp não disponível';
    return;
  }
  const buildWa = p.kind === 'signup' ? signupWhatsapp : magicLinkWhatsapp;
  const msg = buildWa(p.locale, { nome: p.nome, empresaNome: p.empresaNome, link: p.whatsappLink });
  // Serviço central: normaliza telefone + failover entre provedores (Z-API → WaSender).
  const r = await sendWhatsapp(
    { kind: 'text', phone: p.telefone, text: msg },
    { kind: p.kind === 'signup' ? 'signup' : 'magic_link', empresaId: p.empresaId ?? null }
  );
  if (r.ok) {
    out.whatsapp = 'sent';
  } else {
    out.whatsapp = 'failed';
    out.whatsappReason = (r.reason || 'falha no envio').slice(0, 200);
  }
}

/**
 * Decide se um email é elegível para receber link e extrai nome/telefone da
 * mensagem, a partir do resultado dos lookups (colaborador + platform admin).
 * Função PURA (testável sem DB). Elegível = é colaborador OU platform admin.
 * Quando nenhum, `eligible:false` → o chamador devolve sucesso genérico SEM
 * enviar (anti-enumeração) — sem cair no "sucesso silencioso" de quem existe.
 */
export function recipientFromLookup(
  colab: { nome_completo: string | null; telefone: string | null } | null | undefined,
  platformAdmin: { nome: string | null } | null | undefined,
): { eligible: boolean; nome: string; telefone: string | null } {
  if (!colab && !platformAdmin) return { eligible: false, nome: '', telefone: null };
  const nomeBase = colab?.nome_completo || platformAdmin?.nome || '';
  return { eligible: true, nome: nomeBase.split(' ')[0] || '', telefone: colab?.telefone ?? null };
}

export async function sendAccessLink(p: SendAccessLinkInput): Promise<SendAccessLinkResult> {
  const channels = p.channels ?? ['email', 'whatsapp'];
  const out: SendAccessLinkResult = { email: 'skipped', whatsapp: 'skipped', anySent: false };

  // Gate de tenant-demo: em ambiente de demonstração, nunca sai link real
  // (cobre o auto-cadastro aberto — allow_open_signup — que era o vetor de
  // envio a contato REAL durante uma demo). Sessão de demo é mintada
  // server-side sem passar por aqui, então este gate não a afeta.
  if (p.empresaId && (await isTenantDemo(p.empresaId))) {
    out.email = 'skipped';
    out.whatsapp = 'skipped';
    out.emailReason = out.whatsappReason = 'ambiente de demonstração (envio desligado)';
    out.anySent = false;
    return out;
  }

  if (channels.includes('email')) await enviarEmail(p, out);
  if (channels.includes('whatsapp')) await enviarWhatsapp(p, out);

  out.anySent = out.email === 'sent' || out.whatsapp === 'sent';
  return out;
}
