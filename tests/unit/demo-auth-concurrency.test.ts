import { describe, expect, it, vi } from 'vitest';
import { comLockDeLoginDemo, entrarComOtpDemo } from '@/lib/demo/auth-lock';

function ambiente() {
  const locks = new Map<string, string>();
  let tokenAtual = '';
  let contador = 0;
  const sb = {
    rpc: vi.fn(async (nome: string, args: any) => {
      if (nome.endsWith('acquire')) {
        if (locks.has(args.p_key)) return { data: false, error: null };
        locks.set(args.p_key, args.p_owner);
        return { data: true, error: null };
      }
      if (locks.get(args.p_key) === args.p_owner) locks.delete(args.p_key);
      return { error: null };
    }),
    auth: { admin: { generateLink: vi.fn(async () => {
      tokenAtual = `otp-${++contador}`;
      return { data: { properties: { hashed_token: tokenAtual } }, error: null };
    }) } },
  };
  const cliente = () => ({ auth: {
    getUser: vi.fn(async () => ({ data: { user: null as any }, error: null })),
    verifyOtp: vi.fn(async ({ token_hash }: any): Promise<any> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (token_hash !== tokenAtual) return { error: { code: 'otp_expired', status: 403 } };
      tokenAtual = '';
      return { error: null };
    }),
  } });
  return { sb, cliente, locks };
}

describe('entrada simultânea de visitantes nas personas', () => {
  it('serializa geração E consumo entre ACME e Sinal que usam a mesma identidade', async () => {
    const { sb, cliente, locks } = ambiente();
    const a = cliente(), b = cliente();
    await Promise.all([
      entrarComOtpDemo(sb as any, a as any, 'bruna.demo@vertho.ai', 'https://usuario-demo.vertho.ai/dashboard'),
      entrarComOtpDemo(sb as any, b as any, 'bruna.demo@vertho.ai', 'https://usuario-sinal.vertho.ai/dashboard'),
    ]);
    expect(a.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(b.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(locks.size).toBe(0);
    const chaves = sb.rpc.mock.calls.filter(([nome]) => nome.endsWith('acquire')).map(([, args]) => args.p_key);
    expect(new Set(chaves).size).toBe(1);
    expect(chaves[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uma sessão já correta não emite outro OTP nem disputa lock', async () => {
    const { sb, cliente } = ambiente();
    const c = cliente();
    c.auth.getUser.mockResolvedValue({ data: { user: { email: 'bruna.demo@vertho.ai' } }, error: null });
    await entrarComOtpDemo(sb as any, c as any, 'bruna.demo@vertho.ai', '/dashboard');
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(sb.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('um OTP invalidado por emissão legada é substituído antes de repetir o consumo', async () => {
    const { sb, cliente, locks } = ambiente();
    const c = cliente();
    c.auth.verifyOtp.mockResolvedValueOnce({ error: { code: 'otp_expired', status: 403 } });
    await entrarComOtpDemo(sb as any, c as any, 'bruna.demo@vertho.ai', '/dashboard');
    expect(c.auth.verifyOtp.mock.calls.map(([args]) => args.token_hash)).toEqual(['otp-1', 'otp-2']);
    expect(locks.size).toBe(0);
  });

  it('libera a reserva mesmo quando o provedor recusa a entrada', async () => {
    const { sb, cliente, locks } = ambiente();
    const c = cliente();
    c.auth.verifyOtp.mockResolvedValue({ error: { code: 'user_banned', status: 403 } });
    await expect(entrarComOtpDemo(sb as any, c as any, 'bruna.demo@vertho.ai', '/dashboard')).rejects.toThrow('concluir');
    expect(c.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(locks.size).toBe(0);
  });

  it('falha no serviço de exclusão não executa a autenticação desprotegida', async () => {
    const executar = vi.fn();
    const sb = { rpc: vi.fn(async () => ({ error: { code: 'DB_DOWN' } })) };
    await expect(comLockDeLoginDemo(sb as any, 'bruna.demo@vertho.ai', executar)).rejects.toThrow('Reservar entrada');
    expect(executar).not.toHaveBeenCalled();
  });
});
