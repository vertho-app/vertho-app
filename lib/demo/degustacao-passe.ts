import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ACME_PROSPECT_SESSION_PATTERN, getDemoProspectTenant } from '@/lib/demo/acme-prospect-config';

/**
 * Passe da ETAPA 01 — o link individual do convidado da degustação.
 *
 * POR QUE ELE EXISTE. O link era um magic link do Supabase, consumido na
 * primeira abertura. Quem fechasse a aba e voltasse no dia seguinte não tinha
 * volta: o link não abria de novo e o e-mail de acesso é técnico e aleatório
 * (`convidado.<ambiente>.<id>@vertho.ai`), então a pessoa não conseguia nem
 * pedir outro pela tela de login. O passe é reabrível enquanto o passaporte
 * vale; o magic link passa a ser gerado no SERVIDOR, a cada abertura.
 *
 * 🔴 CONTEXTO DE ASSINATURA PRÓPRIO, e isto não é detalhe. O passe da SALA DE
 * APRESENTAÇÃO viaja nos links das etapas 02–04, que o prospect recebe. Se os
 * dois compartilhassem a chave derivada, quem tem um passe de apresentação
 * poderia forjar a entrada COMO O CONVIDADO — e o convidado é a conta com o
 * DISC e as respostas da pessoa. Contextos diferentes tornam isso impossível
 * por construção, em vez de por um campo que alguém pode esquecer de conferir.
 *
 * O passe carrega apenas ambiente, sessão e prazo. E-mail e identidade saem do
 * banco, na hora de abrir — nunca da query string.
 */
const PASSE_VERSAO = 1 as const;
const SIGNING_CONTEXT = 'vertho:demo-degustacao:v1';
const MAX_PASSE_LENGTH = 2_048;

export interface DegustacaoPassePayload {
  v: typeof PASSE_VERSAO;
  /** Ambiente que o passe abre; conferido contra o hostname de quem recebe. */
  tenant: string;
  /** Sessão do passaporte. O e-mail do convidado é resolvido por ela, no banco. */
  sid: string;
  exp: number;
}

function signingKey(): Buffer {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente para assinar o passe da degustação.');
  return createHmac('sha256', serviceKey).update(SIGNING_CONTEXT).digest();
}

function assinar(payloadCodificado: string): Buffer {
  return createHmac('sha256', signingKey()).update(payloadCodificado).digest();
}

export function emitirPasseDegustacao(
  tenant: string,
  sessionId: string,
  expiresAtSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (!getDemoProspectTenant(tenant)) {
    throw new Error(`Ambiente de degustação inválido: ${tenant}`);
  }
  if (!ACME_PROSPECT_SESSION_PATTERN.test(sessionId)) {
    throw new Error('Identificador de sessão inválido para o passe.');
  }
  if (!Number.isInteger(expiresAtSeconds) || expiresAtSeconds <= nowSeconds) {
    throw new Error('Validade do passe da degustação inválida.');
  }
  const payload: DegustacaoPassePayload = {
    v: PASSE_VERSAO,
    tenant,
    sid: sessionId,
    exp: expiresAtSeconds,
  };
  const codificado = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${codificado}.${assinar(codificado).toString('base64url')}`;
}

/**
 * Devolve o payload de um passe legítimo e ainda no prazo, ou `null`.
 *
 * Nunca lança e nunca distingue os motivos: forma inválida, assinatura errada e
 * passe vencido saem iguais, para não virar oráculo de quem está testando.
 */
export function verificarPasseDegustacao(
  passe: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): DegustacaoPassePayload | null {
  if (!passe || passe.length > MAX_PASSE_LENGTH) return null;
  const [codificado, assinatura] = passe.split('.');
  if (!codificado || !assinatura) return null;

  let esperado: Buffer;
  let recebido: Buffer;
  try {
    esperado = assinar(codificado);
    recebido = Buffer.from(assinatura, 'base64url');
  } catch {
    return null;
  }
  // Comparação em tempo constante, e só depois de igualar o tamanho: o
  // `timingSafeEqual` lança quando os buffers têm comprimentos diferentes.
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;

  try {
    const payload = JSON.parse(Buffer.from(codificado, 'base64url').toString('utf8'));
    if (payload?.v !== PASSE_VERSAO) return null;
    if (!getDemoProspectTenant(payload.tenant)) return null;
    if (!ACME_PROSPECT_SESSION_PATTERN.test(payload.sid || '')) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= nowSeconds) return null;
    return payload as DegustacaoPassePayload;
  } catch {
    return null;
  }
}
