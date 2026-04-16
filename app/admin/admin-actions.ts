'use server';

import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { isPlatformAdmin } from '@/lib/authz';

/**
 * Verifica se o usuário autenticado (via cookie SSR) é platform admin.
 * Identidade derivada 100% server-side — zero input do client.
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
  try {
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { authorized: false, reason: 'unauthenticated' };

    const isAdmin = await isPlatformAdmin(email);
    if (isAdmin) return { authorized: true };

    // Fallback: env server-side (temporário)
    const fallbackEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (fallbackEmails.includes(email)) return { authorized: true };
  } catch (err: any) {
    console.error('[checkAdminAccess]', err?.message);
  }

  return { authorized: false, reason: 'unauthorized' };
}
