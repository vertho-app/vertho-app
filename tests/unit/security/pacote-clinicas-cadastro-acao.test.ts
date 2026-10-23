import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Pacote de clínicas (onlabel, 23/10/2026): o cadastro da secretária pelo admin confere, NO SERVIDOR,
 * clínica, cargo e modelo contra o que existe na empresa. A regra pura está em
 * `tests/unit/pacote-clinicas-cadastro.test.ts`; aqui se prova que as AÇÕES a aplicam (e que, sem a
 * chave da empresa, nada muda): o seletor da tela é conforto, o id da clínica vem do navegador.
 */

const EMPRESA = '22222222-2222-4222-8222-222222222222';

let sysConfig: Record<string, unknown> | null = { pacote_clinicas: true };
let papelAtual = 'colaborador';

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'empresas') return { sys_config: sysConfig };
    if (tabela === 'colaboradores') return { id: 'p1', role: papelAtual };
    return null;
  },
  lista: (tabela: string) => {
    if (tabela === 'cargos_empresa') return [{ nome: 'Secretária de convênios' }];
    if (tabela === 'escolas') return [{ id: 'clinica-1', nome: 'Clínica Sol' }];
    return [];
  },
  escrita: (tabela, op) => (tabela === 'colaboradores' && op === 'insert' ? [] : null),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => sb.client,
  requireEmpresaSupabase: async () => sb.client,
  requireLinhaSupabase: async () => ({ sb: sb.client, linha: { empresa_id: EMPRESA } }),
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true, role: null }),
  requireAdminAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true }),
  requirePermissionAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true }),
  assertTenantAccessAction: async () => undefined,
  getAuthenticatedEmailFromAction: async () => 'admin@vertho.ai',
}));
// A emailExistsInTenant lê `colaboradores` (o resolver acima devolve uma linha): aqui ninguém existe ainda.
vi.mock('@/lib/repositories/colaboradores-repo', async (orig) => ({
  ...(await orig<any>()),
  emailExistsInTenant: async () => false,
}));

const { criarColaborador, atualizarColaborador } = await import('@/app/admin/empresas/gerenciar/actions');

const inseridas = () => sb.escritas.filter((e) => e.tabela === 'colaboradores' && e.op === 'insert').flatMap((e) => e.payload);
const atualizacoes = () => sb.escritas.filter((e) => e.tabela === 'colaboradores' && e.op === 'update').map((e) => e.payload);

const SECRETARIA = { nome_completo: 'Ana Souza', telefone: '11999990001', cargo: 'Secretária de convênios', escola_id: 'clinica-1', recepcao_modelo: null };

beforeEach(() => {
  sb.reset();
  sysConfig = { pacote_clinicas: true };
  papelAtual = 'colaborador';
});

describe('criarColaborador no pacote de clínicas', () => {
  it('grava clínica e modelo, e a área vira o nome da clínica', async () => {
    const r = await criarColaborador({ empresaId: EMPRESA, campos: SECRETARIA });
    expect(r.success).toBe(true);
    const [linha] = inseridas();
    expect(linha.escola_id).toBe('clinica-1');
    expect(linha.area_depto).toBe('Clínica Sol');
    expect(linha.recepcao_modelo).toBeNull();
  });

  it('recusa clínica que não é da empresa, sem gravar nada', async () => {
    const r = await criarColaborador({ empresaId: EMPRESA, campos: { ...SECRETARIA, escola_id: 'clinica-de-outro-tenant' } });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não pertence a esta empresa/);
    expect(inseridas()).toHaveLength(0);
  });

  it('recusa cargo fora da lista da empresa', async () => {
    const r = await criarColaborador({ empresaId: EMPRESA, campos: { ...SECRETARIA, cargo: 'Recepcionista' } });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não é um dos cargos/);
    expect(inseridas()).toHaveLength(0);
  });

  it('a conta de RH da empresa entra sem clínica nem modelo', async () => {
    const r = await criarColaborador({ empresaId: EMPRESA, campos: { nome_completo: 'Carla RH', email: 'carla@onlabel.com', role: 'rh' } });
    expect(r.success).toBe(true);
    const [linha] = inseridas();
    expect(linha.role).toBe('rh');
    expect(linha.escola_id).toBeUndefined();
  });

  it('sem a chave da empresa, o cadastro segue livre e ignora clínica e modelo', async () => {
    sysConfig = {};
    const r = await criarColaborador({ empresaId: EMPRESA, campos: { ...SECRETARIA, cargo: 'Qualquer cargo', escola_id: 'clinica-de-outro-tenant' } });
    expect(r.success).toBe(true);
    const [linha] = inseridas();
    expect(linha.cargo).toBe('Qualquer cargo');
    expect(linha.escola_id).toBeUndefined();
    expect(linha.recepcao_modelo).toBeUndefined();
  });
});

describe('atualizarColaborador no pacote de clínicas', () => {
  it('trocar para clínica de outra empresa é recusado', async () => {
    const r = await atualizarColaborador({ empresaId: EMPRESA, id: '33333333-3333-4333-8333-333333333333', campos: { escola_id: 'clinica-de-outro-tenant' } });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não pertence a esta empresa/);
    expect(atualizacoes()).toHaveLength(0);
  });

  it('trocar para clínica da empresa grava a clínica e o nome na área', async () => {
    const r = await atualizarColaborador({ empresaId: EMPRESA, id: '33333333-3333-4333-8333-333333333333', campos: { escola_id: 'clinica-1' } });
    expect(r.success).toBe(true);
    const [patch] = atualizacoes();
    expect(patch.escola_id).toBe('clinica-1');
    expect(patch.area_depto).toBe('Clínica Sol');
  });

  it('o papel lido do banco decide: editar a conta de RH não exige clínica', async () => {
    papelAtual = 'rh';
    const r = await atualizarColaborador({ empresaId: EMPRESA, id: '33333333-3333-4333-8333-333333333333', campos: { nome_completo: 'Carla' } });
    expect(r.success).toBe(true);
  });
});
