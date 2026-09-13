import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import type { Contexto } from '@/lib/simulador-vendas/access';
import type { Estado } from '@/lib/simulador-vendas/schema';
let sb: SupabaseMock, s: Estado;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/simulador-vendas/ai', () => ({ gerador: vi.fn(() => vi.fn()), snapshotPrompts: vi.fn() }));
import { tenantDb } from '@/lib/tenant-db';
import { executar } from '@/lib/simulador-vendas/service';
import { gerador } from '@/lib/simulador-vendas/ai';
const ctx = () => ({ empresaId: 'empresa-a', colaboradorId: 'colab-a', ownerKey: 'colab:colab-a', auth: { isPlatformAdmin: false }, tdb: tenantDb('empresa-a') }) as Contexto;
const comando = () => ({ acao: 'abandonar' as const, sessaoId: s.id, revisao: s.revisao, requestId: '20000000-0000-4000-8000-000000000002' });
describe('persistência de comandos PACE', () => {
  beforeEach(() => { s = estado(); sb = criarSupabaseMock({ resolver: () => ({ id: s.id, estado: s, revisao: s.revisao, lock_until: null }) }); vi.mocked(gerador).mockClear(); });
  it('outra lease impede toda geração e escrita', async () => {
    sb.client.rpc.mockResolvedValue({ data: false, error: null });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({ status: 409 });
    expect(gerador).not.toHaveBeenCalled(); expect(sb.escritas).toHaveLength(0);
    expect(sb.client.rpc).toHaveBeenCalledWith('sim_vendas_claim', expect.objectContaining({ p_empresa: 'empresa-a', p_owner: 'colab:colab-a', p_id: s.id, p_revisao: s.revisao }));
  });
  it('claim e commit compartilham token/revisão/tenant; a liberação só atinge o próprio token', async () => {
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
    const result = await executar(ctx(), comando());
    expect(result.sessao.status).toBe('abandonada');
    const claimArgs = sb.client.rpc.mock.calls[0][1], commitArgs = sb.client.rpc.mock.calls[1][1];
    expect(commitArgs).toMatchObject(claimArgs); expect(commitArgs.p_estado.revisao).toBe(s.revisao + 1);
    expect(sb.chamadas).toContainEqual({ tabela: 'sim_vendas_sessoes', metodo: 'eq', args: ['lock_token', claimArgs.p_token] });
    expect(sb.chamadas).toContainEqual({ tabela: 'sim_vendas_sessoes', metodo: 'eq', args: ['empresa_id', 'empresa-a'] });
  });
  it('commit recusado não entrega sucesso ao usuário e tenta liberar só sua lease', async () => {
    sb.client.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({ status: 409 });
    expect(sb.escritas.at(-1)?.payload).toEqual({ lock_token: null, lock_until: null });
  });
  it('erro de leitura não vira sessão ausente nem autoriza comando', async () => {
    sb.falharEm({ tabela: 'sim_vendas_sessoes', op: 'select', mensagem: 'timeout' });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({ status: 503 });
    expect(sb.client.rpc).not.toHaveBeenCalled(); expect(gerador).not.toHaveBeenCalled();
  });
});
