import { getSupabase } from '@/lib/supabase-browser';

/**
 * Wrapper de `fetch` que injeta `Authorization: Bearer <access_token>` do usuário
 * autenticado via Supabase.
 *
 * Uso no client:
 *   import { fetchAuth } from '@/lib/auth/fetch-auth';
 *   const res = await fetchAuth('/api/colaboradores?empresa_id=' + id);
 *
 * Se não houver sessão ativa, delega pro `fetch` normal (rota lida com 401).
 */
export async function fetchAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
