import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { readIpiData } from '@/lib/ipi/data';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import type { PermissionKey } from '@/lib/permissions';
import type { IpiPlan } from '@/lib/ipi/contracts';

const shared = vi.hoisted(() => ({ sb: null as any }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => shared.sb.client }));
const auth = { email: 'analista@vertho.ai', isPlatformAdmin: true } as AuthenticatedContext;
const permissions = new Set<PermissionKey>(['admin.access', 'companies.view', 'users.view', 'reports.aggregate.view', 'reports.individual.view']);
const companyId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const plan = (data: IpiPlan['data'], person = ''): IpiPlan => ({ searches: [], data, person });

describe('Ipi — consultas fechadas e isoladas', () => {
  beforeEach(() => {
    shared.sb = criarSupabaseMock({ resolver: table => table === 'empresas' ? { id: companyId, nome: 'Empresa de teste' } : null, lista: () => [], contagem: () => 0 });
  });
  it('não consulta banco para pergunta de manual nem sem empresa selecionada', async () => {
    await readIpiData(auth, permissions, companyId, plan([]));
    const result = await readIpiData(auth, permissions, null, plan(['resumo']));
    expect(result[0].text).toContain('Nenhuma consulta');
    expect(shared.sb.chamadas).toHaveLength(0);
  });
  it('revalida o acesso na entrada da leitura', async () => {
    await expect(readIpiData({ ...auth, email: 'pessoa@cliente.com' }, permissions, companyId, plan(['resumo']))).rejects.toThrow('IPI_FORBIDDEN');
    expect(shared.sb.chamadas).toHaveLength(0);
  });
  it('filtra TODA leitura de tenant e não grava nada', async () => {
    await readIpiData(auth, permissions, companyId, plan(['resumo', 'colaboradores', 'competencias']));
    for (const table of ['colaboradores', 'cargos_empresa', 'competencias', 'trilhas']) {
      expect(shared.sb.chamadas.some(call => call.tabela === table && call.metodo === 'eq' && call.args[0] === 'empresa_id' && call.args[1] === companyId)).toBe(true);
    }
    expect(shared.sb.escritas).toHaveLength(0);
    expect(shared.sb.chamadas.some(call => call.tabela === 'empresas' && call.metodo === 'eq' && call.args[0] === 'id' && call.args[1] === companyId)).toBe(true);
  });
  it('erro retornado pelo banco não vira ausência de relatório', async () => {
    shared.sb.falharEm({ tabela: 'relatorios', op: 'select', mensagem: 'coluna indisponível' });
    const result = await readIpiData(auth, permissions, companyId, plan(['relatorios']));
    expect(result.at(-1)?.text).toContain('indisponível');
    expect(result.at(-1)?.text).not.toContain('"total":0');
    expect(shared.sb.escritas).toHaveLength(0);
  });
  it('não consulta dados individuais sem a permissão correspondente', async () => {
    shared.sb = criarSupabaseMock({ resolver: table => table === 'empresas' ? { id: companyId } : null, lista: table => table === 'colaboradores' ? [{ id: 'pessoa-1', nome_completo: 'Pessoa Teste' }] : [], contagem: () => 1 });
    const limited = new Set(permissions); limited.delete('reports.individual.view');
    const result = await readIpiData(auth, limited, companyId, plan(['trilhas'], 'Pessoa Teste'));
    expect(result.at(-1)?.text).toContain('Sem permissão');
    expect(shared.sb.chamadas.some(call => call.tabela === 'trilhas')).toBe(false);
  });
  it('nome ambíguo pede esclarecimento e não escolhe pessoa', async () => {
    shared.sb = criarSupabaseMock({ resolver: table => table === 'empresas' ? { id: companyId } : null, lista: () => [{ id: 'p1' }, { id: 'p2' }], contagem: () => 2 });
    const result = await readIpiData(auth, permissions, companyId, plan(['trilhas'], 'Pessoa'));
    expect(result.at(-1)?.text).toContain('nome completo');
    expect(shared.sb.chamadas.some(call => call.tabela === 'trilhas')).toBe(false);
  });
});
