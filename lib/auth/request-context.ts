import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import type { UserContext, Role } from '@/types';

/**
 * Autenticação server-side pra API routes.
 *
 * Extrai o usuário autenticado de:
 *   1. Header `Authorization: Bearer <access_token>` (modo preferido — lib/auth/fetch-auth.ts injeta)
 *   2. Cookie Supabase SSR `sb-<project-ref>-auth-token` (fallback pra fetches legados)
 *
 * Depois resolve o contexto multi-tenant via `getUserContext(email)` e expõe
 * guards (`requireUser`, `requireAdmin`, `requireRole`, `assertTenantAccess`,
 * `assertColabAccess`) que retornam Response 401/403 quando falham.
 *
 * Uso típico:
 *   const auth = await requireUser(req);
 *   if (auth instanceof Response) return auth;
 *   // auth.email, auth.colaborador, auth.empresaId, auth.role, auth.isPlatformAdmin
 */

export interface AuthenticatedContext extends UserContext {
  email: string;
}

async function resolveTokenToEmail(token: string): Promise<string | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  return data.user.email.trim().toLowerCase();
}

export async function getAuthenticatedEmail(req: Request): Promise<string | null> {
  // 1. Bearer
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const email = await resolveTokenToEmail(auth.slice(7));
    if (email) return email;
  }
  // 2. Cookie Supabase SSR
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (match) {
    try {
      const raw = decodeURIComponent(match[1]);
      // Supabase JS client salva como JSON ["access_token","refresh_token", ...]
      // OU base64-<json>
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
        // Token puro (raro mas possível)
        token = raw;
      }
      if (token) {
        const email = await resolveTokenToEmail(token);
        if (email) return email;
      }
    } catch {
      /* cookie mal-formado: ignora */
    }
  }
  return null;
}

export async function requireUser(req: Request): Promise<AuthenticatedContext | Response> {
  const email = await getAuthenticatedEmail(req);
  if (!email) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const ctx = await getUserContext(email);
  if (!ctx) return NextResponse.json({ error: 'usuário sem contexto no tenant' }, { status: 401 });
  return { ...ctx, email };
}

export async function requireAdmin(req: Request): Promise<AuthenticatedContext | Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (!auth.isPlatformAdmin) {
    return NextResponse.json({ error: 'apenas platform admin' }, { status: 403 });
  }
  return auth;
}

type AllowedRole = Role | 'admin';

/**
 * Exige que o usuário tenha um dos roles. `'admin'` inclui platform admins.
 * Ex: requireRole(req, ['gestor', 'rh', 'admin']) → gestor/rh OU platform admin.
 */
export async function requireRole(
  req: Request,
  roles: AllowedRole[],
): Promise<AuthenticatedContext | Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (roles.includes('admin') && auth.isPlatformAdmin) return auth;
  if (auth.role && (roles as string[]).includes(auth.role)) return auth;
  return NextResponse.json(
    { error: `role necessário: ${roles.join('|')}` },
    { status: 403 },
  );
}

/**
 * Valida que o usuário tem acesso à empresa especificada.
 * - colaborador/gestor/rh: empresaId == auth.empresaId
 * - platform admin: acesso a todas
 * Retorna Response 400/403 se falhar, null se OK.
 */
export function assertTenantAccess(
  auth: AuthenticatedContext,
  empresaId: string | null | undefined,
): Response | null {
  if (!empresaId) {
    return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 });
  }
  if (auth.isPlatformAdmin) return null;
  if (auth.empresaId !== empresaId) {
    return NextResponse.json({ error: 'sem acesso a esta empresa' }, { status: 403 });
  }
  return null;
}

/**
 * Valida que o usuário pode acessar dados de um colaborador.
 * - platform admin: acesso total
 * - próprio colab: acesso ao próprio registro
 * - RH: qualquer colaborador da mesma empresa
 * - gestor: apenas colaboradores da mesma empresa E mesma area_depto
 *   (se gestor não tem area_depto definida → fail closed, sem acesso a terceiros)
 * Caso contrário: 403.
 */
export async function assertColabAccess(
  auth: AuthenticatedContext,
  colabId: string,
): Promise<Response | null> {
  if (!colabId) {
    return NextResponse.json({ error: 'colaboradorId obrigatório' }, { status: 400 });
  }
  if (auth.isPlatformAdmin) return null;
  if (auth.colaborador?.id === colabId) return null;
  if (auth.role === 'rh' || auth.role === 'gestor') {
    const sb = createSupabaseAdmin();
    const { data } = await sb
      .from('colaboradores')
      .select('empresa_id, area_depto')
      .eq('id', colabId)
      .maybeSingle();
    if (!data || data.empresa_id !== auth.empresaId) {
      return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
    }
    if (auth.role === 'rh') return null;
    // Gestor: restringe a mesma area_depto (fail closed se area_depto do gestor é null)
    const gestorArea = auth.colaborador?.area_depto;
    if (!gestorArea || data.area_depto !== gestorArea) {
      return NextResponse.json({ error: 'gestor sem acesso a colaborador de outra área' }, { status: 403 });
    }
    return null;
  }
  return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
}

/**
 * Valida acesso por email (mesmas regras de assertColabAccess: RH empresa
 * inteira, gestor restrito a mesma area_depto, fail closed se gestor sem área).
 */
export async function assertEmailAccess(
  auth: AuthenticatedContext,
  emailAlvo: string,
): Promise<Response | null> {
  const normalizado = emailAlvo.trim().toLowerCase();
  if (auth.isPlatformAdmin) return null;
  if (auth.email === normalizado) return null;
  if (auth.role === 'rh' || auth.role === 'gestor') {
    const sb = createSupabaseAdmin();
    const { data } = await sb
      .from('colaboradores')
      .select('empresa_id, area_depto')
      .eq('email', normalizado)
      .maybeSingle();
    if (!data || data.empresa_id !== auth.empresaId) {
      return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
    }
    if (auth.role === 'rh') return null;
    // Gestor: mesma area_depto (fail closed se gestor sem área)
    const gestorArea = auth.colaborador?.area_depto;
    if (!gestorArea || data.area_depto !== gestorArea) {
      return NextResponse.json({ error: 'gestor sem acesso a colaborador de outra área' }, { status: 403 });
    }
    return null;
  }
  return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
}
