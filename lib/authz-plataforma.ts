/**
 * A régua de acesso de PLATAFORMA (Vertho), num lugar só.
 *
 * Existia apenas dentro de `app/admin/admin-actions.ts::checkAdminAccess`. Quando
 * o Radar virou interno (10/08/2026) surgiu um segundo consumidor, e copiar a
 * régua é como as duas pontas divergem: quem entrar na `platform_admins` amanhã
 * teria admin e não teria Radar, sem nada acusar. Um arquivo, dois chamadores.
 *
 * NÃO é `'use server'` de propósito — é uma função de biblioteca, chamada tanto
 * por Server Component (layout) quanto por Server Action. Marcar `'use server'`
 * aqui a transformaria em endpoint HTTP público, que é o oposto do que ela faz.
 */
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { isPlatformAdmin } from '@/lib/authz';

export type AcessoPlataforma = {
  authorized: boolean;
  reason?: 'unauthenticated' | 'unauthorized';
  email?: string;
};

/**
 * Identidade derivada 100% server-side (cookie SSR) — zero input do cliente.
 * É por isso que não recebe parâmetro: um `email` no argumento seria escolhido
 * por quem chama, e toda action é um endpoint HTTP.
 */
export async function checarAcessoPlataforma(): Promise<AcessoPlataforma> {
  try {
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { authorized: false, reason: 'unauthenticated' };

    if (await isPlatformAdmin(email)) return { authorized: true, email };

    // Fallback: env server-side (temporário). ⚠️ `ADMIN_EMAILS` É AUTORIZAÇÃO,
    // não caderno de contatos — pôr um e-mail aqui para "receber alerta" dá
    // acesso de plataforma. Alerta vai em `HEALTH_ALERT_EMAILS`.
    const fallback = (process.env.ADMIN_EMAILS || '')
      .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (fallback.includes(email)) return { authorized: true, email };
  } catch (err: any) {
    console.error('[authz-plataforma]', err?.message);
  }

  return { authorized: false, reason: 'unauthorized' };
}

/**
 * Versão que LANÇA — para usar no topo de cada Server Action interna.
 *
 * Gate de layout não protege action nenhuma: num arquivo `'use server'` todo
 * export é um endpoint HTTP, chamável direto, sem passar por página alguma. Uma
 * tela atrás de login cujas actions estão abertas continua entregando o mesmo
 * dado a quem souber o action id — que está no bundle público.
 */
export async function exigirAcessoPlataforma(contexto: string): Promise<void> {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) {
    throw new Error(`[${contexto}] acesso restrito à equipe Vertho`);
  }
}
