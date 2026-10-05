import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  const cliente = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  // Marcado: actions que aceitam um `sb` "interno" só o honram se ele tiver a marca
  // (conferida em `lib/auth/cliente-do-servidor.ts`), porque o argumento de uma Server
  // Action vem do cliente e um `{}` truthy pulava o gate.
  //
  // ⚠️ A chave do símbolo é repetida AQUI, de propósito, e não importada. Importar
  // `cliente-do-servidor` neste arquivo (que as actions também importam) fez o Turbopack
  // falhar o build com "Two or more assets with different content were emitted to the
  // same output path" (`lib_*.js`), e o `next build` local é o único lugar que acusa. O
  // teste `sb-do-cliente-nao-pula-o-gate` ("createSupabaseAdmin devolve cliente marcado")
  // pega as duas pontas se a chave divergir.
  Object.defineProperty(cliente, Symbol.for('vertho.cliente-do-servidor'), { value: true, enumerable: false });
  return cliente;
}
