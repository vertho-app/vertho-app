import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext, canViewColabJourney } from '@/lib/authz';
import { can, type PermissionKey } from '@/lib/permissions';
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

export type AuthenticatedUser = { id: string; email: string };

async function resolveTokenToUser(
  token: string,
): Promise<AuthenticatedUser | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  return { id: data.user.id, email: data.user.email.trim().toLowerCase() };
}

export async function getAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUser | null> {
  // 1. Bearer
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const user = await resolveTokenToUser(auth.slice(7));
    if (user) return user;
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
        token = Array.isArray(parsed)
          ? parsed[0]
          : parsed?.access_token || null;
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
        const user = await resolveTokenToUser(token);
        if (user) return user;
      }
    } catch {
      /* cookie mal-formado: ignora */
    }
  }
  return null;
}

export async function getAuthenticatedEmail(
  req: Request,
): Promise<string | null> {
  return (await getAuthenticatedUser(req))?.email ?? null;
}

export async function requireUser(
  req: Request,
): Promise<AuthenticatedContext | Response> {
  const email = await getAuthenticatedEmail(req);
  if (!email)
    return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const ctx = await getUserContext(email);
  if (!ctx)
    return NextResponse.json(
      { error: 'usuário sem contexto no tenant' },
      { status: 401 },
    );
  return { ...ctx, email };
}

export async function requireAdmin(
  req: Request,
): Promise<AuthenticatedContext | Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (!auth.isPlatformAdmin) {
    return NextResponse.json(
      { error: 'apenas platform admin' },
      { status: 403 },
    );
  }
  return auth;
}

export async function requirePermission(
  req: Request,
  permission: PermissionKey,
): Promise<AuthenticatedContext | Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (await can(auth, permission)) return auth;
  return NextResponse.json(
    { error: `permissão necessária: ${permission}` },
    { status: 403 },
  );
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
    return NextResponse.json(
      { error: 'empresaId obrigatório' },
      { status: 400 },
    );
  }
  if (auth.isPlatformAdmin) return null;
  if (auth.empresaId !== empresaId) {
    return NextResponse.json(
      { error: 'sem acesso a esta empresa' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Régua única de "liderado" para as rotas de API (R-11, revisão de 02/10/2026).
 *
 * Telas e actions decidiam por `canViewColabJourney` (`lib/authz.ts`), que olha
 * `gestor_email`; estas duas funções olhavam `area_depto`. Eram duas regras
 * para a mesma pergunta, e a consulta de leitura de 03/10 mediu o estrago: de
 * 369 pares gestor e liderado, só 61 têm a mesma área. O PDF do liderado de
 * verdade falhava em 83% dos pares, e o gestor baixava evolução, certificado e
 * conteúdo de quem era só da mesma área. Agora as rotas delegam à MESMA função
 * das telas, com a linha lida do banco:
 *  - platform admin: qualquer colaborador;
 *  - o próprio colaborador;
 *  - RH: qualquer colaborador da mesma empresa;
 *  - gestor: os liderados (`gestor_email` do liderado igual ao e-mail do gestor,
 *    sem diferença de caixa, em código, nunca por `ilike`).
 * A leitura já sai escopada pela empresa da sessão: cross-tenant nunca passa.
 * Falha de leitura responde 503, não "sem acesso" nem "liberado".
 */
async function lerAlvoDaEquipe(
  auth: AuthenticatedContext,
  filtro: { coluna: 'id' | 'email'; valor: string },
): Promise<Response | null> {
  if (auth.role !== 'rh' && auth.role !== 'gestor') {
    return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
  }
  if (!auth.empresaId) {
    return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
  }
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('colaboradores')
    .select('id, empresa_id, gestor_email')
    .eq(filtro.coluna, filtro.valor)
    .eq('empresa_id', auth.empresaId)
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'não foi possível conferir o acesso a este colaborador' }, { status: 503 });
  }
  if (!canViewColabJourney(auth, data)) {
    return NextResponse.json({ error: 'sem acesso a este colaborador' }, { status: 403 });
  }
  return null;
}

/** Acesso aos dados de um colaborador pelo ID. Régua: `lerAlvoDaEquipe`. */
export async function assertColabAccess(
  auth: AuthenticatedContext,
  colabId: string,
): Promise<Response | null> {
  if (!colabId) {
    return NextResponse.json(
      { error: 'colaboradorId obrigatório' },
      { status: 400 },
    );
  }
  if (auth.isPlatformAdmin) return null;
  if (auth.colaborador?.id === colabId) return null;
  return lerAlvoDaEquipe(auth, { coluna: 'id', valor: colabId });
}

/** Acesso pelo E-MAIL do colaborador. Mesma régua de `assertColabAccess`. */
export async function assertEmailAccess(
  auth: AuthenticatedContext,
  emailAlvo: string,
): Promise<Response | null> {
  const normalizado = String(emailAlvo || '').trim().toLowerCase();
  if (!normalizado) {
    return NextResponse.json({ error: 'email obrigatório' }, { status: 400 });
  }
  if (auth.isPlatformAdmin) return null;
  if (auth.email === normalizado) return null;
  return lerAlvoDaEquipe(auth, { coluna: 'email', valor: normalizado });
}
