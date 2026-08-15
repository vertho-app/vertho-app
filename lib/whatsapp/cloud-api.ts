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

/**
 * Tetos de espera. Sem eles, uma conexão pendurada da Meta segura a Server
 * Action até o `maxDuration` da função — quem clicou fica olhando um botão
 * "Enviando…" que não termina, e no webhook o custo é pior: a Meta reentrega o
 * evento porque não recebeu o 200 a tempo.
 *
 * ⚠️ TIMEOUT NO ENVIO NÃO É "NÃO ENVIOU". A requisição pode ter chegado e sido
 * aceita depois de o nosso lado desistir. Registramos como falha porque é tudo
 * que se sabe daqui — e é por isso que a idempotência do chamador (`dedupeKey`)
 * importa: sem ela, a reação natural de reenviar produziria duas mensagens para
 * a pessoa. O download é o mais generoso porque carrega binário, não JSON.
 */
const TIMEOUT_ENVIO_MS = 15_000;
const TIMEOUT_META_MIDIA_MS = 10_000;
const TIMEOUT_DOWNLOAD_MS = 30_000;

/** Motivo legível quando o teto estourou — "fetch failed" não diz nada a quem lê o log. */
function motivoDeRede(e: any, tetoMs: number): string {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return `sem resposta em ${Math.round(tetoMs / 1000)}s (estado do envio DESCONHECIDO)`;
  }
  return String(e?.message || e).slice(0, 150);
}

/** Tem credencial para falar com a Cloud API? Sem I/O. */
export function cloudApiConfigurada(): boolean {
  return Boolean(token() && phoneNumberId());
}

export interface EnvioTemplateResult {
  ok: boolean;
  /** wamid — liga o envio ao webhook de status (mig 212). */
  providerMessageId?: string | null;
  reason?: string;
  /** Status HTTP da Graph API, quando houve resposta. */
  status?: number;
}

export interface EnvioTemplateMeta {
  motivo?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  dedupeKey?: string | null;
}

/**
 * Envia TEXTO LIVRE — só válido dentro da janela de 24h.
 *
 * ⚠️ NÃO CHAME SEM VALIDAR A JANELA NO SERVIDOR. Fora dela a Meta recusa com
 * **131047** ("Message failed to send because more than 24 hours have passed
 * since the customer last replied"), e do ponto de vista de quem clicou a
 * mensagem simplesmente não chegou. O estado renderizado na tela envelhece: o
 * atendente abre com a janela aberta, escreve cinco minutos e envia com ela
 * fechada. A checagem tem que acontecer no instante do envio, no servidor.
 *
 * A telemetria é gravada com `providerMessageId` — é ela que o webhook usa para
 * aplicar entregue/lido depois (mig 212).
 */
export async function enviarTextoCloud(
  input: { phone: string; texto: string },
  meta?: EnvioTemplateMeta,
): Promise<EnvioTemplateResult> {
  if (!cloudApiConfigurada()) return { ok: false, reason: 'Cloud API não configurada' };

  const fone = normalizePhone(input.phone);
  if (!fone) return { ok: false, reason: `telefone inválido: ${input.phone}` };

  const texto = input.texto.trim();
  if (!texto) return { ok: false, reason: 'mensagem vazia' };
  // Limite da Meta para corpo de texto. Cortar aqui, com erro, é melhor que
  // deixar a API recusar um texto que a pessoa já considerou enviado.
  if (texto.length > 4096) return { ok: false, reason: 'mensagem acima de 4096 caracteres' };

  const corpo = {
    messaging_product: 'whatsapp',
    to: fone,
    type: 'text',
    // `preview_url: false`: link em resposta de atendimento não deve virar card
    // — o preview é buscado pela Meta e muda o que a pessoa vê sem o atendente
    // ter escolhido isso.
    text: { body: texto, preview_url: false },
  };

  let resultado: EnvioTemplateResult;
  try {
    const res = await fetch(`${BASE}/${phoneNumberId()}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
    });
    const json: any = await res.json().catch(() => null);

    if (!res.ok) {
      const e = json?.error;
      const detalhe = e ? `${e.message || ''}${e.code ? ` (${e.code})` : ''}` : '';
      resultado = { ok: false, status: res.status, reason: `Cloud API HTTP ${res.status}${detalhe ? ': ' + detalhe : ''}` };
    } else {
      resultado = { ok: true, providerMessageId: json?.messages?.[0]?.id ?? null };
    }
  } catch (e: any) {
    resultado = { ok: false, reason: `Cloud API rede: ${motivoDeRede(e, TIMEOUT_ENVIO_MS)}` };
  }

  try {
    await registrarEntrega({
      canal: 'whatsapp',
      status: resultado.ok ? 'sucesso' : 'falha',
      kind: meta?.motivo ?? 'atendimento',
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

/** URL temporária de uma mídia recebida. Expira em minutos — não repassar ao browser. */
export async function urlDaMidia(mediaId: string): Promise<{ ok: boolean; url?: string; mime?: string; reason?: string }> {
  if (!cloudApiConfigurada()) return { ok: false, reason: 'Cloud API não configurada' };
  try {
    const res = await fetch(`${BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_META_MIDIA_MS),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.url) {
      return { ok: false, reason: `mídia HTTP ${res.status}${json?.error?.message ? ': ' + json.error.message : ''}` };
    }
    return { ok: true, url: json.url, mime: json.mime_type };
  } catch (e: any) {
    return { ok: false, reason: `mídia rede: ${motivoDeRede(e, TIMEOUT_META_MIDIA_MS)}` };
  }
}

/**
 * Baixa o binário da mídia.
 *
 * ⚠️ A URL devolvida por `urlDaMidia` exige o **token no header** para ser
 * baixada — ela não é pública. Repassá-la ao browser não funcionaria e, pior,
 * vazaria o token se alguém tentasse resolver isso mandando o header junto. Por
 * isso o servidor busca e transmite: o token nunca sai daqui.
 */
export async function baixarMidia(url: string): Promise<{ ok: boolean; body?: ArrayBuffer; mime?: string; reason?: string }> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_DOWNLOAD_MS),
    });
    if (!res.ok) return { ok: false, reason: `download HTTP ${res.status}` };
    return { ok: true, body: await res.arrayBuffer(), mime: res.headers.get('content-type') || undefined };
  } catch (e: any) {
    return { ok: false, reason: `download rede: ${motivoDeRede(e, TIMEOUT_DOWNLOAD_MS)}` };
  }
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
      signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
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
    resultado = { ok: false, reason: `Cloud API rede: ${motivoDeRede(e, TIMEOUT_ENVIO_MS)}` };
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
