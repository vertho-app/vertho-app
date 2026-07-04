// Guards de acesso do Portal do Representante — enforcement 100% server-side.
//
// Modelo: RC é usuário Supabase Auth ligado a sales_representatives por e-mail
// (user_id opcional). NÃO é colaborador de tenant — por isso não passa por
// getUserContext/requireUserAction. Admin comercial = platform admin com as
// chaves sales_channel.* (sócio enxerga em leitura; escrita é master).
//
// Regras espelhadas do resto do app: isolamento por representante_id em TODA
// query; nunca confiar em filtro client-side.
import { getAuthenticatedEmailFromAction, requireAdminAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import type { SalesRepresentative } from './types';

export type RepresentativeContext = {
  rep: SalesRepresentative;
  email: string;
};

/** Contexto do RC logado (null se o usuário não é representante). */
export async function getRepresentativeContext(): Promise<RepresentativeContext | null> {
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return null;
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('sales_representatives')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (!data) return null;
  return { rep: data as SalesRepresentative, email };
}

/** Exige RC ativo. Suspenso/inativo não opera o portal. */
export async function requireRepresentativeAction(): Promise<RepresentativeContext> {
  const ctx = await getRepresentativeContext();
  if (!ctx) throw new Error('FORBIDDEN: usuário não é representante comercial');
  if (ctx.rep.status !== 'active') throw new Error('FORBIDDEN: representante não está ativo');
  return ctx;
}

export type RepOrAdminContext =
  | { kind: 'representative'; rep: SalesRepresentative; email: string }
  | { kind: 'admin'; email: string };

/**
 * Aceita RC ativo OU platform admin (leitura do canal). Usado em actions de
 * leitura que servem as duas visões — o chamador DEVE filtrar por
 * representante_id quando kind === 'representative'.
 */
export async function requireRepresentativeOrAdminAction(): Promise<RepOrAdminContext> {
  const repCtx = await getRepresentativeContext();
  if (repCtx) {
    if (repCtx.rep.status !== 'active') throw new Error('FORBIDDEN: representante não está ativo');
    return { kind: 'representative', rep: repCtx.rep, email: repCtx.email };
  }
  const admin = await requireAdminAction(); // qualquer platform admin em leitura
  return { kind: 'admin', email: admin.email };
}

/**
 * Admin comercial. `write: true` (default) exige sales_channel.manage
 * (bloqueia sócio); `write: false` aceita qualquer platform admin (leitura).
 */
export async function requireCommercialAdminAction(write = true) {
  return requireAdminAction(write ? 'sales_channel.manage' : undefined);
}

/** Garante que o registro pertence ao RC do contexto (anti-IDOR). */
export function assertRepresentativeOwnership(ctx: RepresentativeContext, rowRepresentanteId: string | null | undefined): void {
  if (!rowRepresentanteId || rowRepresentanteId !== ctx.rep.id) {
    throw new Error('FORBIDDEN: registro de outro representante');
  }
}
