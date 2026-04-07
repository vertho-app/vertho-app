import { createClient } from '@supabase/supabase-js';

// Cliente público (respeita RLS — usa anon key + token do usuário)
export function createSupabaseClient(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: { Authorization: req.headers.get('authorization') || '' },
      },
    }
  );
  return supabase;
}

// Cliente admin (bypass RLS — apenas para operações internas do servidor)
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
