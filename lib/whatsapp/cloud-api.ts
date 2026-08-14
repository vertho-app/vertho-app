/**
 * Envio de TEMPLATE pela WhatsApp Cloud API (oficial).
 *
 * ⚠️ POR QUE ISTO NÃO É UM PROVIDER DO REGISTRY DE `lib/whatsapp`
 * ──────────────────────────────────────────────────────────────
 * Seria a extensão óbvia — o `types.ts` até prevê "futuramente Cloud API
 * oficial". Mas registrar aqui como provider tornaria a Cloud API o caminho de
 * TODA mensagem, e em 14/08/2026 apenas o template de autenticação está
 * aprovado: os 10 da cadência seguem PENDING. A cadência quebraria inteira.
 *
 * Então este módulo é um caminho ESPECÍFICO, usado só por quem tem template
 * aprovado. Quando os da cadência aprovarem, o passo natural é virar provider e
 * este comentário deixa de valer — mas trocar antes disso é trocar um canal que
 * funciona por um que ainda não pode enviar nada.
 *
 * TEMPLATE DE AUTENTICAÇÃO TEM UMA PEGADINHA: o código vai em DOIS lugares — no
 * corpo e no parâmetro do botão de copiar. Mandar só no corpo produz um botão
 * que copia vazio, e isso não dá erro: a mensagem chega e o botão não funciona.
 */
import { normalizePhone } from '@/lib/phone';
import { registrarEntrega } from '@/lib/notifications/delivery-log';

const BASE = (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v22.0').replace(/\/+$/, '');
const token = () => process.env.META_WHATSAPPBUSINESS_API || '';
const phoneNumberId = () => process.env.PHONE_NUMBER_ID || '';

/** Tem credencial para falar com a Cloud API? Sem I/O. */
export function cloudApiConfigurada(): boolean {
  return Boolean(token() && phoneNumberId());
}

export interface EnvioTemplateResult {
  ok: boolean;
  /** wamid — liga o envio ao webhook de status (mig 212). */
  providerMessageId?: string | null;
  reason?: string;
}

export interface EnvioTemplateMeta {
  motivo?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  dedupeKey?: string | null;
}

/**
 * Envia um template de AUTENTICAÇÃO (código OTP).
 *
 * Separado de um `enviarTemplate` genérico de propósito: o formato de
 * autenticação é fixo e tem a regra do código duplicado (corpo + botão). Um
 * helper genérico deixaria essa regra a cargo de quem chama — e ela falha em
 * silêncio.
 *
 * NUNCA lança. O `wamid` devolvido é gravado em `notification_deliveries` para o
 * webhook casar o status de entrega depois.
 */
export async function enviarTemplateOtp(
  input: { phone: string; codigo: string; template?: string; idioma?: string },
  meta?: EnvioTemplateMeta,
): Promise<EnvioTemplateResult> {
  if (!cloudApiConfigurada()) return { ok: false, reason: 'Cloud API não configurada' };

  const fone = normalizePhone(input.phone);
  if (!fone) return { ok: false, reason: `telefone inválido: ${input.phone}` };

  const nome = input.template || 'otp_acesso';
  const corpo = {
    messaging_product: 'whatsapp',
    to: fone,
    type: 'template',
    template: {
      name: nome,
      language: { code: input.idioma || 'pt_BR' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: input.codigo }] },
        // O botão de copiar precisa do MESMO código. Sem este componente, a
        // mensagem chega e o botão copia vazio — sem erro nenhum na API.
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: input.codigo }],
        },
      ],
    },
  };

  let resultado: EnvioTemplateResult;
  try {
    const res = await fetch(`${BASE}/${phoneNumberId()}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      cache: 'no-store',
    });
    const json: any = await res.json().catch(() => null);

    if (!res.ok) {
      const e = json?.error;
      const detalhe = e ? `${e.message || ''}${e.code ? ` (${e.code})` : ''}` : '';
      resultado = { ok: false, reason: `Cloud API HTTP ${res.status}${detalhe ? ': ' + detalhe : ''}` };
    } else {
      resultado = { ok: true, providerMessageId: json?.messages?.[0]?.id ?? null };
    }
  } catch (e: any) {
    resultado = { ok: false, reason: `Cloud API rede: ${String(e?.message || e).slice(0, 150)}` };
  }

  // Telemetria com o `provider_message_id`: é essa coluna que o webhook usa para
  // aplicar `delivered`/`read` depois. Sem ela, o envio fica sem status para
  // sempre — aceite continuaria sendo tudo que se sabe.
  try {
    await registrarEntrega({
      canal: 'whatsapp',
      status: resultado.ok ? 'sucesso' : 'falha',
      kind: meta?.motivo ?? 'otp',
      empresaId: meta?.empresaId ?? null,
      colaboradorId: meta?.colaboradorId ?? null,
      provider: 'cloud-api',
      error: resultado.ok ? null : (resultado.reason ?? null),
      dedupeKey: meta?.dedupeKey ?? null,
      providerMessageId: resultado.providerMessageId ?? null,
    });
  } catch (e) {
    console.error('[cloud-api] telemetria falhou (envio NÃO afetado):', e);
  }

  return resultado;
}
