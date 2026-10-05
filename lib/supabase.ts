import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { marcarClienteDoServidor } from '@/lib/auth/cliente-do-servidor';

// Cliente público (respeita RLS — usa anon key + token do usuário)
export function createSupabaseClient(req: Request | { headers: Headers }): SupabaseClient {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: req.headers.get('authorization') || '' },
      },
    }
  );
  return supabase;
}

// Cliente admin (bypass RLS — apenas para operações internas do servidor)
export function createSupabaseAdmin(): SupabaseClient {
  // Marcado: actions que aceitam um `sb` "interno" só o honram se ele tiver a marca
  // (ver `lib/auth/cliente-do-servidor.ts`), porque o argumento de uma Server Action
  // vem do cliente e um `{}` truthy pulava o gate.
  return marcarClienteDoServidor(createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  ));
}
