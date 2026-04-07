'use server';

import { isPlatformAdmin } from '@/lib/authz';

/**
 * Verifica se o email tem acesso ao painel admin.
 * Executado server-side — nunca expõe lógica no client.
 *
 * Fallback temporário: se a tabela platform_admins não existir ou der erro,
 * checa contra ADMIN_EMAILS (env server-side, NÃO NEXT_PUBLIC_*).
 */
export async function checkAdminAccess(email) {
  if (!email) return { authorized: false };

  try {
    const isAdmin = await isPlatformAdmin(email);
    if (isAdmin) return { authorized: true };
  } catch (err) {
    // Fallback: env server-side (temporário, até rodar migration 013)
    const fallbackEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (fallbackEmails.includes(email.trim().toLowerCase())) {
      return { authorized: true };
    }
    console.error('[checkAdminAccess] Erro:', err.message);
  }

  return { authorized: false };
}
