/**
 * Revisão automática do commit de 05/10/2026: a proteção "link de admin só por
 * e-mail" nasceu sobre `isPlatformAdmin`, que é fail-open para este uso. O
 * supabase-js RETORNA `{ error }` em vez de lançar, `data` vem `null` e a função
 * devolvia `false`: com o banco instável, a conta de admin voltava a receber o
 * link no WhatsApp. `contaDeAdminOuIndeterminada` fecha nos três casos de dúvida.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let resposta: { data: any; error: any } = { data: null, error: null };
let lancar = false;
const eq = vi.fn();

function cadeia() {
  const c: any = {
    select: () => c,
    eq: (...a: any[]) => { eq(...a); return c; },
    limit: () => c,
    maybeSingle: async () => {
      if (lancar) throw new Error('connection reset');
      return resposta;
    },
  };
  return c;
}
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({ from: () => cadeia() }) }));

const { contaDeAdminOuIndeterminada } = await import('@/lib/auth/conta-privilegiada');

beforeEach(() => {
  resposta = { data: null, error: null };
  lancar = false;
  eq.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('contaDeAdminOuIndeterminada: "não sei" tem o efeito de "é admin"', () => {
  it('achou a linha em platform_admins: true', async () => {
    resposta = { data: { id: 'a1' }, error: null };
    expect(await contaDeAdminOuIndeterminada('admin@vertho.ai')).toBe(true);
  });

  it('consulta limpa e sem linha: false (a conta comum segue recebendo o WhatsApp)', async () => {
    expect(await contaDeAdminOuIndeterminada('ana@escola.br')).toBe(false);
  });

  it('🔴 a consulta RETORNA erro (o jeito normal do supabase-js falhar): true', async () => {
    resposta = { data: null, error: { message: 'timeout no pool' } };
    expect(await contaDeAdminOuIndeterminada('ana@escola.br')).toBe(true);
  });

  it('🔴 a consulta lança: true', async () => {
    lancar = true;
    expect(await contaDeAdminOuIndeterminada('ana@escola.br')).toBe(true);
  });

  it('consulta pelo e-mail em minúsculas e sem espaço nas pontas', async () => {
    await contaDeAdminOuIndeterminada('  Admin@Vertho.AI ');
    expect(eq).toHaveBeenCalledWith('email', 'admin@vertho.ai');
  });
});
