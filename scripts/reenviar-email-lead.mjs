#!/usr/bin/env node
// Reenvia email com PDF pra leads que estão "pronto" mas não receberam email.
// Usa o pdf_url signed já gerado e baixa o PDF como anexo.
//
// Uso: node scripts/reenviar-email-lead.mjs <leadId>
//      sem args, processa todos com pdf_status=pronto e criados nas últimas 24h
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RKEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM?.replace(/^"|"$/g, '') || 'Vertho <noreply@vertho.ai>';

async function pg(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.json();
}

const leadId = process.argv[2];
const filter = leadId
  ? `id=eq.${leadId}`
  : `pdf_status=eq.pronto&criado_em=gte.${new Date(Date.now()-24*3600*1000).toISOString()}`;

const leads = await pg(`diag_leads?select=*&${filter}&order=criado_em.desc&limit=20`);
console.log(`Leads a reenviar: ${leads.length}`);

for (const lead of leads) {
  if (!lead.pdf_url || !lead.email) {
    console.log(`  ${lead.id}: pula (sem pdf_url ou email)`);
    continue;
  }
  console.log(`  ${lead.id} → ${lead.email}`);

  // Baixa o PDF
  const pdfRes = await fetch(lead.pdf_url);
  if (!pdfRes.ok) {
    console.log(`    ✗ download PDF falhou: ${pdfRes.status}`);
    continue;
  }
  const buffer = Buffer.from(await pdfRes.arrayBuffer());
  const base64 = buffer.toString('base64');
  console.log(`    PDF: ${(buffer.length / 1024).toFixed(0)}KB`);

  const scopeLabel = lead.scope_type === 'escola' ? `escola ${lead.scope_id}` : `município ${lead.scope_id}`;
  const saud = lead.nome ? `Olá, ${lead.nome.split(' ')[0]}!` : 'Olá!';
  const html = `<!doctype html><html><body style="font-family:sans-serif;background:#f6f7fb;padding:24px;">
    <table cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="background:#0f2b54;padding:24px 28px;color:#fff;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34c5cc;">Vertho Radar</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">Seu diagnóstico está pronto</h1>
      </td></tr>
      <tr><td style="padding:28px;color:#1e293b;line-height:1.65;font-size:14px;">
        <p>${saud}</p>
        <p>Preparamos seu diagnóstico Vertho. O PDF está anexado e disponível pelo link abaixo (válido por 30 dias):</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${lead.pdf_url}" style="background:#34c5cc;color:#0f2b54;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Baixar PDF</a>
        </p>
      </td></tr>
    </table></body></html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RKEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [lead.email],
      subject: `Diagnóstico Vertho — ${scopeLabel}`,
      html,
      attachments: [{ filename: `vertho-radar-${lead.scope_type}-${lead.scope_id}.pdf`, content: base64 }],
    }),
  });
  const out = await r.json();
  console.log(`    Resend ${r.status}: ${out.id || JSON.stringify(out).slice(0, 200)}`);
}
