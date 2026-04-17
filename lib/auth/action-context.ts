'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getUserContext } from '@/lib/authz';
import type { AuthenticatedContext } from './request-context';

/**
 * Cria um Supabase client server-side que lê/escreve cookies via `next/headers`.
 * Usado exclusivamente em server actions (que têm acesso a cookies() mas não a Request).
 *
 * Depende de `@supabase/ssr` + `lib/supabase-browser.ts` usando `createBrowserClient`
 * (que sincroniza a sessão do browser pra cookies automaticamente).
 */
function createSupabaseServerAction() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookies();
          return store.getAll();
        },
        async setAll(cookiesToSet) {
          const store = await cookies();
          for (const { name, value, options } of cookiesToSet) {
            try { store.set(name, value, options); } catch { /* read-only em render */ }
          }
        },
      },
    },
  );
}

export async function getAuthenticatedEmailFromAction(): Promise<string | null> {
  try {
    const sb = createSupabaseServerAction();
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user?.email) return null;
    return user.email.trim().toLowerCase();
  } catch {
    return null;
  }
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

export async function requireRoleAction(roles: AllowedRole[]): Promise<AuthenticatedContext> {
  const ctx = await requireUserAction();
  if (roles.includes('admin') && ctx.isPlatformAdmin) return ctx;
  if (ctx.role && (roles as string[]).includes(ctx.role)) return ctx;
  throw new Error(`FORBIDDEN: role necessário ${roles.join('|')}`);
}

export async function assertTenantAccessAction(
  auth: AuthenticatedContext,
  empresaId: string | null | undefined,
): Promise<void> {
  if (!empresaId) throw new Error('BAD_REQUEST: empresaId obrigatório');
  if (auth.isPlatformAdmin) return;
  if (auth.empresaId !== empresaId) throw new Error('FORBIDDEN: sem acesso a esta empresa');
}
