'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { sendWhatsapp } from '@/lib/whatsapp';

// Envio de WhatsApp centralizado em lib/whatsapp (multi-provedor com failover).
// Estas actions só preservam as assinaturas públicas + os gates de admin e
// delegam o transporte/normalização/failover ao serviço.

function toResult(r: Awaited<ReturnType<typeof sendWhatsapp>>, okMsg: string) {
  return r.ok
    ? { success: true as const, message: okMsg, provider: r.provider, data: r }
    : { success: false as const, error: r.reason };
}

// ── Enviar mensagem de texto via WhatsApp ───────────────────────────────────

/**
 * Auth: requer admin OU sistema interno. Quando `internal=true`, pula
 * `requireAdminAction` — usado por triggers automáticos do servidor
 * (ex.: notificação do tutor ao concluir missão integradora no Onboarding).
 */
export async function enviarWhatsApp(telefone: string, mensagem: string, internal: boolean = false) {
  if (!internal) await requireAdminAction('assessments.dispatch');
  const r = await sendWhatsapp({ kind: 'text', phone: telefone, text: mensagem });
  return toResult(r, 'Mensagem enviada');
}

// ── Enviar PDF via WhatsApp ─────────────────────────────────────────────────

export async function enviarPDF(telefone: string, pdfBase64: string, filename: string) {
  await requireAdminAction('assessments.dispatch');
  const r = await sendWhatsapp({ kind: 'document', phone: telefone, base64: pdfBase64, filename: filename || 'documento.pdf' });
  return toResult(r, 'PDF enviado');
}

// ── Enviar áudio (voz) via WhatsApp ─────────────────────────────────────────

/**
 * Envia um áudio (MP3) como mensagem de voz. `audioUrl` deve ser uma URL HTTPS
 * publicamente acessível pelos servidores do provedor (ex.: signed URL do
 * Supabase com TTL suficiente). `internal=true` pula o gate de admin.
 */
export async function enviarAudio(telefone: string, audioUrl: string, internal: boolean = false) {
  if (!internal) await requireAdminAction('assessments.dispatch');
  const r = await sendWhatsapp({ kind: 'audio', phone: telefone, url: audioUrl });
  return toResult(r, 'Áudio enviado');
}

// ── Enviar link via WhatsApp ────────────────────────────────────────────────

export async function enviarLink(telefone: string, url: string, titulo: string) {
  await requireAdminAction('assessments.dispatch');
  const r = await sendWhatsapp({ kind: 'link', phone: telefone, url, title: titulo || 'Vertho Mentor IA', text: titulo || '' });
  return toResult(r, 'Link enviado');
}
