import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * 🔴 CHAVE DE PLATAFORMA NÃO ENTRA PELO FORMULÁRIO DA EMPRESA.
 *
 * `salvarConfig` tem gate `settings.company.manage`, que o papel `rh` POSSUI, e
 * num 'use server' o payload é montado pelo CLIENTE — a tela carrega o
 * `sys_config` inteiro no state e devolve tudo. Sem esta trava, o RH grava
 * `modulos` (o que a empresa contratou) e `prontidao_lideranca` (o programa:
 * cargo-alvo, população, corte) pelo action id, mesmo com as actions próprias
 * delas exigindo `program.configure`. Porta da frente trancada, fundos aberta.
 *
 * O guard cobra a CLASSE: chave nova de contrato/programa entra em
 * `CHAVES_SO_PLATAFORMA` no mesmo commit que a cria.
 */
let sb = criarSupabaseMock();
const gate = vi.fn(async () => sb.client);

vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: (...a: any[]) => gate(...(a as [])),
  requireAdminSupabase: vi.fn(),
}));
// Quem pede: `podeConfigurarPrograma` lê a sessão e a permissão `program.configure`.
const sessao = vi.hoisted(() => ({ ctx: { isPlatformAdmin: false, role: 'rh' } as any, perms: new Set<string>() }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: vi.fn(async () => 'rh@cliente.com'),
  requireUserAction: vi.fn(async () => sessao.ctx),
}));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async (_ctx: any, p: string) => sessao.perms.has(p)) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ validarModelosDoSysConfig: vi.fn(async () => []) }));
vi.mock('next/cache', () => ({ updateTag: vi.fn(), unstable_cache: (fn: any) => fn, revalidateTag: vi.fn() }));
vi.mock('@/lib/vercel-domain', () => ({ addVercelDomain: vi.fn(), removeVercelDomain: vi.fn() }));

import { salvarConfig } from '@/app/admin/empresas/[empresaId]/configuracoes/actions';
import { CHAVES_SO_PLATAFORMA } from '@/lib/sys-config-plataforma';

const gravadoNoBanco = (valor: any) => criarSupabaseMock({ resolver: (t) => (t === 'empresas' ? { sys_config: valor } : null) });
const payloadSalvo = () => sb.escritas.find((e) => e.tabela === 'empresas' && e.op === 'update')?.payload?.sys_config;

describe('salvarConfig — chaves só-plataforma', () => {
  beforeEach(() => {
    gate.mockClear();
    sessao.ctx = { isPlatformAdmin: false, role: 'rh' };
    sessao.perms = new Set();
  });

  it('a lista cobre contrato E programa', () => {
    expect([...CHAVES_SO_PLATAFORMA]).toEqual([
      'modulos', 'prontidao_lideranca', 'simuladores_por_cargo',
      'programa_modo', 'programa_custom', 'competencias_onboarding',
    ]);
  });

  it('preserva o que está GRAVADO e ignora o que o cliente mandou', async () => {
    sb = gravadoNoBanco({
      modulos: { prontidao_lideranca: true, pulso: false },
      prontidao_lideranca: { cargo_alvo: 'Gerente Comercial', corte_nota: 3 },
      cadencia: { dia: 'segunda' },
      simuladores_por_cargo: { consultor: { vendas: false } },
    });
    await salvarConfig('emp-A', {
      modulos: { prontidao_lideranca: true, pulso: true },                       // tentou contratar o Pulso
      prontidao_lideranca: { cargo_alvo: 'Estagiário', corte_nota: 4 },          // tentou reescrever o programa
      cadencia: { dia: 'quinta' },                                               // isto é operação: passa
      simuladores_por_cargo: { consultor: { vendas: true } },
    });
    expect(payloadSalvo()).toEqual({
      modulos: { prontidao_lideranca: true, pulso: false },
      prontidao_lideranca: { cargo_alvo: 'Gerente Comercial', corte_nota: 3 },
      cadencia: { dia: 'quinta' },
      simuladores_por_cargo: { consultor: { vendas: false } },
    });
  });

  it('chave ausente no banco é REMOVIDA do payload — não nasce pelo formulário', async () => {
    sb = gravadoNoBanco({ ai: { modelo_padrao: 'claude-sonnet-4-6' } });
    await salvarConfig('emp-A', {
      ai: { modelo_padrao: 'claude-sonnet-4-6' },
      modulos: { prontidao_lideranca: true },
      prontidao_lideranca: { cargo_alvo: 'Qualquer' },
    });
    expect(payloadSalvo()).toEqual({ ai: { modelo_padrao: 'claude-sonnet-4-6' } });
  });

  it('falha ao ler o estado atual não grava nada (senão o merge apagaria o contrato)', async () => {
    sb = gravadoNoBanco({ modulos: { pulso: true } });
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout' });
    const r: any = await salvarConfig('emp-A', { modulos: {} });
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });
});

/**
 * R-73 (revisão de 02/10/2026): `programa_modo`, `programa_custom` e
 * `competencias_onboarding` entravam pelo formulário sem validação e sem
 * estar na lista. Um modo desconhecido caía calado no DUO na próxima trilha.
 * Agora são só-plataforma: passam pelo formulário apenas com
 * `program.configure` (master) e com valor válido.
 */
describe('salvarConfig: chaves de PROGRAMA (R-73)', () => {
  const GRAVADO = { programa_modo: 'jornada', programa_custom: { semanas: 2, numCompetencias: 1, fechamento: true }, cadencia: { dia: 'segunda' } };
  // O update da trava otimista precisa "casar" a linha para a gravação contar como feita.
  const gravadoQueAceita = (valor: any) => criarSupabaseMock({
    resolver: (t) => (t === 'empresas' ? { sys_config: valor } : null),
    escrita: () => [{ id: 'emp-A' }],
  });
  const master = () => {
    sessao.ctx = { isPlatformAdmin: true, platformAdminRole: 'master', role: 'colaborador' };
    sessao.perms = new Set(['program.configure', 'settings.company.manage']);
  };

  beforeEach(() => {
    gate.mockClear();
    sessao.ctx = { isPlatformAdmin: false, role: 'rh' };
    sessao.perms = new Set(['settings.company.manage']);
  });

  it('🔴 sem `program.configure` (RH, Sócio) o programa gravado não muda', async () => {
    sb = gravadoNoBanco(GRAVADO);
    await salvarConfig('emp-A', {
      programa_modo: 'regular_duo',
      programa_custom: { semanas: 4, numCompetencias: 2, fechamento: false },
      competencias_onboarding: ['Liderança'],
      cadencia: { dia: 'quinta' },
    });
    expect(payloadSalvo()).toEqual({ ...GRAVADO, cadencia: { dia: 'quinta' } });
  });

  it('o mesmo vale para o Admin Sócio (plataforma sem a chave)', async () => {
    sessao.ctx = { isPlatformAdmin: true, platformAdminRole: 'socio', role: 'colaborador' };
    sb = gravadoNoBanco(GRAVADO);
    await salvarConfig('emp-A', { ...GRAVADO, programa_modo: 'onboarding' });
    expect(payloadSalvo().programa_modo).toBe('jornada');
  });

  it('master com `program.configure` troca o programa por um valor VÁLIDO', async () => {
    master();
    sb = gravadoQueAceita(GRAVADO);
    const r: any = await salvarConfig('emp-A', { ...GRAVADO, programa_modo: 'custom', programa_custom: { semanas: 6, numCompetencias: 2, fechamento: false } });
    expect(r.success).toBe(true);
    expect(payloadSalvo()).toMatchObject({ programa_modo: 'custom', programa_custom: { semanas: 6, numCompetencias: 2, fechamento: false } });
  });

  it.each([
    [{ programa_modo: 'regular' }, /Programa inválido/],
    [{ programa_modo: 'quatorze_semanas' }, /Programa inválido/],
    [{ programa_custom: { semanas: 7, numCompetencias: 1 } }, /personalizado inválido/],
    [{ programa_custom: 'texto' }, /personalizado inválido/],
    [{ competencias_onboarding: 'Liderança' }, /Onboarding inválidas/],
    [{ competencias_onboarding: ['', 'Comunicação'] }, /Onboarding inválidas/],
  ])('🔴 master com valor INVÁLIDO %j: recusa e não grava nada', async (mudanca, erro) => {
    master();
    sb = gravadoNoBanco(GRAVADO);
    const r: any = await salvarConfig('emp-A', { ...GRAVADO, ...mudanca });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(erro);
    expect(sb.escritas).toHaveLength(0);
  });

  it('valor antigo inválido que NÃO mudou não trava o salvamento de outra aba', async () => {
    master();
    sb = gravadoQueAceita({ ...GRAVADO, programa_modo: 'regular' });
    const r: any = await salvarConfig('emp-A', { ...GRAVADO, programa_modo: 'regular', cadencia: { dia: 'sexta' } });
    expect(r.success).toBe(true);
    expect(payloadSalvo()).toMatchObject({ programa_modo: 'regular', cadencia: { dia: 'sexta' } });
  });

  it('master também não grava pelo formulário as chaves de contrato (têm action própria)', async () => {
    master();
    sb = gravadoNoBanco({ modulos: { pulso: false } });
    await salvarConfig('emp-A', { modulos: { pulso: true } });
    expect(payloadSalvo()).toEqual({ modulos: { pulso: false } });
  });
});
