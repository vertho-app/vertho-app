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
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import type { TipoMidia } from '@/lib/inbox/anexos';

/**
 * A telemetria falhou — o envio NÃO é afetado, a medição é.
 *
 * Sem a linha em `notification_deliveries`, o `wamid` deste envio não existe em
 * lugar nenhum: quando o webhook trouxer `delivered`/`read`, o update não vai
 * casar com nada e o status se perde para sempre. Era um `console.error` solto,
 * que é o mesmo que não registrar (15/08/2026).
 */
async function telemetriaFalhou(e: unknown, meta?: EnvioTemplateMeta): Promise<void> {
  console.error('[cloud-api] telemetria falhou (envio NÃO afetado):', e);
  await registrarDegradacao({
    fluxo: 'envio',
    tipo: DEGRADACAO.WHATSAPP_STATUS_PERDIDO,
    chave: 'telemetria-nao-gravada',
    empresaId: meta?.empresaId ?? null,
    colaboradorId: meta?.colaboradorId ?? null,
    severidade: 'aviso',
    detalhe: { motivo: String((e as any)?.message || e).slice(0, 200) },
  });
}

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
/** Upload é o mais lento: sobe binário de até 4 MB por uma rede que não é nossa. */
const TIMEOUT_UPLOAD_MS = 45_000;

/** Motivo legível quando o teto estourou — "fetch failed" não diz nada a quem lê o log. */
function motivoDeRede(e: any, tetoMs: number): string {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return `sem resposta em ${Math.round(tetoMs / 1000)}s (estado do envio DESCONHECIDO)`;
  }
  return String(e?.message || e).slice(0, 150);
}

/**
 * Repete uma leitura que falhou por rede, com espera crescente.
 *
 * 🔴 SÓ PARA GET, e a restrição é o ponto inteiro desta função. Repetir
 * `POST /messages` seria o caminho mais curto para a pessoa receber a MESMA
 * mensagem duas vezes: a Graph API não aceita chave de idempotência nesse
 * endpoint, e um timeout **não prova** que a Meta não aceitou — ela pode ter
 * entregue depois de o nosso lado desistir. O `dedupeKey` do inbox tampouco
 * protegeria: ele é consultado ANTES do envio, não dentro do `fetch`.
 *
 * Ler mídia é idempotente: buscar duas vezes devolve o mesmo áudio. E aqui a
 * falha transitória tem custo visível — vira "mídia indisponível" na tela de
 * quem atende, com a resposta da pessoa do outro lado inaudível.
 *
 * A espera é curta de propósito (300ms, 900ms): isto roda dentro de uma request
 * que alguém está esperando, não num job de fundo.
 */
async function comRetry<T extends { ok: boolean; reason?: string }>(
  operacao: () => Promise<T>,
  tentativas = 3,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let ultimo!: T;
  for (let i = 0; i < tentativas; i++) {
    ultimo = await operacao();
    if (ultimo.ok) return ultimo;
    // Só rede/5xx merecem outra chance. 404 (mídia expirada) e 401 (token) são
    // definitivos: repetir só atrasa o erro que já se sabe.
    const transitorio = /rede:|HTTP 5\d\d|HTTP 429/.test(ultimo.reason || '');
    if (!transitorio || i === tentativas - 1) return ultimo;
    await esperar(300 * 3 ** i);
  }
  return ultimo;
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
    await telemetriaFalhou(e, meta);
  }

  return resultado;
}

/** URL temporária de uma mídia recebida. Expira em minutos — não repassar ao browser. */
export async function urlDaMidia(mediaId: string): Promise<{ ok: boolean; url?: string; mime?: string; reason?: string }> {
  return comRetry(() => urlDaMidiaUmaVez(mediaId));
}

async function urlDaMidiaUmaVez(mediaId: string): Promise<{ ok: boolean; url?: string; mime?: string; reason?: string }> {
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
  return comRetry(() => baixarMidiaUmaVez(url));
}

async function baixarMidiaUmaVez(url: string): Promise<{ ok: boolean; body?: ArrayBuffer; mime?: string; reason?: string }> {
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

// ── ANEXOS ──────────────────────────────────────────────────────────────────
//
// As REGRAS (tipos aceitos, teto, classificação) vivem em `lib/inbox/anexos.ts`
// porque a tela precisa delas para montar o `accept` do input — e este módulo
// puxa Supabase, que não pode ir para o bundle do navegador. Aqui fica só o I/O.

/**
 * Sobe o binário para a Meta e devolve o `media id`.
 *
 * A alternativa seria mandar um `link` e deixar a Meta buscar. Recusada: o nosso
 * Storage é privado, então seria uma URL assinada — o arquivo de uma conversa
 * ficaria acessível a quem tivesse o link enquanto o TTL durasse. Aqui o binário
 * sai por nós e nada fica exposto.
 *
 * O id devolvido é o MESMO tipo de id da mídia recebida, o que faz o proxy
 * autenticado (`/api/inbox/midia/[mediaId]`) servir os dois lados sem uma linha
 * a mais.
 */
export async function subirMidia(
  arquivo: Blob,
  mime: string,
  nome: string,
): Promise<{ ok: boolean; mediaId?: string; reason?: string }> {
  if (!cloudApiConfigurada()) return { ok: false, reason: 'Cloud API não configurada' };

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', arquivo, nome || 'arquivo');

  try {
    const res = await fetch(`${BASE}/${phoneNumberId()}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` }, // sem Content-Type: o FormData define o boundary
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_UPLOAD_MS),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.id) {
      const e = json?.error;
      return { ok: false, reason: `upload HTTP ${res.status}${e?.message ? ': ' + e.message : ''}` };
    }
    return { ok: true, mediaId: String(json.id) };
  } catch (e: any) {
    return { ok: false, reason: `upload rede: ${motivoDeRede(e, TIMEOUT_UPLOAD_MS)}` };
  }
}

/**
 * Envia uma mídia já subida. Vale a MESMA janela de 24h do texto livre.
 *
 * ⚠️ ÁUDIO NÃO ACEITA LEGENDA na Cloud API, e `document` é o único que leva
 * `filename` — sem ele a pessoa recebe um anexo com nome gerado, e "documento
 * sem nome" num canal de trabalho parece arquivo suspeito.
 */
export async function enviarMidiaCloud(
  input: { phone: string; tipo: TipoMidia; mediaId: string; legenda?: string | null; nomeArquivo?: string | null },
  meta?: EnvioTemplateMeta,
): Promise<EnvioTemplateResult> {
  if (!cloudApiConfigurada()) return { ok: false, reason: 'Cloud API não configurada' };

  const fone = normalizePhone(input.phone);
  if (!fone) return { ok: false, reason: `telefone inválido: ${input.phone}` };

  const midia: Record<string, unknown> = { id: input.mediaId };
  const legenda = (input.legenda || '').trim();
  if (legenda && input.tipo !== 'audio') midia.caption = legenda.slice(0, 1024);
  if (input.tipo === 'document' && input.nomeArquivo) midia.filename = input.nomeArquivo;

  const corpo = {
    messaging_product: 'whatsapp',
    to: fone,
    type: input.tipo,
    [input.tipo]: midia,
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
      kind: meta?.motivo ?? 'atendimento-anexo',
      empresaId: meta?.empresaId ?? null,
      colaboradorId: meta?.colaboradorId ?? null,
      provider: 'cloud-api',
      error: resultado.ok ? null : (resultado.reason ?? null),
      dedupeKey: meta?.dedupeKey ?? null,
      providerMessageId: resultado.providerMessageId ?? null,
    });
  } catch (e) {
    await telemetriaFalhou(e, meta);
  }

  return resultado;
}

/**
 * Estado da conta na Meta — o que um check de saúde precisa saber.
 *
 * `null` em `inscrito`/`numeroOk` significa **não deu para saber**, que é
 * diferente de "está ruim" e diferente de "está bom". Um health-check que
 * traduz ignorância em "ok" é a forma mais cara de mentir.
 */
export interface SaudeCloudApi {
  configurada: boolean;
  /** O nosso app está inscrito no webhook da WABA? `null` = não deu para saber. */
  inscrito: boolean | null;
  /** Nomes dos apps inscritos (para o alerta dizer o que encontrou). */
  appsInscritos: string[];
  /** O número responde com a credencial atual? `null` = não deu para saber. */
  numeroOk: boolean | null;
  /** GREEN | YELLOW | RED | UNKNOWN — qualidade do número, medida pela Meta. */
  qualidade: string | null;
  nomeVerificado: string | null;
  /** Por que ficou sem saber. Preenchido só quando algo acima é `null`. */
  motivo: string | null;
}

/** WABA (conta) — separado do número; é nela que vive a inscrição do webhook. */
const wabaId = () => process.env.WABA_ID || '';

/**
 * Pergunta à Meta se o canal ainda está de pé. LEITURA PURA (dois GETs).
 *
 * 🔴 POR QUE ATIVO, E NÃO POR VOLUME
 * ──────────────────────────────────
 * A tentação é medir "chegou mensagem nas últimas 24h?". Não serve: o volume
 * legítimo de entrada é quase zero (uma mensagem no total até 15/08/2026), então
 * "nada chegou" é o estado NORMAL — o alarme nasceria mudo, e continuaria mudo
 * no dia em que a inscrição caísse. Perguntar diretamente dá resposta binária,
 * independente de tráfego.
 *
 * Não é hipótese: em 14/08/2026 o `subscribed_apps` da WABA estava VAZIO e as
 * respostas dos colaboradores sumiam sem deixar rastro — num número da Cloud API
 * não existe "abrir o WhatsApp e ver depois". A Meta também desativa a inscrição
 * sozinha quando o webhook falha de forma persistente, e nada no produto avisa.
 *
 * O `quality_rating` vem de brinde no mesmo custo e vale tanto quanto: é o sinal
 * que ANTECEDE a restrição do número. Este projeto já perdeu um número por
 * disparo em lote (11/08) — ali o aviso veio como canal morto, não como métrica.
 */
export async function inspecionarCloudApi(): Promise<SaudeCloudApi> {
  const vazio: SaudeCloudApi = {
    configurada: Boolean(token()),
    inscrito: null, appsInscritos: [], numeroOk: null, qualidade: null, nomeVerificado: null, motivo: null,
  };
  // ⚠️ O GATE É O TOKEN, não `cloudApiConfigurada()`. A diferença importa: aquela
  // função exige também o `PHONE_NUMBER_ID`, que é o que permite ENVIAR. O
  // webhook RECEBE sem ele (a rota só depende de `META_APP_SECRET`), então
  // amarrar a inspeção ao envio silenciaria a checagem da inscrição justamente
  // num ambiente meio configurado — cegueira disfarçada de "canal desligado".
  if (!vazio.configurada) return { ...vazio, motivo: 'sem credencial da Cloud API (META_WHATSAPPBUSINESS_API)' };

  const out: SaudeCloudApi = { ...vazio };

  // 1) A inscrição do webhook na WABA.
  if (!wabaId()) {
    out.motivo = 'WABA_ID ausente — não dá para verificar a inscrição do webhook';
  } else {
    try {
      const res = await fetch(`${BASE}/${wabaId()}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_META_MIDIA_MS),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok) {
        out.motivo = `subscribed_apps HTTP ${res.status}${json?.error?.message ? ': ' + json.error.message : ''}`;
      } else {
        const apps: any[] = Array.isArray(json?.data) ? json.data : [];
        out.appsInscritos = apps
          .map((a) => a?.whatsapp_business_api_data?.name)
          .filter(Boolean)
          .map(String);
        // Lista vazia é a resposta de "ninguém está inscrito" — é assim que a
        // desativação aparece, sem erro nenhum.
        out.inscrito = apps.length > 0;
      }
    } catch (e: any) {
      out.motivo = `subscribed_apps rede: ${motivoDeRede(e, TIMEOUT_META_MIDIA_MS)}`;
    }
  }

  // 2) O número e a qualidade dele.
  if (!phoneNumberId()) {
    out.motivo = out.motivo ?? 'PHONE_NUMBER_ID ausente — não dá para verificar o número';
    return out;
  }
  try {
    const res = await fetch(`${BASE}/${phoneNumberId()}?fields=verified_name,quality_rating,platform_type`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_META_MIDIA_MS),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      out.numeroOk = false;
      out.motivo = out.motivo ?? `número HTTP ${res.status}${json?.error?.message ? ': ' + json.error.message : ''}`;
    } else {
      out.numeroOk = true;
      out.qualidade = json?.quality_rating ? String(json.quality_rating) : null;
      out.nomeVerificado = json?.verified_name ? String(json.verified_name) : null;
    }
  } catch (e: any) {
    out.motivo = out.motivo ?? `número rede: ${motivoDeRede(e, TIMEOUT_META_MIDIA_MS)}`;
  }

  return out;
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
    await telemetriaFalhou(e, meta);
  }

  return resultado;
}
