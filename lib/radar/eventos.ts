import 'server-only';

import { headers } from 'next/headers';
import crypto from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase';
import { isLikelyBot } from './ia-narrativa';

type EventoTipo =
  | 'view_escola'
  | 'view_municipio'
  | 'view_estado'
  | 'view_comparar'
  | 'cta_lead_click'
  | 'lead_submit'
  | 'pdf_pronto'
  | 'pdf_baixado'
  | 'citar_aberto';

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/**
 * Registra evento no diag_eventos. Best-effort: erros silenciosos
 * pra nunca bloquear renderização.
 *
 * Use em server components (page.tsx) chamando após resolver dados.
 * Pra eventos client (clique), tem `registrarEventoClient` em actions.ts.
 */
export async function registrarEvento(
  tipo: EventoTipo,
  opts: {
    scopeType?: 'escola' | 'municipio' | 'estado';
    scopeId?: string;
    extra?: Record<string, any>;
  } = {},
) {
  try {
    const sb = createSupabaseAdmin();
    const h = await headers();
    const ua = h.get('user-agent') || null;
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || '';
    const referer = h.get('referer') || null;
    const isBot = isLikelyBot(ua);

    await sb.from('diag_eventos').insert({
      tipo,
      scope_type: opts.scopeType || null,
      scope_id: opts.scopeId || null,
      user_agent: ua?.slice(0, 500),
      referer: referer?.slice(0, 500),
      ip_hash: ip ? hashIp(ip) : null,
      is_bot: isBot,
      extra: opts.extra || null,
    });
  } catch (err) {
    console.error('[registrarEvento] falhou', err);
  }
}
