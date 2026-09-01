import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DEMO_PRESENTATION_TENANT_SLUG,
  isDemoPresentationTenant,
  type DemoPresentationTenantSlug,
} from '@/lib/demo/presentation';

const TICKET_VERSION = 1 as const;
export const DEMO_PRESENTATION_TICKET_TTL_SECONDS = 4 * 60 * 60;
export const DEMO_PROSPECT_PRESENTATION_MAX_TTL_SECONDS = 3 * 24 * 60 * 60;
const MAX_TICKET_LENGTH = 2_048;
const SIGNING_CONTEXT = 'vertho:demo-presentation:v1';

export interface DemoPresentationTicketPayload {
  v: typeof TICKET_VERSION;
  /** Ambiente que o passe abre. Quem autentica confere contra o hostname. */
  tenant: DemoPresentationTenantSlug;
  iat: number;
  exp: number;
  nonce: string;
  prospectSessionId?: string;
}

export type DemoPresentationTicketOptions = {
  prospectSessionId: string;
  expiresAtSeconds: number;
};

function signingKey(): Buffer {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente para assinar a sala de apresentação.');
  // Deriva uma chave com contexto próprio: o segredo-base nunca vai para o
  // ticket e a assinatura não reutiliza diretamente o material do JWT.
  return createHmac('sha256', serviceKey).update(SIGNING_CONTEXT).digest();
}

function signature(encodedPayload: string): Buffer {
  return createHmac('sha256', signingKey()).update(encodedPayload).digest();
}

export function issueDemoPresentationTicket(
  nowSeconds: number = Math.floor(Date.now() / 1000),
  options?: DemoPresentationTicketOptions,
  tenantSlug: DemoPresentationTenantSlug = DEMO_PRESENTATION_TENANT_SLUG,
): string {
  if (!isDemoPresentationTenant(tenantSlug)) {
    throw new Error(`Sala de apresentação inválida: ${tenantSlug}`);
  }
  const exp = options?.expiresAtSeconds ?? nowSeconds + DEMO_PRESENTATION_TICKET_TTL_SECONDS;
  if (options && (
    !/^[a-f0-9]{20}$/.test(options.prospectSessionId)
    || !Number.isInteger(exp)
    || exp <= nowSeconds
    || exp - nowSeconds > DEMO_PROSPECT_PRESENTATION_MAX_TTL_SECONDS
  )) {
    throw new Error('Validade do passe acompanhado da apresentação inválida.');
  }
  const payload: DemoPresentationTicketPayload = {
    v: TICKET_VERSION,
    tenant: tenantSlug,
    iat: nowSeconds,
    exp,
    nonce: randomBytes(16).toString('base64url'),
    ...(options ? { prospectSessionId: options.prospectSessionId } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded).toString('base64url')}`;
}

export function verifyDemoPresentationTicket(
  rawTicket: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): DemoPresentationTicketPayload | null {
  if (!rawTicket || rawTicket.length > MAX_TICKET_LENGTH) return null;
  const parts = rawTicket.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const actual = Buffer.from(parts[1], 'base64url');
    const expected = signature(parts[0]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<DemoPresentationTicketPayload>;
    if (
      payload.v !== TICKET_VERSION
      // Ambiente registrado, e nada além disso: o passe DIZ para qual sala vale,
      // e é a rota de autenticação que confere isso contra o hostname. Aceitar
      // aqui um slug qualquer deixaria o passe apontar para um tenant que não é
      // sala de apresentação.
      || !isDemoPresentationTenant(payload.tenant)
      || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.exp)
      || typeof payload.nonce !== 'string'
      || !/^[A-Za-z0-9_-]{16,64}$/.test(payload.nonce)
    ) return null;

    // Pequena tolerância de relógio, mas nunca aceita passe expirado nem passe
    // assinado com uma janela maior que a oficial.
    if (payload.iat! > nowSeconds + 60) return null;
    if (payload.exp! <= nowSeconds) return null;
    if (payload.prospectSessionId !== undefined) {
      if (!/^[a-f0-9]{20}$/.test(payload.prospectSessionId)) return null;
      if (payload.exp! <= payload.iat!) return null;
      if (payload.exp! - payload.iat! > DEMO_PROSPECT_PRESENTATION_MAX_TTL_SECONDS) return null;
    } else if (payload.exp! - payload.iat! !== DEMO_PRESENTATION_TICKET_TTL_SECONDS) {
      return null;
    }

    return payload as DemoPresentationTicketPayload;
  } catch {
    return null;
  }
}
