import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { ACESSO_ATUAL, SEM_ACESSO } from '@/lib/simuladores/acesso-cargo';

let sb: SupabaseMock;
const gate = vi.fn(async (..._args: unknown[]) => ({ email: 'admin@example.test' }));
const auditar = vi.fn();
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: (...args: unknown[]) => gate(...args) }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...args: unknown[]) => auditar(...args) }));
import { carregarAcessosSimuladores, salvarAcessoSimuladores } from '@/app/admin/cargos/simuladores-actions';

const empresaId = '10000000-0000-4000-8000-000000000001';
const cargoId = '20000000-0000-4000-8000-000000000001';
const outroCargo = '20000000-0000-4000-8000-000000000002';
let sysConfig: Record<string, unknown>, cargo: object | null;
let cargosExtras: object[];
const entrada = () => ({ empresaId, cargoId, acesso: SEM_ACESSO, anterior: ACESSO_ATUAL });
const gravado = () => sb.escritas.find(e => e.tabela === 'empresas')?.payload.sys_config;

describe('configuração dos acessos por cargo', () => {
  beforeEach(() => {
    sysConfig = { modulos: { prontidao_lideranca: true }, simuladores_por_cargo: { [outroCargo]: SEM_ACESSO }, cadencia: { dia: 'segunda' } };
    cargo = { id: cargoId, nome: 'Consultor' };
    cargosExtras = [];
    gate.mockReset().mockResolvedValue({ email: 'admin@example.test' }); auditar.mockClear();
    sb = criarSupabaseMock({
      resolver: tabela => tabela === 'empresas' ? { sys_config: sysConfig, updated_at: 't1' }
        : tabela === 'cargos_empresa' ? cargo : { habilitado: true },
      lista: tabela => tabela === 'cargos_empresa' ? [cargo, ...cargosExtras].filter(Boolean) : [],
      escrita: tabela => tabela === 'empresas' ? [{ id: empresaId }] : null,
    });
  });
  it('lê cargos e disponibilidade dos três módulos com escopo de empresa', async () => {
    const result = await carregarAcessosSimuladores(empresaId);
    expect(result).toMatchObject({ success: true, cargos: [{ id: cargoId, acesso: ACESSO_ATUAL }], habilitados: ACESSO_ATUAL });
    expect(sb.chamadas).toContainEqual({ tabela: 'cargos_empresa', metodo: 'eq', args: ['empresa_id', empresaId] });
  });
  it('salva um cargo sem apagar outras regras ou configurações e registra auditoria', async () => {
    expect(await salvarAcessoSimuladores(entrada())).toEqual({ success: true });
    expect(gate).toHaveBeenCalledWith('settings.company.manage');
    expect(gravado()).toEqual({ ...sysConfig, simuladores_por_cargo: { [outroCargo]: SEM_ACESSO, [cargoId]: SEM_ACESSO } });
    expect(sb.chamadas).toContainEqual({ tabela: 'empresas', metodo: 'eq', args: ['updated_at', 't1'] });
    expect(auditar).toHaveBeenCalledWith(expect.objectContaining({ empresaId, alvo: cargoId, detalhes: { acesso: SEM_ACESSO, anterior: ACESSO_ATUAL } }));
  });
  it('nega operador sem permissão antes de consultar o banco', async () => {
    gate.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(salvarAcessoSimuladores(entrada())).rejects.toThrow('FORBIDDEN');
    expect(sb.chamadas).toHaveLength(0);
  });
  it('não grava id de cargo ausente ou pertencente a outro tenant', async () => {
    cargo = null;
    expect(await salvarAcessoSimuladores(entrada())).toMatchObject({ success: false });
    expect(sb.chamadas).toContainEqual({ tabela: 'cargos_empresa', metodo: 'eq', args: ['empresa_id', empresaId] });
    expect(sb.escritas).toHaveLength(0);
  });
  it('rejeita payload adulterado e identificadores inválidos antes do banco', async () => {
    for (const invalid of [{ ...entrada(), cargoId: 'x' }, { ...entrada(), acesso: { vendas: 'true' } }, { ...entrada(), extra: true }]) {
      expect(await salvarAcessoSimuladores(invalid as any)).toMatchObject({ success: false });
    }
    expect(sb.chamadas).toHaveLength(0);
  });
  it('detecta edição concorrente no mesmo cargo e não sobrescreve', async () => {
    sysConfig.simuladores_por_cargo = { [cargoId]: { ...ACESSO_ATUAL, atendimento: false } };
    expect(await salvarAcessoSimuladores(entrada())).toMatchObject({ success: false, error: expect.stringContaining('Outra pessoa') });
    expect(sb.escritas).toHaveLength(0);
  });
  it.each(['select', 'update'] as const)('falha de %s não informa sucesso nem audita gravação', async op => {
    sb.falharEm({ tabela: 'empresas', op, mensagem: 'timeout' });
    expect(await salvarAcessoSimuladores(entrada())).toMatchObject({ success: false });
    expect(auditar).not.toHaveBeenCalled();
  });

  it('salva vários cargos em uma única gravação e audita cada alteração', async () => {
    cargosExtras = [{ id: outroCargo }];
    const cargos = [entrada(), { cargoId: outroCargo, acesso: ACESSO_ATUAL, anterior: SEM_ACESSO }]
      .map(({ cargoId, acesso, anterior }) => ({ cargoId, acesso, anterior }));
    expect(await salvarAcessoSimuladores({ empresaId, cargos })).toEqual({ success: true });
    expect(sb.escritas.filter(e => e.tabela === 'empresas')).toHaveLength(1);
    expect(gravado()).toEqual({ ...sysConfig, simuladores_por_cargo: { [cargoId]: SEM_ACESSO, [outroCargo]: ACESSO_ATUAL } });
    expect(auditar).toHaveBeenCalledTimes(2);
  });

  it('cargo de outro tenant dentro do lote impede todas as alterações', async () => {
    const cargos = [cargoId, outroCargo].map(id => ({ cargoId: id, acesso: SEM_ACESSO, anterior: ACESSO_ATUAL }));
    expect(await salvarAcessoSimuladores({ empresaId, cargos })).toMatchObject({ success: false, error: 'Cargo não encontrado nesta empresa.' });
    expect(sb.escritas).toHaveLength(0);
    expect(auditar).not.toHaveBeenCalled();
  });

  it('conflito no segundo cargo não salva parcialmente o primeiro', async () => {
    cargosExtras = [{ id: outroCargo }];
    const cargos = [cargoId, outroCargo].map(id => ({ cargoId: id, acesso: SEM_ACESSO, anterior: ACESSO_ATUAL }));
    expect(await salvarAcessoSimuladores({ empresaId, cargos })).toMatchObject({ success: false, error: expect.stringContaining('Outra pessoa') });
    expect(sb.escritas).toHaveLength(0);
    expect(auditar).not.toHaveBeenCalled();
  });

  it('rejeita lote vazio ou cargo duplicado antes de consultar o banco', async () => {
    const { cargoId: id, acesso, anterior } = entrada();
    const item = { cargoId: id, acesso, anterior };
    for (const cargos of [[], [item, item]])
      expect(await salvarAcessoSimuladores({ empresaId, cargos })).toMatchObject({ success: false });
    expect(sb.chamadas).toHaveLength(0);
  });
});
