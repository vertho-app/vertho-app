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
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'rh@cliente.com') }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ validarModelosDoSysConfig: vi.fn(async () => []) }));
vi.mock('next/cache', () => ({ updateTag: vi.fn(), unstable_cache: (fn: any) => fn, revalidateTag: vi.fn() }));
vi.mock('@/lib/vercel-domain', () => ({ addVercelDomain: vi.fn(), removeVercelDomain: vi.fn() }));

import { salvarConfig } from '@/app/admin/empresas/[empresaId]/configuracoes/actions';
import { CHAVES_SO_PLATAFORMA } from '@/lib/sys-config-plataforma';

const gravadoNoBanco = (valor: any) => criarSupabaseMock({ resolver: (t) => (t === 'empresas' ? { sys_config: valor } : null) });
const payloadSalvo = () => sb.escritas.find((e) => e.tabela === 'empresas' && e.op === 'update')?.payload?.sys_config;

describe('salvarConfig — chaves só-plataforma', () => {
  beforeEach(() => { gate.mockClear(); });

  it('a lista cobre contrato E programa', () => {
    expect([...CHAVES_SO_PLATAFORMA]).toEqual(['modulos', 'prontidao_lideranca', 'simuladores_por_cargo']);
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
