// Serviço central de SMS — contingência de ACESSO quando o WhatsApp cai.
//
// Uso:  const r = await sendSms({ phone, text }, { motivo: 'otp', empresaId });
//       if (!r.ok) ... r.reason
//
// POR QUE ESTE MÓDULO EXISTE, e por que ele é deliberadamente pequeno
// ────────────────────────────────────────────────────────────────────
// Medido em 13/08/2026: a instância Z-API caiu no meio de um disparo (6 de 36
// entregues) e, com ela, o ÚNICO caminho do OTP de login. As 271 pessoas com
// `login_por_whatsapp = true` ficaram sem como entrar — o fluxo é por telefone,
// então e-mail não substitui.
//
// O escopo é acesso, não jornada, e isso é uma decisão medida, não uma etapa:
// quem depende de SMS para receber CONTEÚDO são 9 pessoas em ~400 (as sem
// e-mail cadastrado); quem depende dele para ENTRAR são 271. Espalhar SMS pela
// cadência trocaria um canal grátis por um pago para resolver o caso de 9
// pessoas — enquanto o buraco real da cadência é a evidência de quinta ser
// monocanal, que se fecha com e-mail e custa zero.
//
// TETO DIÁRIO: a diferença entre este canal e o WhatsApp é que cada mensagem
// aqui é paga. Com o WhatsApp fora, TODA solicitação de OTP vira SMS — e uma
// tela de login em laço (ou alguém insistindo no botão) vira conta de telefone.
// O teto é lido do banco, não de um contador em memória: a lambda é efêmera e
// um contador de processo zeraria a cada invocação, que é o mesmo que não ter
// teto nenhum.
import { normalizePhone } from '@/lib/phone';
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarEntrega } from '@/lib/notifications/delivery-log';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { twilioProvider } from './providers/twilio';
import type { SmsMessage, SmsProvider, SmsProviderId, SmsSendMeta, SmsSendResult } from './types';

export type { SmsMessage, SmsProviderId, SmsSendMeta, SmsSendResult } from './types';

const REGISTRY: Record<SmsProviderId, SmsProvider> = {
  twilio: twilioProvider,
};

/** Provedores na ordem de tentativa, só os configurados. */
function orderedProviders(): SmsProvider[] {
  return (Object.keys(REGISTRY) as SmsProviderId[]).map((id) => REGISTRY[id]).filter((p) => p.configured());
}

/** Há ao menos um provedor de SMS com credencial? Sem I/O — serve de gate barato. */
export function smsDisponivel(): boolean {
  return orderedProviders().length > 0;
}

/** Teto de mensagens nas últimas 24h. 0 ou negativo desliga o canal. */
export function tetoDiario(): number {
  const bruto = Number(process.env.SMS_MAX_DIA);
  return Number.isFinite(bruto) ? Math.floor(bruto) : 200;
}

/**
 * Quantos SMS foram ACEITOS nas últimas 24h.
 *
 * Conta só `sucesso`: uma falha não custa (o provedor não cobra o que recusou),
 * e contá-la faria uma pane do fornecedor fechar o canal sozinha — o oposto do
 * que um teto de custo deve fazer.
 *
 * `null` = não sei (erro de leitura). Quem chama trata `null` como "não bloqueia":
 * um problema no Supabase não pode derrubar o login de todo mundo, e o teto é
 * proteção de custo, não de segurança.
 */
async function enviadosUltimas24h(): Promise<number | null> {
  try {
    const sb = createSupabaseAdmin();
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await sb
      .from('notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'sms')
      .eq('status', 'sucesso')
      .gte('sent_at', desde);
    // supabase-js RETORNA { error } — sem este check a falha viraria `count: null`
    // silencioso, e "não sei" seria lido como zero: teto que nunca fecha.
    if (error) {
      console.error('[sms] leitura do teto falhou:', error.message);
      return null;
    }
    return typeof count === 'number' ? count : null;
  } catch (e: any) {
    console.error('[sms] leitura do teto falhou:', e?.message || e);
    return null;
  }
}

/** Registra a entrega e devolve o resultado INTACTO (mesmo contrato de `lib/whatsapp`). */
async function comLog(r: SmsSendResult, meta: SmsSendMeta | undefined): Promise<SmsSendResult> {
  try {
    await registrarEntrega({
      canal: 'sms',
      status: r.ok ? 'sucesso' : 'falha',
      kind: meta?.motivo ?? null,
      empresaId: meta?.empresaId ?? null,
      colaboradorId: meta?.colaboradorId ?? null,
      provider: r.provider ?? null,
      error: r.ok ? null : (r.reason ?? null),
      dedupeKey: meta?.dedupeKey ?? null,
    });
  } catch (e) {
    console.error('[sms] telemetria de entrega falhou (envio NÃO afetado):', e);
  }
  return r;
}

/**
 * Envia um SMS pelo primeiro provedor disponível. Nunca lança — sempre devolve
 * `SmsSendResult` com a trilha.
 *
 * ⚠️ `ok: true` significa que o provedor ACEITOU a mensagem (na Twilio, status
 * `queued`), não que o aparelho recebeu. A entrega real só é conhecida por
 * callback, que este módulo ainda não consome.
 */
export async function sendSms(input: SmsMessage, meta?: SmsSendMeta): Promise<SmsSendResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return comLog({ ok: false, attempts: [], reason: `telefone inválido: ${input.phone}` }, meta);

  const providers = orderedProviders();
  if (!providers.length) {
    // NÃO passa por comLog: sem provedor não houve tentativa, e gravar uma
    // "falha" por canal inexistente poluiria o denominador de quem quiser medir
    // a confiabilidade do SMS depois que ele estiver de pé.
    return { ok: false, attempts: [], reason: 'nenhum provedor de SMS configurado' };
  }

  const teto = tetoDiario();
  if (teto <= 0) {
    return { ok: false, attempts: [], reason: 'canal de SMS desligado (SMS_MAX_DIA <= 0)', bloqueadoPorTeto: true };
  }
  const jaEnviados = await enviadosUltimas24h();
  if (jaEnviados !== null && jaEnviados >= teto) {
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.SMS_TETO_DIARIO,
      chave: 'sms',
      empresaId: meta?.empresaId ?? null,
      severidade: 'critico',
      detalhe: { enviados24h: jaEnviados, teto, motivo: meta?.motivo ?? null },
    });
    return {
      ok: false,
      attempts: [],
      reason: `teto diário de SMS atingido (${jaEnviados}/${teto})`,
      bloqueadoPorTeto: true,
    };
  }

  const msg: SmsMessage = { ...input, phone };
  const attempts: SmsSendResult['attempts'] = [];
  for (const p of providers) {
    const r = await p.send(msg);
    attempts.push({ provider: p.id, ok: r.ok, status: r.status, reason: r.reason });
    if (r.ok) return comLog({ ok: true, provider: p.id, providerMessageId: r.providerMessageId ?? null, attempts }, meta);
  }

  return comLog({ ok: false, attempts, reason: attempts.map((a) => `${a.provider}: ${a.reason}`).join(' | ') }, meta);
}
