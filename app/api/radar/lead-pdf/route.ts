import { NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { montarPropostaPayload } from '@/lib/radar/proposta-pdf-data';
import RadarPropostaPDF from '@/components/pdf/RadarPropostaPDF';
import { EMAIL_FROM_DEFAULT } from '@/lib/domain';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function verifyQStashSignature(req: Request, body: string): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    console.warn('[radar/lead-pdf] Signing keys ausentes — pulando verificação');
    return true;
  }
  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get('upstash-signature') || '';
    await receiver.verify({ signature, body });
    return true;
  } catch (err: any) {
    console.error('[radar/lead-pdf] Assinatura QStash inválida:', err?.message);
    return false;
  }
}

export async function POST(req: Request) {
  let leadId: string | null = null;
  const sb = createSupabaseAdmin();

  try {
    const rawBody = await req.text();
    const valid = await verifyQStashSignature(req, rawBody);
    if (!valid) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });

    const payload = JSON.parse(rawBody);
    leadId = payload.leadId;
    if (!leadId) return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 });

    // ── 1. Lê o lead ───────────────────────────────────────────────
    const { data: lead, error: leadErr } = await sb
      .from('diag_leads').select('*').eq('id', leadId).single();
    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    await sb.from('diag_leads').update({ pdf_status: 'processando' }).eq('id', leadId);

    // ── 2. Monta payload (busca dados + IA proposta cacheada) ──────
    const propostaPayload = await montarPropostaPayload(lead.scope_type, lead.scope_id);
    if (!propostaPayload) {
      await sb.from('diag_leads').update({
        pdf_status: 'erro',
        pdf_erro: 'Escopo não encontrado para gerar proposta.',
      }).eq('id', leadId);
      return NextResponse.json({ error: 'Escopo não encontrado' }, { status: 404 });
    }

    // ── 3. Renderiza PDF ───────────────────────────────────────────
    const logoBase64 = getLogoCoverBase64();
    const pdfBuffer = await renderToBuffer(
      // @ts-ignore - JSX em route handler com renderToBuffer
      React.createElement(RadarPropostaPDF, {
        payload: propostaPayload,
        logoBase64: logoBase64 || undefined,
        destinatario: { nome: lead.nome, organizacao: lead.organizacao, cargo: lead.cargo },
      }),
    );

    // ── 4. Upload no bucket ────────────────────────────────────────
    const fileName = `${leadId}.pdf`;
    const path = `${lead.scope_type}/${lead.scope_id}/${fileName}`;
    const { error: upErr } = await sb.storage
      .from('diag-relatorios')
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

    // Signed URL válida por 30 dias
    const { data: signed } = await sb.storage
      .from('diag-relatorios')
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    const pdfUrl = signed?.signedUrl || '';

    // ── 5. Atualiza lead ───────────────────────────────────────────
    await sb.from('diag_leads').update({
      pdf_status: 'pronto',
      pdf_path: path,
      pdf_url: pdfUrl,
      pdf_gerado_em: new Date().toISOString(),
    }).eq('id', leadId);

    // ── 6. Envia email via Resend ──────────────────────────────────
    if (process.env.RESEND_API_KEY && lead.email) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: EMAIL_FROM_DEFAULT,
          to: lead.email,
          subject: `Diagnóstico Vertho — ${propostaPayload.scopeLabel}`,
          html: emailHtml({
            nome: lead.nome,
            scopeLabel: propostaPayload.scopeLabel,
            pdfUrl,
          }),
          attachments: [
            {
              filename: `vertho-radar-${propostaPayload.scopeType}-${propostaPayload.scopeId}.pdf`,
              content: pdfBuffer.toString('base64'),
            },
          ],
        });
      } catch (emailErr: any) {
        console.error('[radar/lead-pdf] Resend falhou:', emailErr?.message);
        // Não marca como erro — PDF está pronto e URL signed funciona
      }
    }

    return NextResponse.json({ ok: true, leadId, pdfUrl });
  } catch (err: any) {
    console.error('[radar/lead-pdf] FATAL', err);
    if (leadId) {
      await sb.from('diag_leads').update({
        pdf_status: 'erro',
        pdf_erro: String(err?.message || err).slice(0, 500),
      }).eq('id', leadId);
    }
    // 500 sinaliza pro QStash retentar
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}

function emailHtml({ nome, scopeLabel, pdfUrl }: { nome: string | null; scopeLabel: string; pdfUrl: string }) {
  const saud = nome ? `Olá, ${nome.split(' ')[0]}!` : 'Olá!';
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;padding:24px;">
  <table cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#0f2b54;padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34c5cc;">Vertho Radar</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">Seu diagnóstico está pronto</h1>
    </td></tr>
    <tr><td style="padding:28px;color:#1e293b;line-height:1.65;font-size:14px;">
      <p>${saud}</p>
      <p>Preparamos seu diagnóstico Vertho para <strong>${scopeLabel}</strong>. O PDF está anexado e também disponível pelo link abaixo (válido por 30 dias):</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${pdfUrl}" style="background:#34c5cc;color:#0f2b54;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Baixar PDF</a>
      </p>
      <p>O documento traz uma leitura institucional dos indicadores oficiais do INEP, pontos de atenção e próximos passos sugeridos. Tudo gerado a partir de dados públicos.</p>
      <p style="margin-top:24px;color:#64748b;font-size:12px;">Quer aprofundar ou conversar sobre como o Mentor IA pode apoiar sua secretaria? Responda este e-mail ou escreva para <a href="mailto:radar@vertho.ai" style="color:#0f2b54;">radar@vertho.ai</a>.</p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:16px 28px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;">
      Vertho Mentor IA · radar.vertho.ai · Confidencial
    </td></tr>
  </table>
</body></html>`;
}
