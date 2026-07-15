/**
 * Builders + envio da PÍLULA semanal (conteúdo do dia da trilha), compartilhados
 * entre o cron `triggerDiario` (actions/cron-jobs.ts) e disparos manuais.
 *
 * A pílula NÃO carrega o arquivo do conteúdo — ela leva um DEEP-LINK que abre o
 * app no formato PREFERIDO do colaborador (os demais formatos ficam disponíveis
 * lá dentro). O link usa a URL do TENANT (ex.: ibipeba.vertho.ai), não a genérica.
 *
 * Canais: WhatsApp (texto) + e-mail (Resend). Ambos com o mesmo tema/formato.
 */

import { EMAIL_FROM_DEFAULT } from '@/lib/domain';

const LABEL_FORMATO: Record<string, string> = {
  video: 'vídeo 🎬',
  audio: 'áudio 🎧',
  texto: 'texto 📖',
  case: 'estudo de caso 📋',
};

export function labelFormato(formato?: string | null): string {
  return LABEL_FORMATO[formato || ''] || 'conteúdo';
}

/** Tema da pílula ("competência — descritor") a partir de um item de conteudos_dia. */
export function temaPilula(e: any): string {
  const comp = e?.competencia ? String(e.competencia).trim() : '';
  const desc = e?.descritor ? String(e.descritor).trim() : '';
  const titulo = e?.conteudo?.core_titulo || e?.conteudo?.titulo || '';
  return [comp, desc].filter(Boolean).join(' — ') || titulo || 'novo conteúdo da semana';
}

/**
 * Deep-link da semana no tenant, já no formato preferido. `baseUrl` = ex.
 * https://ibipeba.vertho.ai. `pilula` (1|2) marca de qual pílula DUO veio o clique,
 * pra atribuição de abertura (`?p=`); ausente = abertura direta/navegação.
 */
export function deepLinkSemana(baseUrl: string, semana: number, formato?: string | null, pilula?: number | null): string {
  const params = new URLSearchParams();
  if (formato) params.set('formato', formato);
  if (pilula) params.set('p', String(pilula));
  const qs = params.toString();
  return `${baseUrl}/dashboard/temporada/semana/${semana}${qs ? `?${qs}` : ''}`;
}

type PilulaOpts = { formato?: string | null; semana: number; baseUrl: string; pilula?: number | null };

/** Corpo (sem saudação) do texto WhatsApp da pílula, com deep-link no formato preferido. */
export function textoPilulaWhatsapp(e: any, opts: PilulaOpts): string {
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula);
  return `Seu ${labelFormato(opts.formato)} de hoje: *${temaPilula(e)}*.\n\n👉 ${link}`;
}

/** Assunto + HTML do e-mail da pílula (espelho do WhatsApp, com botão pro deep-link). */
export function emailPilula(nome: string, e: any, opts: PilulaOpts): { subject: string; html: string } {
  const tema = temaPilula(e);
  const link = deepLinkSemana(opts.baseUrl, opts.semana, opts.formato, opts.pilula);
  const primeiro = (nome || 'Colaborador').split(' ')[0];
  const subject = `Sua pílula da Semana ${opts.semana} — ${tema}`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
<p>Olá, ${primeiro}! 📚</p>
<p>Sua <strong>Pílula de Aprendizagem — Semana ${opts.semana}</strong> já está disponível.</p>
<p>Seu <strong>${labelFormato(opts.formato)}</strong> de hoje: <strong>${tema}</strong>.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Acessar minha pílula →</a></p>
<p style="color:#666;font-size:14px">Todos os formatos ficam disponíveis na plataforma.</p>
<p style="color:#666;font-size:14px">— Equipe Vertho</p></div>`;
  return { subject, html };
}

/** Envia e-mail via Resend. NUNCA lança — devolve {ok, reason}. */
export async function enviarEmailPilula(to: string, subject: string, html: string): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'sem RESEND_API_KEY' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: EMAIL_FROM_DEFAULT, to, subject, html }),
    });
    if (!r.ok) return { ok: false, reason: `${r.status} ${(await r.text()).slice(0, 120)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
