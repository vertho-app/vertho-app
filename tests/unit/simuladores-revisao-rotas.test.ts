import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

/**
 * Rotas da revisão humana (18/09/2026): `POST /api/simulador-vendas/gestao` e
 * `POST /api/simulador-lideranca/equipe`. Quem revisa é gestor ou RH, que NÃO
 * treinam: o contexto do vendas tem que ser o de leitura (o de escrita recusa
 * quem só acompanha). Contexto real; só banco, sessão, CSRF, limite e a
 * gravação são trocados.
 */
let sb: SupabaseMock;
const m = vi.hoisted(() => ({
  auth: null as any,
  csrf: null as Response | null,
  revisarTreino: null as any,
  revisarJornada: null as any,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: vi.fn(async () => m.auth) }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: vi.fn(() => m.csrf) }));
vi.mock('@/lib/rate-limit', () => ({ readLimiter: { check: vi.fn(async () => null) } }));
vi.mock('@/lib/prontidao-lideranca/habilitado', () => ({ prontidaoLiderancaHabilitada: vi.fn(async () => true) }));
vi.mock('@/lib/simulador-vendas/equipe', async (original) => ({
  ...(await original<typeof import('@/lib/simulador-vendas/equipe')>()),
  revisarTreino: (...args: unknown[]) => m.revisarTreino(...args),
}));
vi.mock('@/lib/simulador-lideranca/equipe', async (original) => ({
  ...(await original<typeof import('@/lib/simulador-lideranca/equipe')>()),
  revisarJornada: (...args: unknown[]) => m.revisarJornada(...args),
}));
import { POST as postVendas } from '@/app/api/simulador-vendas/gestao/route';
import { POST as postLideranca } from '@/app/api/simulador-lideranca/equipe/route';

const EMP = '10000000-0000-4000-8000-000000000001';
const corpo = (extra: Record<string, unknown> = {}) => ({
  acao: 'revisar',
  requestId: '30000000-0000-4000-8000-000000000001',
  alvoId: '20000000-0000-4000-8000-000000000001',
  parecer: 'discordo',
  motivo: 'A nota de Analisar não considerou as perguntas de impacto.',
  dimensoes: ['A'],
  ...extra,
});
const pedido = (url: string, body: unknown) =>
  new Request(`https://app.vertho.ai${url}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const pessoa = (role: string) => ({
  email: `${role}@cliente.test`, role, isPlatformAdmin: false, empresaId: EMP,
  colaborador: { id: 'c-1', empresa_id: EMP, nome_completo: 'Gil', email: `${role}@cliente.test` },
});

beforeEach(() => {
  m.csrf = null;
  m.revisarTreino = vi.fn(async () => ({ ok: true }));
  m.revisarJornada = vi.fn(async () => ({ ok: true }));
  sb = criarSupabaseMock({
    resolver: (t) =>
      t === 'empresas'
        ? { id: EMP, nome: 'Fictícia', sys_config: {} }
        : t === 'sim_vendas_config'
          ? { habilitado: true, briefing: '', revisao: 1, periodo_inicio: '2020-01-01T00:00:00Z', periodo_fim: '2099-01-01T00:00:00Z' }
          : null,
  });
});

describe('POST /api/simulador-vendas/gestao (revisão)', () => {
  it.each(['gestor', 'rh'])('🔴 %s, que não treina, registra a revisão pelo contexto de leitura', async (role) => {
    m.auth = pessoa(role);
    const res = await postVendas(pedido('/api/simulador-vendas/gestao', corpo()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [ctx, cmd] = m.revisarTreino.mock.calls[0];
    expect(ctx).toMatchObject({ empresaId: EMP, soAcompanha: true, ownerKey: 'colab:c-1' });
    expect(cmd).toMatchObject({ parecer: 'discordo', dimensoes: ['A'] });
  });

  it('sem CSRF válido ou com corpo inválido, nada chega à gravação', async () => {
    m.auth = pessoa('gestor');
    m.csrf = new Response('{}', { status: 403 });
    expect((await postVendas(pedido('/api/simulador-vendas/gestao', corpo()))).status).toBe(403);
    m.csrf = null;
    for (const invalido of [corpo({ parecer: 'talvez' }), corpo({ motivo: '' }), 'não é json'])
      expect((await postVendas(pedido('/api/simulador-vendas/gestao', invalido))).status).toBe(400);
    expect(m.revisarTreino).not.toHaveBeenCalled();
  });
});

describe('POST /api/simulador-lideranca/equipe (revisão)', () => {
  it('RH registra a revisão da jornada', async () => {
    m.auth = pessoa('rh');
    const res = await postLideranca(pedido('/api/simulador-lideranca/equipe', corpo({ dimensoes: [] })));
    expect(res.status).toBe(200);
    const [ctx, cmd] = m.revisarJornada.mock.calls[0];
    expect(ctx).toMatchObject({ empresaId: EMP });
    expect(cmd).toMatchObject({ alvoId: '20000000-0000-4000-8000-000000000001', parecer: 'discordo' });
  });

  it('sem CSRF válido, com corpo inválido ou por quem não acompanha, nada chega à gravação', async () => {
    m.auth = pessoa('rh');
    m.csrf = new Response('{}', { status: 403 });
    expect((await postLideranca(pedido('/api/simulador-lideranca/equipe', corpo()))).status).toBe(403);
    m.csrf = null;
    expect((await postLideranca(pedido('/api/simulador-lideranca/equipe', 'não é json'))).status).toBe(400);
    expect((await postLideranca(pedido('/api/simulador-lideranca/equipe', corpo({ extra: 1 })))).status).toBe(400);
    m.auth = pessoa('colaborador');
    expect((await postLideranca(pedido('/api/simulador-lideranca/equipe', corpo()))).status).toBe(403);
    expect(m.revisarJornada).not.toHaveBeenCalled();
  });
});
