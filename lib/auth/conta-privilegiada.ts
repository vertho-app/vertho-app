import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * O e-mail é de platform admin? Falha FECHADA: sem conseguir saber, responde `true`.
 *
 * Existe porque `isPlatformAdmin` (lib/authz) é fail-open para este uso: o
 * supabase-js RETORNA `{ error }` em vez de lançar, `data` vem `null` e a função
 * devolve `false`. Para a pergunta "esta conta pode receber o link de login no
 * WhatsApp?", um erro de consulta virava "pode", justamente quando o banco está
 * instável (revisão automática do commit de 05/10/2026). Aqui "não sei" e "é
 * admin" têm o mesmo efeito: o link só vai pelo e-mail.
 *
 * Não substitui `isPlatformAdmin` nos gates de autorização, que seguem como estão.
 */
export async function contaDeAdminOuIndeterminada(email: string): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from('platform_admins')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[conta-privilegiada] consulta falhou, tratando como admin:', error.message);
      return true;
    }
    return !!data;
  } catch (e: any) {
    console.warn('[conta-privilegiada] consulta lançou, tratando como admin:', e?.message || e);
    return true;
  }
}
