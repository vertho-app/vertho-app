/**
 * Login por WhatsApp OTP — colaborador sem email.
 *
 * O telefone (E.164) é a identidade. Pra reusar 100% a cadeia de auth
 * testada (Supabase Auth + findColabByEmail + request-context + RLS), o
 * colaborador sem email recebe um EMAIL-PROXY interno determinístico —
 * invisível pro usuário, nunca recebe email real. O código OTP nunca é
 * persistido: guardamos só sha256(pepper:code) em `colab_otp`.
 *
 * Server-only (usa SUPABASE_SERVICE_ROLE_KEY via createSupabaseAdmin).
 */
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const OTP_TTL_MS = 10 * 60 * 1000;        // validade do código
const OTP_MAX_ATTEMPTS = 5;               // tentativas de verificação por código
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_RATE_MAX = 3;                    // emissões por telefone na janela
const OTP_MIN_INTERVAL_MS = 30 * 1000;     // intervalo mínimo entre emissões

const PROXY_DOMAIN = 'nao-email.vertho.ai'; // subdomínio não-roteável (nunca recebe email)

/**
 * Email-proxy determinístico e globalmente único pra um colaborador
 * phone-only. Inclui empresaId porque o mesmo telefone pode existir em
 * tenants diferentes (multi-tenant) e auth.users.email é único global.
 */
export function proxyEmailFromPhone(empresaId: string, e164: string): string {
  const emp = String(empresaId).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const tel = String(e164).replace(/\D/g, '');
  return `wa.${emp}.${tel}@${PROXY_DOMAIN}`;
}

/** True se o email é um proxy interno (não exibir pro usuário). */
export function isProxyEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${PROXY_DOMAIN}`);
}

function pepper(): string {
  // OTP_PEPPER permite rotação dedicada; fallback no service role key
  // (segredo server-only já presente) pra não exigir env nova no deploy.
  const p = process.env.OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!p) throw new Error('OTP pepper ausente (defina OTP_PEPPER ou SUPABASE_SERVICE_ROLE_KEY)');
  return p;
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(`${pepper()}:${code}`).digest('hex');
}

function genCode(): string {
  // 6 dígitos, cripto-seguro, sem viés; padStart preserva zeros à esquerda.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export type OtpIssueResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Gera e persiste um OTP (só o hash). Retorna o código em claro APENAS
 * pro caller enviar via Z-API — nunca logar/persistir o retorno.
 */
export async function issueOtp(
  sb: SupabaseClient,
  empresaId: string,
  telefone: string,
): Promise<OtpIssueResult> {
  const sinceWindow = new Date(Date.now() - OTP_RATE_WINDOW_MS).toISOString();
  const { data: recent } = await sb
    .from('colab_otp')
    .select('created_at')
    .eq('empresa_id', empresaId)
    .eq('telefone', telefone)
    .gte('created_at', sinceWindow)
    .order('created_at', { ascending: false });

  const list = recent || [];
  if (list.length >= OTP_RATE_MAX) {
    return { ok: false, error: 'Muitas solicitações. Tente novamente em alguns minutos.' };
  }
  if (list[0]) {
    const elapsed = Date.now() - new Date(list[0].created_at).getTime();
    if (elapsed < OTP_MIN_INTERVAL_MS) {
      return { ok: false, error: 'Aguarde alguns segundos antes de pedir outro código.' };
    }
  }

  const code = genCode();
  const { error } = await sb.from('colab_otp').insert({
    empresa_id: empresaId,
    telefone,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) return { ok: false, error: 'Falha ao gerar código.' };
  return { ok: true, code };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Valida o código contra o OTP vigente (último não-consumido). Expiração,
 * limite de tentativas e comparação em tempo constante. Consome em sucesso.
 */
export async function checkOtp(
  sb: SupabaseClient,
  empresaId: string,
  telefone: string,
  code: string,
): Promise<OtpVerifyResult> {
  const codeClean = String(code || '').replace(/\D/g, '');
  if (codeClean.length !== 6) return { ok: false, error: 'Código inválido.' };

  const { data: rows } = await sb
    .from('colab_otp')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('empresa_id', empresaId)
    .eq('telefone', telefone)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const otp = rows?.[0];
  if (!otp) return { ok: false, error: 'Código não encontrado. Solicite um novo.' };
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Código expirado. Solicite um novo.' };
  }
  if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'Tentativas esgotadas. Solicite um novo código.' };
  }

  if (!safeEqualHex(otp.code_hash, hashCode(codeClean))) {
    await sb.from('colab_otp').update({ attempts: (otp.attempts ?? 0) + 1 }).eq('id', otp.id);
    return { ok: false, error: 'Código incorreto.' };
  }

  await sb.from('colab_otp').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);
  return { ok: true };
}
