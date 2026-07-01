import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getUserContext } from '@/lib/authz';

/**
 * empresaId do usuário logado SE ele for RH (admin da empresa) — ou platform_admin
 * que também esteja vinculado a uma empresa. Retorna null caso contrário.
 *
 * Server-only (usa cookies via createSupabaseServerClient). As páginas da área do gestor
 * usam isto para resolver o tenant e redirecionar quem não for RH. O escopo de dados é
 * garantido depois pelas actions (requireEmpresaSupabase confronta empresaId × contexto).
 */
export async function getRHEmpresaId(): Promise<string | null> {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!email) return null;
  const ctx = await getUserContext(email);
  if (!ctx) return null;
  if (ctx.role === 'rh' || ctx.isPlatformAdmin) return ctx.colaborador?.empresa_id ?? null;
  return null;
}
