import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import { estadoMatriz } from '../fixtures/simulador-vendas-matriz';
import type { Contexto } from '@/lib/simulador-vendas/access';
import type { Estado } from '@/lib/simulador-vendas/schema';
let sb: SupabaseMock, s: Estado;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/simulador-vendas/ai', () => ({
  gerador: vi.fn(() => vi.fn()),
  snapshotPrompts: vi.fn(),
}));
import { tenantDb } from '@/lib/tenant-db';
import { executar } from '@/lib/simulador-vendas/service';
import { gerador } from '@/lib/simulador-vendas/ai';
const ctx = () =>
  ({
    empresaId: 'empresa-a',
    colaboradorId: 'colab-a',
    ownerKey: 'colab:colab-a',
    auth: { isPlatformAdmin: false },
    tdb: tenantDb('empresa-a'),
  }) as Contexto;
const comando = () => ({
  acao: 'abandonar' as const,
  sessaoId: s.id,
  revisao: s.revisao,
  requestId: '20000000-0000-4000-8000-000000000002',
});
describe('persistência de comandos PACE', () => {
  beforeEach(() => {
    s = estado();
    sb = criarSupabaseMock({
      resolver: () => ({
        id: s.id,
        estado: s,
        revisao: s.revisao,
        lock_until: null,
      }),
    });
    vi.mocked(gerador).mockClear();
  });
  it('outra lease impede toda geração e escrita', async () => {
    sb.client.rpc.mockResolvedValue({ data: false, error: null });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({
      status: 409,
    });
    expect(gerador).not.toHaveBeenCalled();
    expect(sb.escritas).toHaveLength(0);
    expect(sb.client.rpc).toHaveBeenCalledWith(
      'sim_vendas_claim',
      expect.objectContaining({
        p_empresa: 'empresa-a',
        p_owner: 'colab:colab-a',
        p_id: s.id,
        p_revisao: s.revisao,
      }),
    );
  });
  it('claim e commit compartilham token/revisão/tenant; a liberação só atinge o próprio token', async () => {
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
    const result = await executar(ctx(), comando());
    expect(result.sessao.status).toBe('abandonada');
    const claimArgs = sb.client.rpc.mock.calls[0][1],
      commitArgs = sb.client.rpc.mock.calls[1][1];
    expect(commitArgs).toMatchObject(claimArgs);
    expect(commitArgs.p_estado.revisao).toBe(s.revisao + 1);
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'eq',
      args: ['lock_token', claimArgs.p_token],
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'eq',
      args: ['empresa_id', 'empresa-a'],
    });
  });
  it('commit recusado não entrega sucesso ao usuário e tenta liberar só sua lease', async () => {
    sb.client.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({
      status: 409,
    });
    expect(sb.escritas.at(-1)?.payload).toEqual({
      lock_token: null,
      lock_until: null,
    });
  });
  it('descartar: o participante só desiste de treino SEM fala dele; com conversa, conclui (18/09/2026)', async () => {
    s = { ...estadoMatriz(), status: 'em_andamento' } as Estado;
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({
      status: 409,
    });
    expect(sb.client.rpc).not.toHaveBeenCalled();
    expect(sb.escritas).toHaveLength(0);
    // Sem fala do vendedor (cenário que não serviu), o descarte vale.
    s = { ...estadoMatriz(), status: 'em_andamento', mensagens: [] } as Estado;
    const r = await executar(ctx(), comando());
    expect(r.sessao.status).toBe('abandonada');
  });
  it('erro de leitura não vira sessão ausente nem autoriza comando', async () => {
    sb.falharEm({
      tabela: 'sim_vendas_sessoes',
      op: 'select',
      mensagem: 'timeout',
    });
    await expect(executar(ctx(), comando())).rejects.toMatchObject({
      status: 503,
    });
    expect(sb.client.rpc).not.toHaveBeenCalled();
    expect(gerador).not.toHaveBeenCalled();
  });
  it('planejamento usa a mesma lease e o mesmo tenant, mascara dados pessoais e não chama IA', async () => {
    s = { ...estadoMatriz(), planejamento: undefined, mensagens: [] };
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
    const c = ctx();
    c.auth.isPlatformAdmin = true;
    const cmd = {
      ...comando(),
      acao: 'planejar' as const,
      planejamento: 'Vou falar com pessoa@example.com sobre o plano.',
    };
    const result = await executar(c, cmd);
    expect(result.sessao.planejamento).not.toContain('pessoa@example.com');
    expect(result.sessao.dadosMascarados).toBe(true);
    const gravado = sb.client.rpc.mock.calls.find(
      ([nome]) => nome === 'sim_vendas_commit',
    )![1];
    expect(gravado).toMatchObject({
      p_empresa: 'empresa-a',
      p_owner: 'colab:colab-a',
    });
    expect(gravado.p_estado.planejamento).toBe(result.sessao.planejamento);
    expect(vi.mocked(gerador).mock.results[0].value).not.toHaveBeenCalled();
  });
});

describe('quem só acompanha não treina (17/09/2026)', () => {
  beforeEach(() => {
    sb = criarSupabaseMock({ lista: () => [] });
  });
  const vigente = {
    habilitado: true,
    periodo_inicio: '2026-01-01T00:00:00Z',
    periodo_fim: '2099-01-01T00:00:00Z',
  };

  it('gestor e RH recebem podeTreinar falso e a marca de acompanhamento, mesmo no prazo', async () => {
    const { consultar } = await import('@/lib/simulador-vendas/service');
    for (const role of ['gestor', 'rh']) {
      const c = {
        ...ctx(),
        auth: { isPlatformAdmin: false, role },
        config: vigente,
        soAcompanha: true,
      } as unknown as Contexto;
      expect(await consultar(c)).toMatchObject({
        podeTreinar: false,
        soAcompanha: true,
      });
    }
  });

  it('colaborador no prazo treina', async () => {
    const { consultar } = await import('@/lib/simulador-vendas/service');
    const c = {
      ...ctx(),
      auth: { isPlatformAdmin: false, role: 'colaborador' },
      config: vigente,
      soAcompanha: false,
    } as unknown as Contexto;
    expect(await consultar(c)).toMatchObject({
      podeTreinar: true,
      soAcompanha: false,
    });
  });
});

describe('evolução independente da paginação do histórico', () => {
  it('inclui o melhor resultado antigo e percorre mais de 500 sessões com cursor', async () => {
    const { consultarEvolucao } =
      await import('@/lib/simulador-vendas/service');
    const linhas = Array.from({ length: 502 }, (_, i) => ({
      id: '20000000-0000-4000-8000-' + String(100000000000 + i),
      created_at: new Date(Date.UTC(2026, 8, 19) - i * 86400000).toISOString(),
      resumo: {
        status: 'concluida',
        versaoRegua: 'pace-7',
        temRelatorio: true,
      },
      liberado: 4,
      pl: i === 501 ? 4 : 2,
      p: 2,
      a: null,
      c: null,
      e: null,
      foco: 'Escutar',
    }));
    sb = criarSupabaseMock({
      lista: (_t, _c, chain) =>
        chain.some((c) => c.metodo === 'or')
          ? linhas.slice(500)
          : linhas.slice(0, 501),
    });
    const r = await consultarEvolucao(ctx());
    expect(r.evolucao?.find((c) => c.codigo === 'PL')?.nivelAlcancado).toBe(4);
    expect(r.focoSugerido).toBe('Escutar');
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'eq',
      args: ['owner_key', 'colab:colab-a'],
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'not',
      args: ['estado->feedback->>realismo', 'is', null],
    });
  });
  it('não publica notas antes da pesquisa, nem notas de réguas antigas', async () => {
    const { consultarEvolucao } =
      await import('@/lib/simulador-vendas/service');
    sb = criarSupabaseMock({
      lista: () => [
        {
          id: 'x',
          created_at: '2026-09-19',
          resumo: { status: 'concluida', versaoRegua: 'pace-7' },
          liberado: null,
          pl: 4,
        },
        {
          id: 'y',
          created_at: '2026-09-18',
          resumo: { status: 'concluida', versaoRegua: 'pace-5' },
          liberado: 5,
          pl: 10,
        },
      ],
    });
    expect((await consultarEvolucao(ctx())).evolucao).toBeNull();
    sb.falharEm({
      tabela: 'sim_vendas_sessoes',
      op: 'select',
      mensagem: 'timeout',
    });
    await expect(consultarEvolucao(ctx())).rejects.toMatchObject({
      status: 503,
    });
  });
});
