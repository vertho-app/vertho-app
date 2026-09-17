import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { tenantUrl } from '@/lib/domain';
import { ACME_PROSPECT_SESSION_PATTERN, getDemoProspectTenant } from '@/lib/demo/acme-prospect-config';
import { CODIGO_CURTO_PATTERN } from '@/lib/demo/presentation';

/**
 * Link curto do convite da degustação: `https://<ambiente>.vertho.ai/c/<código>`.
 *
 * POR QUE EXISTE. O link da página de boas-vindas levava o passe inteiro
 * (`/degustacao?passe=` com JSON em base64 e assinatura), perto de 160
 * caracteres numa mensagem de WhatsApp de três linhas. O código tem 24.
 *
 * COMO É FEITO. Sem tabela e sem migration, no mesmo modelo do link curto do
 * relatório de engajamento: o código é a sessão (10 bytes) seguida de 8 bytes de
 * HMAC sobre `ambiente|sessão`, em base64url. O prazo não viaja no código: quem
 * decide se ainda vale é a linha de `demo_prospect_sessions`, igual ao passe.
 *
 * 🔴 A ASSINATURA NÃO É ENFEITE. O id da sessão aparece em claro em outros
 * lugares (o ticket da sala de apresentação carrega `prospectSessionId` em
 * base64 legível). Sem os 64 bits de assinatura, quem tivesse um ticket montaria
 * o link da pessoa e entraria como ela. Contexto de assinatura PRÓPRIO, distinto
 * do passe e do ticket, pela mesma razão que eles já são distintos entre si.
 *
 * O ambiente entra na assinatura e sai do HOSTNAME de quem abre: um código de um
 * ambiente não vale no host de outro.
 */
const SIGNING_CONTEXT = 'vertho:demo-degustacao-curto:v1';
const BYTES_DA_SESSAO = 10;
const BYTES_DA_ASSINATURA = 8;

function chave(): Buffer {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente para assinar o link curto da degustação.');
  return createHmac('sha256', serviceKey).update(SIGNING_CONTEXT).digest();
}

function assinatura(slug: string, sessionId: string): Buffer {
  return createHmac('sha256', chave()).update(`${slug}|${sessionId}`).digest().subarray(0, BYTES_DA_ASSINATURA);
}

export function emitirCodigoCurto(slug: string, sessionId: string): string {
  if (!getDemoProspectTenant(slug)) throw new Error(`Ambiente de degustação inválido: ${slug}`);
  if (!ACME_PROSPECT_SESSION_PATTERN.test(sessionId)) throw new Error('Identificador de sessão inválido para o link curto.');
  return Buffer.concat([Buffer.from(sessionId, 'hex'), assinatura(slug, sessionId)]).toString('base64url');
}

/**
 * A sessão de um código legítimo PARA ESTE AMBIENTE, ou `null`. Nunca lança e
 * nunca distingue os motivos (forma, assinatura, ambiente): não vira oráculo.
 */
export function lerCodigoCurto(codigo: unknown, slug: string): string | null {
  if (typeof codigo !== 'string' || !CODIGO_CURTO_PATTERN.test(codigo)) return null;
  if (!getDemoProspectTenant(slug)) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(codigo, 'base64url');
  } catch {
    return null;
  }
  // Forma canônica: sem ela, dois textos diferentes decodificariam na mesma sessão.
  if (bytes.length !== BYTES_DA_SESSAO + BYTES_DA_ASSINATURA || bytes.toString('base64url') !== codigo) return null;
  const sessionId = bytes.subarray(0, BYTES_DA_SESSAO).toString('hex');
  let esperada: Buffer;
  try {
    esperada = assinatura(slug, sessionId);
  } catch {
    return null;
  }
  const recebida = bytes.subarray(BYTES_DA_SESSAO);
  return timingSafeEqual(esperada, recebida) ? sessionId : null;
}

export function linkCurtoDaDegustacao(slug: string, sessionId: string): string {
  return tenantUrl(slug, `/c/${emitirCodigoCurto(slug, sessionId)}`);
}
