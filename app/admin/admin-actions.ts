'use server';

import { checarAcessoPlataforma } from '@/lib/authz-plataforma';

/**
 * Verifica se o usuário autenticado (via cookie SSR) é platform admin.
 * Identidade derivada 100% server-side — zero input do client.
 *
 * A régua mora em `lib/authz-plataforma.ts` desde 10/08/2026, quando o Radar
 * virou interno e passou a precisar da MESMA resposta. Aqui ficou só o
 * envelope, para não mexer nos chamadores.
 *
 * Retorna:
 *   { authorized: true }
 *   { authorized: false, reason: 'unauthenticated' }
 *   { authorized: false, reason: 'unauthorized' }
 */
export async function checkAdminAccess(): Promise<{
  authorized: boolean;
  reason?: 'unauthenticated' | 'unauthorized';
}> {
  const { authorized, reason } = await checarAcessoPlataforma();
  return authorized ? { authorized } : { authorized, reason };
}
