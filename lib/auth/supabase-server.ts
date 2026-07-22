import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createSupabaseServerClient() {
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            try {
              store.set(name, value, options);
            } catch {
              // Server Components expõem um cookie store READ-ONLY. Cair aqui
              // significa que um refresh rotacionou o token e o par novo se
              // PERDEU — o browser fica com o refresh token já consumido e a
              // sessão morre no meio da navegação (era a causa do pisca-pisca
              // /admin/dashboard ↔ /login, 22/07). O refresh agora acontece no
              // proxy.js, onde o cookie é gravável; se este aviso aparecer, tem
              // caminho de auth escapando do proxy.
              console.warn('[auth] refresh perdido: cookie store read-only (RSC) —', name);
            }
          }
        },
      },
    },
  );
}
