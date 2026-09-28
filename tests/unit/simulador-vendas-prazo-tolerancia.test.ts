/**
 * V-1 da revisão de 27/09/2026: a tolerância de 24 h para pedir a devolutiva
 * existia no servidor (`podeEncerrar`), mas a consulta que alimenta a tela só
 * devolvia `podeTreinar`, e o botão "Encerrar e receber devolutiva" usava esse
 * campo. Quem estava no meio da conversa quando o prazo venceu ficava com o
 * treino aberto e sem devolutiva, justamente o caso para o qual a tolerância
 * existe. Aqui a consulta é conferida nos três momentos (antes do vencimento,
 * dentro da tolerância e depois dela) e o encerramento passa pelo prazo na
 * tolerância. A tela é conferida em `scripts/verify-pace-ui.mjs`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import type { Contexto } from '@/lib/simulador-vendas/access';
import type { Estado } from '@/lib/simulador-vendas/schema';

let sb: SupabaseMock, s: Estado;
const SENTINELA = new Error('SENTINELA: chegou ao gerente');
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/simulador-vendas/ai', () => ({
  gerador: vi.fn(() =>
    vi.fn(async () => {
      throw SENTINELA;
    }),
  ),
  snapshotPrompts: vi.fn(),
}));
import { tenantDb } from '@/lib/tenant-db';
import { consultar, executar } from '@/lib/simulador-vendas/service';
import { TOLERANCIA_ENCERRAR_MS } from '@/lib/simulador-vendas/prazo';

const FIM = '2026-09-26T21:00:00.000Z';
const config = {
  habilitado: true,
  briefing: 'x'.repeat(50),
  revisao: 1,
  periodo_inicio: '2026-08-27T21:00:00.000Z',
  periodo_fim: FIM,
};
const ctx = (extra: Partial<Contexto> = {}) =>
  ({
    empresaId: 'empresa-a',
    empresaNome: 'Empresa A',
    colaboradorId: 'colab-a',
    ownerKey: 'colab:colab-a',
    soAcompanha: false,
    config,
    auth: { isPlatformAdmin: false, role: 'colaborador', email: 'a@x.com' },
    tdb: tenantDb('empresa-a'),
    ...extra,
  }) as unknown as Contexto;
const em = (ms: number) => vi.setSystemTime(new Date(Date.parse(FIM) + ms));
const HORA = 3_600_000;

describe('V-1: a tolerância de 24 h chega à tela', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    s = estado();
    s.status = 'em_andamento';
    s.mensagens = [
      { id: 'v1', turno: 1, autor: 'vendedor', texto: 'Olá, como posso ajudar?', fase: 'preparar' },
      { id: 'c1', turno: 1, autor: 'cliente', texto: 'Quero entender a proposta.', fase: 'preparar' },
    ];
    sb = criarSupabaseMock({
      resolver: () => ({ id: s.id, estado: s, revisao: s.revisao, lock_until: null, created_at: s.criadoEm }),
    });
  });
  afterEach(() => vi.useRealTimers());

  it('antes do vencimento: treina e encerra, sem aviso de tolerância', async () => {
    em(-HORA);
    const d = await consultar(ctx(), s.id);
    expect(d).toMatchObject({ podeTreinar: true, podeEncerrar: true });
    expect(d.prazo).toMatchObject({ vigente: true, encerrarAte: null });
  });

  it('dentro da tolerância: não treina, mas encerra, e a consulta diz até quando', async () => {
    em(HORA);
    const d = await consultar(ctx(), s.id);
    expect(d).toMatchObject({ podeTreinar: false, podeEncerrar: true });
    expect(d.prazo).toMatchObject({
      vigente: false,
      encerrarAte: new Date(Date.parse(FIM) + TOLERANCIA_ENCERRAR_MS).toISOString(),
    });
    expect(d.sessao?.status).toBe('em_andamento');
    // Recarregar é consultar de novo: o direito vem do servidor, não de estado da tela.
    expect(await consultar(ctx(), s.id)).toMatchObject({ podeEncerrar: true });
  });

  it('dentro da tolerância o servidor aceita o encerramento (passa do prazo e chega ao gerente)', async () => {
    em(HORA);
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
    await expect(
      executar(ctx(), {
        acao: 'encerrar',
        sessaoId: s.id,
        revisao: s.revisao,
        requestId: '20000000-0000-4000-8000-0000000000e1',
      }),
    ).rejects.toBe(SENTINELA);
    expect(sb.client.rpc.mock.calls.map((c: any[]) => c[0])).toContain('sim_vendas_claim');
  });

  it('depois da tolerância: nem treina nem encerra', async () => {
    em(TOLERANCIA_ENCERRAR_MS + HORA);
    const d = await consultar(ctx(), s.id);
    expect(d).toMatchObject({ podeTreinar: false, podeEncerrar: false });
    expect(d.prazo.encerrarAte).toBeNull();
  });

  it('quem só acompanha não ganha o encerramento na tolerância', async () => {
    em(HORA);
    const d = await consultar(ctx({ soAcompanha: true }), s.id);
    expect(d).toMatchObject({ podeTreinar: false, podeEncerrar: false });
  });
});
