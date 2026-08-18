import 'server-only';

import { Resend } from 'resend';
import { createSupabaseAdmin } from '@/lib/supabase';
import { EMAIL_FROM_DEFAULT } from '@/lib/domain';
import { sendWhatsapp } from '@/lib/whatsapp';
import { mapaEvolucaoUrl, primeiroNome } from '@/lib/conarh/conteudo';
import { mensagemT0 } from '@/lib/conarh/mensagens';
import { enviarPorTemplate } from '@/lib/notifications/pilula-template';
import { ENTREGA_T0, type EntregaT0Status } from '@/lib/status';

/**
 * CONARH 52 — NÚCLEO da entrega do T+0 (o recorte prometido no estande).
 *
 * Headless de propósito (CLAUDE.md: núcleo sem gate em `lib/`, casca com gate
 * fora). Três chamadores, UM caminho:
 *   1. `app/api/conarh/artefato` — worker disparado pela captura (QStash/interno);
 *   2. `lib/conarh/reenvio-t0` — varredura dos pendentes (cron + botão da equipe);
 *   3. testes.
 *
 * 🔴 POR QUE ISTO EXISTE (18/08/2026, dia 1 da feira). O worker marcava
 * `followup_step = 1` — "T+0 executado" — mesmo quando o WhatsApp e o e-mail
 * falhavam. Medido no mesmo dia: `recorte_demonstracao` estava PENDING na Meta
 * (logo `WHATSAPP_TEMPLATE_RECORTE` não setada → `enviarPorTemplate` devolve
 * `tentou:false`) e o legado cai na Z-API, desconectada desde 11/08. Não saía por
 * nenhum dos dois caminhos, e o registro dizia que sim.
 *
 * 🔑 A REGRA: **o estado do lead segue a ENTREGA, não a tentativa.** Se nada
 * chegou, `followup_step` NÃO avança (a régua T+1 pressupõe que o T+0 chegou) e o
 * lead fica na fila com o motivo carimbado. Fila aqui não é tabela nova: é o
 * conjunto dos leads em ENTREGA_T0_NA_FILA (pendente ou falhou) — ver mig 221.
 *
 * ⚠️ Isto é o oposto do que vale para AVISO INTERNO (`lib/conarh/regua.ts`), onde
 * o avanço foi desamarrado do envio de propósito: lá o fato é "o lead completou 3
 * dias", verdade tendo ou não alguém sido avisado. Aqui o fato É a entrega — se o
 * recorte não chegou, nada aconteceu para o visitante.
 */

/**
 * O vocabulário vive em `lib/status.ts` (`ENTREGA_T0`), com os outros sete
 * domínios de status da base — o par no banco é o CHECK
 * `diag_leads_t0_status_check` (mig 221). Aqui só o alias local, para as
 * assinaturas não ficarem falando de dois arquivos.
 */
export type StatusT0 = EntregaT0Status;

type ResultadoWhatsapp = 'sim' | 'sem-telefone' | 'erro';
type ResultadoEmail = 'sim' | 'sem-key' | 'sem-email' | 'erro';

export type EntregaT0 =
  | { tipo: 'nao_encontrado' }
  | { tipo: 'fora_da_campanha' }
  | { tipo: 'ja_entregue'; leadId: string; mapaUrl: string; canal: string | null }
  | {
      tipo: 'executado';
      leadId: string;
      mapaUrl: string;
      status: StatusT0;
      canal: string | null;
      whatsapp: ResultadoWhatsapp;
      whatsappErro: string | null;
      email: ResultadoEmail;
      emailErro: string | null;
    };

export interface OpcoesEntregaT0 {
  /**
   * Reenvia mesmo com t0_status ENVIADO. Só o disparo manual, um lead por
   * vez, usa isto — a varredura NUNCA força, senão um `enviado` antigo volta a
   * sair a cada rodada.
   */
  forcar?: boolean;
}

/**
 * Executa (ou re-executa) o T+0 de um lead e CARIMBA o que de fato aconteceu.
 *
 * Idempotente por padrão: t0_status ENVIADO devolve `ja_entregue` sem
 * mandar nada. Isso fecha o duplo disparo (QStash entregando junto com o fallback
 * interno, botão apertado duas vezes, retry do QStash em cima de um 200 lento).
 */
export async function entregarT0(leadId: string, opts: OpcoesEntregaT0 = {}): Promise<EntregaT0> {
  const sb = createSupabaseAdmin();

  const { data: lead, error: leadErr } = await sb
    .from('diag_leads').select('*').eq('id', leadId).single();
  if (leadErr || !lead) return { tipo: 'nao_encontrado' };

  // Só serve a campanha da feira — o núcleo é acionável por fila e não deve
  // virar remetente genérico de WhatsApp para qualquer diag_lead.
  if (lead.scope_id !== 'conarh-2026') return { tipo: 'fora_da_campanha' };

  const mapaUrl = mapaEvolucaoUrl(lead.id);

  if (lead.t0_status === ENTREGA_T0.ENVIADO && !opts.forcar) {
    return { tipo: 'ja_entregue', leadId, mapaUrl, canal: lead.t0_canal ?? null };
  }

  // ── (a) WhatsApp T+0 ─────────────────────────────────────────────
  // Best-effort: falha NÃO derruba o worker (o e-mail ainda sai). O que mudou em
  // 18/08 é que ela também não é mais SILENCIOSA.
  let whatsapp: ResultadoWhatsapp = 'sem-telefone';
  let whatsappErro: string | null = null;
  if (lead.telefone) {
    try {
      // 1) Template aprovado pela Cloud API — o caminho que funciona.
      //
      // ⚠️ O lead é contato FRIO — nunca escreveu para o nosso número. Fora da
      // janela de 24h só sai TEMPLATE; texto livre volta 131047. Por isso o
      // detalhe variável (porta, competência crítica, reunião marcada) não vem
      // na mensagem: template não tem bloco condicional, e todo `{{n}}` precisa
      // de valor sempre. Esse detalhe vive na página do Mapa.
      //
      // Enquanto `WHATSAPP_TEMPLATE_RECORTE` não estiver setada (o template está
      // PENDING na Meta), `tentou` volta false e o legado assume.
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
        whatsapp = viaTemplate.ok ? 'sim' : 'erro';
        if (!viaTemplate.ok) {
          whatsappErro = String(viaTemplate.reason || '').slice(0, 300);
          console.error('[conarh/t0] template falhou:', whatsappErro);
        }
      } else {
        // 🔴 O legado (`sendWhatsapp`, texto livre) depende da Z-API, DESCONECTADA
        // desde 11/08: medido em 17/08, 388 falhas com "zapi: saúde: desconectada".
        // Mantido porque é o único caminho se a Z-API voltar antes da Meta aprovar.
        const r = await sendWhatsapp({ kind: 'text', phone: lead.telefone, text: mensagemT0(lead) });
        whatsapp = r.ok ? 'sim' : 'erro';
        if (!r.ok) {
          whatsappErro = String(r.reason || 'sem template e legado indisponível').slice(0, 300);
          console.error('[conarh/t0] WhatsApp falhou:', whatsappErro);
        }
      }
    } catch (err: any) {
      whatsapp = 'erro';
      whatsappErro = String(err?.message || err).slice(0, 300);
      console.error('[conarh/t0] WhatsApp exception:', whatsappErro);
    }
  }

  // ── (b) E-mail com o mesmo link ──────────────────────────────────
  let email: ResultadoEmail = 'sem-email';
  let emailErro: string | null = null;
  if (!lead.email) {
    email = 'sem-email';
  } else if (!process.env.RESEND_API_KEY) {
    email = 'sem-key';
    emailErro = 'RESEND_API_KEY ausente';
    console.error('[conarh/t0] RESEND_API_KEY ausente em runtime');
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
        email = 'erro';
        emailErro = JSON.stringify((sendResult as any).error).slice(0, 300);
        console.error('[conarh/t0] Resend retornou erro:', emailErro);
      } else {
        email = 'sim';
      }
    } catch (err: any) {
      email = 'erro';
      emailErro = String(err?.message || err).slice(0, 300);
      console.error('[conarh/t0] Resend exception:', emailErro);
    }
  }

  // ── Carimbo: o que CHEGOU, não o que foi tentado ─────────────────
  const canais = [whatsapp === 'sim' && 'whatsapp', email === 'sim' && 'email'].filter(Boolean) as string[];
  const entregou = canais.length > 0;
  const status: StatusT0 = entregou ? ENTREGA_T0.ENVIADO : ENTREGA_T0.FALHOU;

  const rastro: Record<string, unknown> = {
    t0_status: status,
    t0_canal: entregou ? canais.join('+') : null,
    t0_erro: entregou ? null : (whatsappErro || emailErro || motivoSemCanal(whatsapp, email)),
    // Aproximado por leitura-e-escrita: dois disparos simultâneos do mesmo lead
    // podem contar uma tentativa só. É contador de diagnóstico, não catraca — a
    // decisão de reenviar é do `t0_status`, que ambos escreveriam igual.
    t0_tentativas: (Number(lead.t0_tentativas) || 0) + 1,
    t0_tentado_em: new Date().toISOString(),
  };
  if (entregou) rastro.t0_enviado_em = new Date().toISOString();

  await sb.from('diag_leads').update(rastro).eq('id', leadId);

  // ── Marca T+0 executado — SÓ SE ALGO CHEGOU ──────────────────────
  //
  // 🔑 Este `if` é a mudança inteira. Sem ele, o lead que não recebeu nada entrava
  // na régua T+1 como se tivesse recebido, e a fila de quem ficou devendo não
  // existia. `.lt('followup_step', 1)`: se a régua já avançou este lead (reenvio
  // atrasado), o step NUNCA regride.
  if (entregou) {
    await sb.from('diag_leads')
      .update({ followup_step: 1 })
      .eq('id', leadId)
      .lt('followup_step', 1);
  }

  return { tipo: 'executado', leadId, mapaUrl, status, canal: entregou ? canais.join('+') : null, whatsapp, whatsappErro, email, emailErro };
}

/** Motivo quando nenhum canal sequer foi tentado (sem telefone e sem e-mail). */
function motivoSemCanal(whatsapp: ResultadoWhatsapp, email: ResultadoEmail): string {
  if (whatsapp === 'sem-telefone' && email === 'sem-email') return 'lead sem telefone e sem e-mail';
  return 'nenhum canal entregou';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailHtml({ nome, mapaUrl }: { nome: string | null; mapaUrl: string }) {
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
