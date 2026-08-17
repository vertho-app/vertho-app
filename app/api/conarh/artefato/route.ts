import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { EMAIL_FROM_DEFAULT } from '@/lib/domain';
import { sendWhatsapp } from '@/lib/whatsapp';
import { mapaEvolucaoUrl, primeiroNome } from '@/lib/conarh/conteudo';
import { mensagemT0 } from '@/lib/conarh/mensagens';
import { enviarPorTemplate } from '@/lib/notifications/pilula-template';

/**
 * CONARH 52 — worker T+0 do artefato (F5 do sprint consolidado).
 *
 * Recebe { leadId } da captura (actions/lead-comercial.ts) e entrega:
 *   (a) WhatsApp T+0 ao lead citando a porta e a competência dele + link do
 *       Mapa da Evolução (/conarh/mapa/{id}); se marcou reunião no estande,
 *       confirma data/hora na mesma mensagem;
 *   (b) e-mail Resend com o mesmo link, quando há e-mail.
 * Ao final marca followup_step=1 (T+0 executado) — a régua T+1→T+5 parte daí.
 *
 * Autenticação (mesmo padrão de app/api/radar/lead-pdf):
 *   1. header x-internal-dispatch == INTERNAL_DISPATCH_SECRET, ou
 *   2. assinatura QStash (QSTASH_CURRENT/NEXT_SIGNING_KEY);
 *   sem nenhum dos dois configurados → FAIL-CLOSED em produção.
 *
 * Envs novas: nenhuma direta (CONARH_ALERT_WHATSAPP é usada na captura/régua).
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

async function verifyRequest(req: Request, body: string): Promise<boolean> {
  // 1) Bypass via header interno (server-to-server fallback quando QStash não está configurado).
  const internalSecret = process.env.INTERNAL_DISPATCH_SECRET;
  if (internalSecret) {
    const headerToken = req.headers.get('x-internal-dispatch') || '';
    if (safeSecretEqual(headerToken, internalSecret)) return true;
  }

  // 2) QStash signature
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[conarh/artefato] FAIL-CLOSED: nem signing keys nem internal secret em produção');
      return false;
    }
    console.warn('[conarh/artefato] dev/preview sem signing keys — pulando verificação');
    return true;
  }
  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get('upstash-signature') || '';
    await receiver.verify({ signature, body });
    return true;
  } catch (err: any) {
    console.error('[conarh/artefato] Assinatura QStash inválida:', err?.message);
    return false;
  }
}

export async function POST(req: Request) {
  let leadId: string | null = null;
  const sb = createSupabaseAdmin();

  try {
    const rawBody = await req.text();
    const valid = await verifyRequest(req, rawBody);
    if (!valid) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });

    const payload = JSON.parse(rawBody);
    leadId = payload.leadId;
    if (!leadId) return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 });

    const { data: lead, error: leadErr } = await sb
      .from('diag_leads').select('*').eq('id', leadId).single();
    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }
    // Só serve a campanha da feira — o endpoint é acionável por fila e não
    // deve virar remetente genérico de WhatsApp para qualquer diag_lead.
    if (lead.scope_id !== 'conarh-2026') {
      return NextResponse.json({ error: 'Lead fora da campanha CONARH' }, { status: 400 });
    }

    const mapaUrl = mapaEvolucaoUrl(lead.id);

    // ── (a) WhatsApp T+0 ─────────────────────────────────────────────
    // Best-effort: falha NÃO derruba o worker (e-mail ainda sai e o step
    // avança — a régua re-tenta contato em T+1).
    let whatsappEnviado: 'sim' | 'sem-telefone' | 'erro' = 'sem-telefone';
    let whatsappErro: string | null = null;
    if (lead.telefone) {
      try {
        // 1) Template aprovado pela Cloud API — o caminho que funciona.
        //
        // 🔴 O legado (`sendWhatsapp`, texto livre) depende da Z-API, DESCONECTADA
        // desde 11/08: medido em 17/08, 388 falhas com "zapi: saúde: desconectada",
        // a última um segundo depois de um lead entrar. O recorte não saía.
        //
        // ⚠️ O lead é contato FRIO — nunca escreveu para o nosso número. Fora da
        // janela de 24h só sai TEMPLATE; texto livre volta 131047. Por isso o
        // detalhe variável (porta, competência crítica, reunião marcada) não vem
        // na mensagem: template não tem bloco condicional, e todo `{{n}}` precisa
        // de valor sempre. Esse detalhe vive na página do Mapa.
        //
        // Enquanto `WHATSAPP_TEMPLATE_RECORTE` não estiver setada (o template
        // está PENDING na Meta), `tentou` volta false e o legado assume — mesmo
        // comportamento de hoje, sem regressão.
        const viaTemplate = mapaUrl
          ? await enviarPorTemplate('recorte', {
              telefone: lead.telefone,
              nome: primeiroNome(lead.nome) || 'Olá',
              semana: 1, tema: '', slug: '', baseUrl: '',
              formato: null, pilula: null,
              linkDireto: mapaUrl,
              // Lead comercial não tem tenant nem colaborador — os dois são null
              // de propósito, e é o que distingue este papel de todos os outros.
              empresaId: null, colaboradorId: null,
              dedupeKey: `conarh-recorte:${lead.id}`,
            })
          : { tentou: false, ok: false, reason: 'sem link do mapa' };

        if (viaTemplate.tentou) {
          // NÃO cai no legado quando o template foi tentado: ele pode ter sido
          // aceito e falhado depois, e dois recortes na mesma conversa é ruído
          // para o lead.
          whatsappEnviado = viaTemplate.ok ? 'sim' : 'erro';
          if (!viaTemplate.ok) {
            whatsappErro = String(viaTemplate.reason || '').slice(0, 300);
            console.error('[conarh/artefato] template falhou:', whatsappErro);
          }
        } else {
          const r = await sendWhatsapp({ kind: 'text', phone: lead.telefone, text: mensagemT0(lead) });
          if (r.ok) {
            whatsappEnviado = 'sim';
          } else {
            whatsappEnviado = 'erro';
            whatsappErro = String(r.reason || '').slice(0, 300);
            console.error('[conarh/artefato] WhatsApp falhou:', whatsappErro);
          }
        }
      } catch (err: any) {
        whatsappEnviado = 'erro';
        whatsappErro = String(err?.message || err).slice(0, 300);
        console.error('[conarh/artefato] WhatsApp exception:', whatsappErro);
      }
    }

    // ── (b) E-mail com o mesmo link ──────────────────────────────────
    let emailEnviado: 'sim' | 'sem-key' | 'sem-email' | 'erro' = 'sem-email';
    let emailErrMsg: string | null = null;
    if (!lead.email) {
      emailEnviado = 'sem-email';
    } else if (!process.env.RESEND_API_KEY) {
      emailEnviado = 'sem-key';
      console.error('[conarh/artefato] RESEND_API_KEY ausente em runtime');
    } else {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const sendResult = await resend.emails.send({
          from: EMAIL_FROM_DEFAULT,
          to: lead.email,
          subject: 'Seu Mapa da Evolução — Vertho no CONARH',
          html: emailHtml({ nome: lead.nome, mapaUrl }),
        });
        if ((sendResult as any)?.error) {
          emailEnviado = 'erro';
          emailErrMsg = JSON.stringify((sendResult as any).error).slice(0, 300);
          console.error('[conarh/artefato] Resend retornou erro:', emailErrMsg);
        } else {
          emailEnviado = 'sim';
        }
      } catch (err: any) {
        emailEnviado = 'erro';
        emailErrMsg = String(err?.message || err).slice(0, 300);
        console.error('[conarh/artefato] Resend exception:', emailErrMsg);
      }
    }

    // ── Marca T+0 executado ──────────────────────────────────────────
    // `.lt('followup_step', 1)`: se a régua já avançou este lead (reenvio de
    // fila atrasado), o step NUNCA regride.
    await sb.from('diag_leads')
      .update({ followup_step: 1 })
      .eq('id', leadId)
      .lt('followup_step', 1);

    return NextResponse.json({ ok: true, leadId, mapaUrl, whatsappEnviado, whatsappErro, emailEnviado, emailErrMsg });
  } catch (err: any) {
    console.error('[conarh/artefato] FATAL', err);
    // 500 sinaliza pro QStash retentar
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailHtml({ nome, mapaUrl }: { nome: string | null; mapaUrl: string }) {
  const nome1 = primeiroNome(nome);
  const saud = nome1 ? `Olá, ${escapeHtml(nome1)}!` : 'Olá!';
  const safeUrl = escapeHtml(mapaUrl);
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;padding:24px;">
  <table cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#0f2b54;padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34c5cc;">Vertho · CONARH 52</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">Seu Mapa da Evolução</h1>
    </td></tr>
    <tr><td style="padding:28px;color:#1e293b;line-height:1.65;font-size:14px;">
      <p>${saud}</p>
      <p>Como combinado no estande, aqui está o seu Mapa da Evolução: 1 página com o problema que você descreveu, o ciclo completo das 5 etapas e 3 perguntas para revisar o processo atual. O formato é feito para ser lido em dois minutos — e para circular com o time, na tela ou impresso.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${safeUrl}" style="background:#34c5cc;color:#0f2b54;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Abrir o Mapa da Evolução</a>
      </p>
      <p style="margin-top:24px;color:#64748b;font-size:12px;">Quer aprofundar? Responda este e-mail ou a mensagem que te enviamos no WhatsApp.</p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:16px 28px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;">
      Vertho Mentor IA · CONARH 52 · Confidencial
    </td></tr>
  </table>
</body></html>`;
}
