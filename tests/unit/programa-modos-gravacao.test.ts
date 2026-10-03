import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Gravação NOVA de formato de programa (decisão do dono, 03/10/2026): só
 * Jornada, Onboarding e Personalizado. Regular (DUO e single) e Piloto saíram
 * da escolha, mas seguem LIDOS: quem já está gravado neles não pode ter o
 * salvamento de outra aba travado, nem ver a tela trocar o valor sozinha.
 *
 * Três portas gravam o formato, e as três passam pela mesma régua
 * (`problemaNaChaveDePrograma`):
 *   - `salvarConfig` (aba Programa da empresa; valida só o que MUDOU);
 *   - `atualizarProgramaModo` (override por colaborador);
 *   - `criarTurma` / `editarTurma` (formato da safra, que VENCE o da empresa).
 *
 * Validado por mutação: pôr 'piloto' de volta em `MODOS_OFERECIDOS` derruba os
 * casos de recusa das três portas.
 */
let sb = criarSupabaseMock();
const gate = vi.fn(async () => sb.client);

vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: (...a: any[]) => gate(...(a as [])),
  requireAdminSupabase: vi.fn(async () => sb.client),
}));
const sessao = vi.hoisted(() => ({ ctx: { isPlatformAdmin: true, platformAdminRole: 'master', role: 'colaborador' } as any, perms: new Set<string>() }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: vi.fn(async () => 'master@vertho.ai'),
  requireUserAction: vi.fn(async () => sessao.ctx),
  requireAdminAction: vi.fn(async () => ({ ...sessao.ctx, email: 'master@vertho.ai' })),
  assertTenantAccessAction: vi.fn(async () => {}),
}));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async (_ctx: any, p: string) => sessao.perms.has(p)) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ validarModelosDoSysConfig: vi.fn(async () => []) }));
vi.mock('next/cache', () => ({ updateTag: vi.fn(), unstable_cache: (fn: any) => fn, revalidateTag: vi.fn() }));
vi.mock('@/lib/vercel-domain', () => ({ addVercelDomain: vi.fn(), removeVercelDomain: vi.fn() }));

import { salvarConfig, atualizarProgramaModo } from '@/app/admin/empresas/[empresaId]/configuracoes/actions';
import { criarTurma, editarTurma } from '@/actions/turmas';
import { problemaNaChaveDePrograma } from '@/lib/sys-config-plataforma';

const DESCONTINUADOS = ['regular_duo', 'regular_single', 'piloto', 'regular'];
const OFERECIDOS = ['jornada', 'onboarding', 'custom'];

const gravadoQueAceita = (valor: any) => criarSupabaseMock({
  resolver: (t) => (t === 'empresas' ? { sys_config: valor } : null),
  escrita: () => [{ id: 'emp-A' }],
});
const payloadEmpresa = () => sb.escritas.find((e) => e.tabela === 'empresas' && e.op === 'update')?.payload?.sys_config;

beforeEach(() => {
  gate.mockClear();
  sessao.ctx = { isPlatformAdmin: true, platformAdminRole: 'master', role: 'colaborador' };
  sessao.perms = new Set(['program.configure', 'settings.company.manage']);
});

describe('a régua (problemaNaChaveDePrograma)', () => {
  it.each(OFERECIDOS)('%s: aceito', (modo) => {
    expect(problemaNaChaveDePrograma('programa_modo', modo)).toBeNull();
  });

  it.each(DESCONTINUADOS)('%s: recusado como descontinuado, dizendo o que usar', (modo) => {
    const p = problemaNaChaveDePrograma('programa_modo', modo);
    expect(p).toMatch(/descontinuado/);
    expect(p).toContain('jornada, onboarding, custom');
  });

  it('desconhecido: recusado (não cai calado em formato nenhum)', () => {
    expect(problemaNaChaveDePrograma('programa_modo', 'quatorze')).toMatch(/Programa inválido/);
  });

  it('ausente é aceitável: a empresa herda o padrão do motor (Jornada)', () => {
    expect(problemaNaChaveDePrograma('programa_modo', undefined)).toBeNull();
  });

  it('Personalizado: 1 a 6 semanas, 1 ou 2 competências', () => {
    expect(problemaNaChaveDePrograma('programa_custom', { semanas: 6, numCompetencias: 2, fechamento: true })).toBeNull();
    expect(problemaNaChaveDePrograma('programa_custom', { semanas: 7, numCompetencias: 1, fechamento: false })).toMatch(/semanas de 1 a 6/);
    expect(problemaNaChaveDePrograma('programa_custom', { semanas: 3, numCompetencias: 3, fechamento: false })).toMatch(/competências de 1 a 2/);
  });
});

describe('salvarConfig (aba Programa da empresa)', () => {
  it.each(['regular_duo', 'regular_single', 'piloto'])('🔴 recusa trocar PARA %s e não grava nada', async (modo) => {
    sb = gravadoQueAceita({ programa_modo: 'jornada' });
    const r: any = await salvarConfig('emp-A', { programa_modo: modo });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/descontinuado/);
    expect(sb.escritas).toHaveLength(0);
  });

  it('quem já está num descontinuado salva OUTRA aba sem trocar o formato (elo: piloto)', async () => {
    sb = gravadoQueAceita({ programa_modo: 'piloto', cadencia: { dia: 'segunda' } });
    const r: any = await salvarConfig('emp-A', { programa_modo: 'piloto', cadencia: { dia: 'quinta' } });
    expect(r.success).toBe(true);
    expect(payloadEmpresa()).toEqual({ programa_modo: 'piloto', cadencia: { dia: 'quinta' } });
  });

  it("idem para a grafia antiga 'regular' (gruposinal)", async () => {
    sb = gravadoQueAceita({ programa_modo: 'regular' });
    const r: any = await salvarConfig('emp-A', { programa_modo: 'regular', envios: { email_alias: 'x' } });
    expect(r.success).toBe(true);
    expect(payloadEmpresa().programa_modo).toBe('regular');
  });

  it('sair de um descontinuado para um oferecido é permitido', async () => {
    sb = gravadoQueAceita({ programa_modo: 'piloto' });
    const r: any = await salvarConfig('emp-A', { programa_modo: 'jornada' });
    expect(r.success).toBe(true);
    expect(payloadEmpresa().programa_modo).toBe('jornada');
  });

  it('a config da unianchieta (1 semana, sem fechamento, 1 competência) segue válida', async () => {
    sb = gravadoQueAceita({ programa_modo: 'jornada' });
    const r: any = await salvarConfig('emp-A', {
      programa_modo: 'custom', programa_custom: { semanas: 1, fechamento: false, numCompetencias: 1 },
    });
    expect(r.success).toBe(true);
  });
});

describe('atualizarProgramaModo (override por colaborador)', () => {
  const colabQueAceita = () => criarSupabaseMock({
    escritaUnica: () => ({ empresa_id: 'emp-A', nome_completo: 'Pessoa' }),
  });

  it.each(['regular_duo', 'regular_single', 'piloto'])('🔴 recusa gravar %s e não escreve', async (modo) => {
    sb = colabQueAceita();
    const r: any = await atualizarProgramaModo('colab-1', modo, 'emp-A');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/descontinuado/);
    expect(sb.escritas).toHaveLength(0);
  });

  it.each([...OFERECIDOS, ''])('aceita "%s" (vazio = herdar da empresa)', async (modo) => {
    sb = colabQueAceita();
    const r: any = await atualizarProgramaModo('colab-1', modo, 'emp-A');
    expect(r.success).toBe(true);
    expect(sb.escritas[0]?.payload).toEqual({ programa_modo: modo || null });
  });
});

describe('criarTurma / editarTurma (formato da safra)', () => {
  it.each(['regular_duo', 'regular_single', 'piloto'])('🔴 criar com %s: recusado, nada gravado', async (modo) => {
    sb = criarSupabaseMock();
    const r: any = await criarTurma({ empresaId: 'emp-A', nome: 'Safra 2026.2', sysConfig: { programa_modo: modo } });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/descontinuado/);
    expect(sb.escritas).toHaveLength(0);
  });

  it('🔴 editar para piloto: recusado, nada gravado', async () => {
    sb = criarSupabaseMock();
    const r: any = await editarTurma({ empresaId: 'emp-A', turmaId: 't-1', sysConfig: { programa_modo: 'piloto' } });
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('criar com custom ou herdando (sysConfig vazio) passa', async () => {
    sb = criarSupabaseMock({ escritaUnica: () => ({ id: 't-1', nome: 'Safra' }) });
    expect((await criarTurma({ empresaId: 'emp-A', nome: 'Safra', sysConfig: { programa_modo: 'custom' } }) as any).success).toBe(true);
    expect((await criarTurma({ empresaId: 'emp-A', nome: 'Safra', sysConfig: {} }) as any).success).toBe(true);
  });
});
