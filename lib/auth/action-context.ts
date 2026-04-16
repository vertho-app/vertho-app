import { cookies, headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import type { AuthenticatedContext } from './request-context';

/**
 * Autenticação server-side para Server Actions ('use server').
 *
 * Diferente das API routes, Server Actions não recebem `Request`: o token
 * vem via cookie SSR (`sb-<project-ref>-auth-token`) OU, em raríssimos casos,
 * via header Authorization. Este helper mimetiza o comportamento de
 * `lib/auth/request-context.ts::requireUser` mas lendo de `cookies()`/`headers()`
 * do `next/headers`.
 *
 * Uso típico:
 *   const auth = await requireAdminAction();
 *   // auth.email, auth.colaborador, auth.empresaId, auth.role, auth.isPlatformAdmin
 *
 * Actions devem envolver em try/catch ou deixar a exceção subir — o Next
 * serializa a mensagem pro client (evite colocar dados sensíveis na mensagem).
 */

export async function getAuthenticatedEmailFromAction(): Promise<string | null> {
  const sb = createSupabaseAdmin();

  // 1. Cookie SSR Supabase (caminho principal em server action)
  try {
    const c = await cookies();
    const cookieList = c.getAll();
    for (const { name, value } of cookieList) {
      if (!name.startsWith('sb-') || !name.endsWith('-auth-token')) continue;
      try {
        const raw = value;
        let token: string | null = null;
        if (raw.startsWith('base64-')) {
          const decoded = Buffer.from(raw.slice(7), 'base64').toString('utf8');
          const parsed = JSON.parse(decoded);
          token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || null;
        } else if (raw.startsWith('[')) {
          const parsed = JSON.parse(raw);
          token = Array.isArray(parsed) ? parsed[0] : null;
        } else if (raw.startsWith('{')) {
          const parsed = JSON.parse(raw);
          token = parsed?.access_token || null;
        } else {
          token = raw;
        }
        if (token) {
          const { data } = await sb.auth.getUser(token);
          if (data?.user?.email) return data.user.email.trim().toLowerCase();
        }
      } catch {
        /* cookie mal-formado: tenta o próximo */
      }
    }
  } catch {
    /* fora de request scope: ignora */
  }

  // 2. Header Bearer (raro em server action mas suportado)
  try {
    const h = await headers();
    const auth = h.get('authorization');
    if (auth?.startsWith('Bearer ')) {
      const { data } = await sb.auth.getUser(auth.slice(7));
      if (data?.user?.email) return data.user.email.trim().toLowerCase();
    }
  } catch {
    /* ignora */
  }

  return null;
}

export async function requireUserAction(): Promise<AuthenticatedContext> {
  const email = await getAuthenticatedEmailFromAction();
  if (!email) throw new Error('UNAUTHORIZED: usuário não autenticado');
  const ctx = await getUserContext(email);
  if (!ctx) throw new Error('UNAUTHORIZED: usuário sem contexto no tenant');
  return { ...ctx, email };
}

export async function requireAdminAction(): Promise<AuthenticatedContext> {
  const ctx = await requireUserAction();
  if (!ctx.isPlatformAdmin) throw new Error('FORBIDDEN: apenas platform admin');
  return ctx;
}

type AllowedRole = 'colaborador' | 'gestor' | 'rh' | 'admin';

/**
 * Exige que o usuário tenha um dos roles. `'admin'` inclui platform admins.
 */
export async function requireRoleAction(roles: AllowedRole[]): Promise<AuthenticatedContext> {
  const ctx = await requireUserAction();
  if (roles.includes('admin') && ctx.isPlatformAdmin) return ctx;
  if (ctx.role && (roles as string[]).includes(ctx.role)) return ctx;
  throw new Error(`FORBIDDEN: role necessário ${roles.join('|')}`);
}

/**
 * Valida que a action pode mexer na empresa. Platform admin bypassa.
 */
export function assertTenantAccessAction(
  auth: AuthenticatedContext,
  empresaId: string | null | undefined,
): void {
  if (!empresaId) throw new Error('BAD_REQUEST: empresaId obrigatório');
  if (auth.isPlatformAdmin) return;
  if (auth.empresaId !== empresaId) throw new Error('FORBIDDEN: sem acesso a esta empresa');
}
