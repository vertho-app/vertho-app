import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import { estadoMatriz } from '../fixtures/simulador-vendas-matriz';
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
  it('planejamento usa a mesma lease e o mesmo tenant, mascara dados pessoais e não chama IA', async () => {
    s = { ...estadoMatriz(), planejamento: undefined, mensagens: [] };
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
    const c = ctx(); c.auth.isPlatformAdmin = true;
    const cmd = { ...comando(), acao: 'planejar' as const, planejamento: 'Vou falar com pessoa@example.com sobre o plano.' };
    const result = await executar(c, cmd);
    expect(result.sessao.planejamento).not.toContain('pessoa@example.com');
    expect(result.sessao.dadosMascarados).toBe(true);
    const gravado = sb.client.rpc.mock.calls.find(([nome]) => nome === 'sim_vendas_commit')![1];
    expect(gravado).toMatchObject({ p_empresa: 'empresa-a', p_owner: 'colab:colab-a' });
    expect(gravado.p_estado.planejamento).toBe(result.sessao.planejamento);
    expect(vi.mocked(gerador).mock.results[0].value).not.toHaveBeenCalled();
  });
});

describe('quem só acompanha não treina (17/09/2026)', () => {
  beforeEach(() => { sb = criarSupabaseMock({ lista: () => [] }); });
  const vigente = { habilitado: true, periodo_inicio: '2026-01-01T00:00:00Z', periodo_fim: '2099-01-01T00:00:00Z' };

  it('gestor e RH recebem podeTreinar falso e a marca de acompanhamento, mesmo no prazo', async () => {
    const { consultar } = await import('@/lib/simulador-vendas/service');
    for (const role of ['gestor', 'rh']) {
      const c = { ...ctx(), auth: { isPlatformAdmin: false, role }, config: vigente, soAcompanha: true } as unknown as Contexto;
      expect(await consultar(c)).toMatchObject({ podeTreinar: false, soAcompanha: true });
    }
  });

  it('colaborador no prazo treina', async () => {
    const { consultar } = await import('@/lib/simulador-vendas/service');
    const c = { ...ctx(), auth: { isPlatformAdmin: false, role: 'colaborador' }, config: vigente, soAcompanha: false } as unknown as Contexto;
    expect(await consultar(c)).toMatchObject({ podeTreinar: true, soAcompanha: false });
  });
});
