import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

/**
 * Segundo fator (aplicativo autenticador) para o PODER de plataforma (R-145, passo 3, 10/10/2026).
 *
 * Por quê: até 10/10 a conta master entrava no painel com uma senha publicada no repositório
 * público. As senhas saíram, mas o link de e-mail sozinho ainda faz de quem invadir o e-mail de um
 * admin o dono de todos os clientes. Com esta régua, ser admin da plataforma exige a sessão em
 * `aal2` (link + código do aplicativo).
 *
 * Onde vale: `getUserContext` e `isPlatformAdmin` (`lib/authz.ts`) e o portão do painel
 * (`lib/authz-plataforma.ts`), de onde saem `requireAdminAction`, `requireAdmin`, `can()` e os
 * layouts. Um admin sem o código PERDE O PODER, não a conta: segue com o papel que tem nos tenants.
 *
 * A dúvida nega: só libera quando a requisição carrega uma identidade VERIFICADA (cookie ou Bearer,
 * assinatura conferida por `getClaims`) com o MESMO e-mail e `aal2`. Fora de requisição (task,
 * script), sem sessão, com sessão de outra pessoa ou com duas identidades do mesmo e-mail em níveis
 * diferentes: não libera.
 *
 * Saída de emergência: tirar o e-mail desta lista volta ao comportamento anterior. Celular perdido:
 * `nextjs-app/scripts/_zerar-segundo-fator.mjs` (fora do git) remove os fatores pela chave de serviço.
 */

/** Fase 1: só o master, para testar antes de valer para os sócios. Fase 2: `'todos'`. */
export const ADMINS_COM_SEGUNDO_FATOR: readonly string[] | 'todos' = ['rodrigo@vertho.ai'];

export function exigeSegundoFator(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  return ADMINS_COM_SEGUNDO_FATOR === 'todos' || ADMINS_COM_SEGUNDO_FATOR.includes(e);
}

type Identidade = { email: string; aal: string | null };

function identidadeDasClaims(claims: any): Identidade | null {
  const email = String(claims?.email || '').trim().toLowerCase();
  if (!email) return null;
  return { email, aal: typeof claims?.aal === 'string' ? claims.aal : null };
}

/** As identidades VERIFICADAS desta requisição (cookie de sessão e Bearer). Uma vez por requisição. */
const identidadesDaRequisicao = cache(async (): Promise<Identidade[]> => {
  const ids: Identidade[] = [];
  let sb: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    sb = await createSupabaseServerClient();
  } catch {
    return ids; // fora de requisição: nenhuma identidade, logo nenhum poder
  }
  try {
    const { data, error } = await sb.auth.getClaims();
    const id = error ? null : identidadeDasClaims(data?.claims);
    if (id) ids.push(id);
  } catch { /* cookie ausente ou inválido: sem identidade de cookie */ }
  try {
    const h = await headers();
    const auth = h.get('authorization') || '';
    if (auth.startsWith('Bearer ')) {
      const { data, error } = await sb.auth.getClaims(auth.slice(7));
      const id = error ? null : identidadeDasClaims(data?.claims);
      if (id) ids.push(id);
    }
  } catch { /* sem cabeçalho legível: sem identidade de Bearer */ }
  return ids;
});

/** A sessão desta requisição prova o segundo fator para ESTE e-mail? */
export async function segundoFatorConfirmado(email: string | null | undefined): Promise<boolean> {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  const doEmail = (await identidadesDaRequisicao()).filter((i) => i.email === e);
  return doEmail.length > 0 && doEmail.every((i) => i.aal === 'aal2');
}

/** Poder de plataforma liberado para este e-mail (que JÁ se sabe ser admin)? */
export async function poderDePlataformaLiberado(email: string | null | undefined): Promise<boolean> {
  if (!exigeSegundoFator(email)) return true;
  return segundoFatorConfirmado(email);
}
