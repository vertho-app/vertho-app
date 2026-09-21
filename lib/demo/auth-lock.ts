import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * generateLink invalida o OTP anterior da MESMA conta. ACME e Sinal compartilham
 * personas: a exclusão precisa ser por identidade e no banco, não por tenant ou
 * por lambda. A lease expira caso a função morra; só o seu dono pode liberá-la.
 */
export async function comLockDeLoginDemo<T>(sb: SupabaseClient, email: string, entrar: () => Promise<T>): Promise<T> {
  const key = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const owner = randomUUID();
  let adquirido = false;
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const { data, error } = await sb.rpc('demo_auth_lock_acquire', { p_key: key, p_owner: owner });
    if (error) throw new Error(`Reservar entrada da demo: ${error.code || 'indisponivel'}`);
    if (data === true) { adquirido = true; break; }
    await esperar(150 + Math.floor(Math.random() * 100));
  }
  if (!adquirido) throw new Error('Entrada da demo ocupada; tente novamente em instantes.');
  try {
    return await entrar();
  } finally {
    const { error } = await sb.rpc('demo_auth_lock_release', { p_key: key, p_owner: owner });
    if (error) console.warn('[demo-auth] liberar entrada:', error.code);
  }
}

export function falhaDeAuthTransitoria(error: { code?: string; status?: number } | null | undefined) {
  return error?.code === 'otp_expired' || error?.status === 429 || (error?.status ?? 0) >= 500;
}

export async function pausaEntreTentativasDeAuth(tentativa: number) {
  await esperar(150 * tentativa + Math.floor(Math.random() * 100));
}

export async function entrarComOtpDemo(sb: SupabaseClient, sessao: SupabaseClient, email: string, redirectTo: string) {
  const { data: atual, error: erroAtual } = await sessao.auth.getUser();
  if (!erroAtual && atual.user?.email?.toLowerCase() === email.toLowerCase()) return;

  await comLockDeLoginDemo(sb, email, async () => {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const { data, error: gerarErro } = await sb.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
      const token = data?.properties?.hashed_token;
      if (gerarErro || !token) {
        console.warn('[demo-auth] geração falhou', { tentativa, code: gerarErro?.code, status: gerarErro?.status });
        if (tentativa < 3 && falhaDeAuthTransitoria(gerarErro)) { await pausaEntreTentativasDeAuth(tentativa); continue; }
        throw new Error('Não foi possível preparar a entrada na demonstração.');
      }
      const { error } = await sessao.auth.verifyOtp({ token_hash: token, type: 'email' });
      if (!error) return;
      console.warn('[demo-auth] consumo falhou', { tentativa, code: error.code, status: error.status });
      // Também recupera uma emissão concorrente por um fluxo legado fora da sala.
      if (tentativa < 3 && falhaDeAuthTransitoria(error)) { await pausaEntreTentativasDeAuth(tentativa); continue; }
      throw new Error('Não foi possível concluir a entrada na demonstração.');
    }
  });
}
