import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * As duas actions que ESCREVEM o programa de prontidão. O que se prova aqui:
 * o gate é `admin.access` (o papel rh tem settings.company.manage e, por action
 * id, ligava o módulo pago), o cargo-alvo é gravado com o nome CANÔNICO da
 * linha de cargos_empresa (o cenário do dia é buscado por nome exato), a
 * configuração inválida não é gravada, e toda escrita vai para a auditoria.
 */
const LID = ['Priorização', 'Delegação'];
const cenario = { sysConfig: {} as any };
let sb = criarSupabaseMock();
const gate = vi.fn(async () => sb.client);
const auditoria = vi.fn(async (..._args: any[]) => {});

function mock() {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'empresas') return { nome: 'ACME', sys_config: cenario.sysConfig };
      if (tabela === 'turmas') return { id: 't1', nome: 'Turma 1' };
      return null;
    },
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return [
        { nome: 'Gerente Comercial', gabarito: { tela4: {} }, top5_workshop: LID },
        { nome: 'Vendedor', gabarito: { tela4: {} }, top5_workshop: ['Prospecção'] },
      ];
      if (tabela === 'colaboradores') return [
        { id: 'ana', nome_completo: 'Ana', cargo: 'Vendedor', email: 'ana@cliente.com', role: 'colaborador' },
        { id: 'gil', nome_completo: 'Gil', cargo: 'Gerente Comercial', email: 'gil@cliente.com', role: 'colaborador' },
        { id: 'rh', nome_completo: 'RH', cargo: 'RH', email: 'rh@cliente.com', role: 'rh' },
      ];
      if (tabela === 'turma_membros') return [{ colaborador_id: 'ana' }];
      return [];
    },
  });
}

vi.mock('@/lib/admin-supabase', () => ({ requireEmpresaSupabase: (...args: any[]) => gate(...(args as [])), requireAdminSupabase: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'admin@vertho.ai') }));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...args: any[]) => auditoria(...(args as [])) }));
vi.mock('@/lib/authz', () => ({ getUserContext: vi.fn() }));
vi.mock('@/lib/turmas/contexto', () => ({ listarTurmasDoTenant: vi.fn(async () => []), carregarParticipacaoAtiva: vi.fn() }));

import { salvarConfigProntidaoAdmin, setModuloProntidaoAdmin } from '@/actions/prontidao-lideranca';

const escritaSysConfig = () => sb.escritas.find((e) => e.tabela === 'empresas' && e.op === 'update')?.payload?.sys_config;

describe('salvarConfigProntidaoAdmin', () => {
  beforeEach(() => { sb = mock(); gate.mockClear(); auditoria.mockClear(); cenario.sysConfig = { modulos: { prontidao_lideranca: true } }; });

  it('gate admin.access; grava o cargo-alvo com o nome canônico; audita', async () => {
    const r: any = await salvarConfigProntidaoAdmin('emp-A', { cargo_alvo: '  gerente COMERCIAL ', exemplares: ['gil', 'gil', 'ana'], um_por_dia: false, corte_nota: 3, banda: 0.25 });
    expect(gate).toHaveBeenCalledWith('emp-A', 'admin.access', 'salvarConfigProntidaoAdmin');
    expect(r.success).toBe(true);
    expect(r.cfg.cargo_alvo).toBe('Gerente Comercial');
    expect(escritaSysConfig()).toMatchObject({
      modulos: { prontidao_lideranca: true },
      prontidao_lideranca: { cargo_alvo: 'Gerente Comercial', exemplares: ['gil', 'ana'], um_por_dia: false, corte_nota: 3, banda: 0.25, escopo: { tipo: 'empresa_inteira' } },
    });
    expect(auditoria).toHaveBeenCalledTimes(1);
    expect(auditoria.mock.calls[0][0]).toMatchObject({ acao: 'prontidao_lideranca.configurar', empresaId: 'emp-A' });
  });

  it('escopo por turma: exemplar fora da turma (o gerente) é aceito — a validação de pertencimento é do TENANT', async () => {
    const r: any = await salvarConfigProntidaoAdmin('emp-A', { cargo_alvo: 'Gerente Comercial', exemplares: ['gil'], escopo: { tipo: 'turma', turmaId: 't1' } });
    expect(r.success).toBe(true);
    expect(escritaSysConfig()?.prontidao_lideranca).toMatchObject({ escopo: { tipo: 'turma', turmaId: 't1' }, exemplares: ['gil'] });
  });

  it('configuração inválida não é gravada nem auditada, e os erros voltam nomeados', async () => {
    const r: any = await salvarConfigProntidaoAdmin('emp-A', { cargo_alvo: 'Diretor', exemplares: ['x9'] });
    expect(r.success).toBe(false);
    expect(r.erros.join(' ')).toMatch(/não existe/);
    expect(r.erros.join(' ')).toMatch(/exemplar/);
    expect(sb.escritas).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
    expect(await salvarConfigProntidaoAdmin('emp-A', {})).toMatchObject({ success: false, error: 'Informe o cargo-alvo.' });
  });
});

describe('setModuloProntidaoAdmin', () => {
  beforeEach(() => { sb = mock(); gate.mockClear(); auditoria.mockClear(); cenario.sysConfig = { ai: { modelo_padrao: 'x' }, modulos: { pulso: false } }; });

  it('gate admin.access; liga só a chave do módulo, preserva o resto; audita', async () => {
    const r: any = await setModuloProntidaoAdmin('emp-A', true);
    expect(gate).toHaveBeenCalledWith('emp-A', 'admin.access', 'setModuloProntidaoAdmin');
    expect(r).toEqual({ success: true, contratado: true });
    expect(escritaSysConfig()).toEqual({ ai: { modelo_padrao: 'x' }, modulos: { pulso: false, prontidao_lideranca: true } });
    expect(auditoria.mock.calls[0][0]).toMatchObject({ acao: 'prontidao_lideranca.modulo.ligar', empresaId: 'emp-A' });
  });

  it('falha de leitura da empresa não vira escrita', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout' });
    const r: any = await setModuloProntidaoAdmin('emp-A', true);
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });
});
