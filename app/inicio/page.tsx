import { redirect } from 'next/navigation';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { isPlatformAdmin } from '@/lib/authz';

export const dynamic = 'force-dynamic';

/**
 * Destino pós-login (ponto ÚNICO de decisão, server-side): platform admins caem no
 * /admin; colaboradores no /dashboard. Antes o login mandava todo mundo pro
 * /dashboard, então um admin que também é colaborador de um tenant caía na tela do
 * tenant (ex.: samuel@vertho.ai → Ibipeba). Cobre TODOS os métodos de login porque
 * é o alvo padrão do redirect. Um `?redirect=` explícito continua tendo precedência
 * (o login só usa /inicio quando não há alvo).
 */
export default async function InicioPage() {
  const email = await getAuthenticatedEmailFromAction();
  if (!email) redirect('/login');
  if (await isPlatformAdmin(email)) redirect('/admin/dashboard');
  redirect('/dashboard');
}
