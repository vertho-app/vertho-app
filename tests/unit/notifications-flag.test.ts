// Flag de push por empresa (lib/notifications/flag.ts).
//
// A invariante que importa é o FAIL-CLOSED: em erro de leitura o convite NÃO
// aparece. É o oposto do `envio-guard` (que falha aberto para não derrubar envio
// real), e a assimetria é proposital — falhar aberto aqui exibiria convite de
// notificação em tenants que nunca pediram, inclusive os reais.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resposta: null as any }));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => mocks.resposta,
        }),
      }),
    }),
  }),
}));

const { pushHabilitado, resetPushFlagCache } = await import('@/lib/notifications/flag');

describe('pushHabilitado', () => {
  beforeEach(() => {
    resetPushFlagCache();
    mocks.resposta = { data: null, error: null };
  });

  it('flag ligada → true', async () => {
    mocks.resposta = { data: { sys_config: { notificacoes_push: true } }, error: null };
    expect(await pushHabilitado('emp-1')).toBe(true);
  });

  it('flag ausente → false', async () => {
    mocks.resposta = { data: { sys_config: { outra_coisa: true } }, error: null };
    expect(await pushHabilitado('emp-1')).toBe(false);
  });

  it('sys_config nulo → false', async () => {
    mocks.resposta = { data: { sys_config: null }, error: null };
    expect(await pushHabilitado('emp-1')).toBe(false);
  });

  it('erro de leitura → false (FAIL-CLOSED)', async () => {
    // supabase-js RETORNA `{ error }` em vez de lançar: sem checar o retorno,
    // `data` viria undefined e o resultado seria false por acidente, não por
    // decisão — e um refactor que mude o formato quebraria isso em silêncio.
    mocks.resposta = { data: { sys_config: { notificacoes_push: true } }, error: { message: 'conexão caiu' } };
    expect(await pushHabilitado('emp-1')).toBe(false);
  });

  it('empresaId ausente → false, sem consultar o banco', async () => {
    mocks.resposta = { data: { sys_config: { notificacoes_push: true } }, error: null };
    expect(await pushHabilitado(null)).toBe(false);
    expect(await pushHabilitado(undefined)).toBe(false);
    expect(await pushHabilitado('')).toBe(false);
  });
});
