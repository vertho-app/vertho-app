import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { ACESSO_ATUAL, SEM_ACESSO } from '@/lib/simuladores/acesso-cargo';

let sb: SupabaseMock;
const estado = { cargoLiberado: false, ctx: null as any };
const agregar = vi.fn(async () => ({ linhas: [] }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => estado.ctx }));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => 'rh@example.test' }));
vi.mock('@/lib/admin-supabase', () => ({ requireEmpresaSupabase: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/turmas/contexto', () => ({ listarTurmasDoTenant: vi.fn() }));
vi.mock('@/lib/prontidao-lideranca/agregar', () => ({
  agregarProntidaoLideranca: (...args: unknown[]) => agregar(...args as []), carregarParecer: vi.fn(),
  carregarCalibragem: vi.fn(), carregarCargosParaValidacao: vi.fn(), carregarPopulacao: vi.fn(),
}));
import { getProntidaoLideranca, getParecerLideranca, exportarParecerPDF, exportarConsolidadoPDF } from '@/actions/prontidao-lideranca';

describe('Prontidão respeita o cargo em todas as portas do RH', () => {
  beforeEach(() => {
    estado.cargoLiberado = false;
    estado.ctx = { role: 'rh', empresaId: 'empresa-a', isPlatformAdmin: false, colaborador: { empresa_id: 'empresa-a', cargo: 'RH' } };
    agregar.mockClear();
    sb = criarSupabaseMock({ resolver: tabela => tabela === 'cargos_empresa' ? { id: 'cargo-rh' } : {
      nome: 'Empresa', sys_config: {
        simuladores_por_cargo: { 'cargo-rh': estado.cargoLiberado ? ACESSO_ATUAL : SEM_ACESSO },
        modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente', exemplares: [] },
      },
    } });
  });
  it.each([
    ['painel', () => getProntidaoLideranca()],
    ['parecer', () => getParecerLideranca('10000000-0000-4000-8000-000000000001')],
    ['PDF nominal', () => exportarParecerPDF('10000000-0000-4000-8000-000000000001')],
    ['PDF consolidado', () => exportarConsolidadoPDF()],
  ])('bloqueia %s antes de ler pessoas ou produzir PDF', async (_nome, abrir) => {
    expect(await abrir()).toMatchObject({ success: false, error: expect.stringContaining('cargo') });
    expect(agregar).not.toHaveBeenCalled();
    expect(sb.escritas).toHaveLength(0);
  });
  it('permite ao RH consultar o painel quando seu cargo está liberado', async () => {
    estado.cargoLiberado = true;
    expect(await getProntidaoLideranca()).toMatchObject({ success: true });
    expect(agregar).toHaveBeenCalledOnce();
  });
  it('liberar um cargo não transforma colaborador em RH', async () => {
    estado.cargoLiberado = true; estado.ctx.role = 'colaborador';
    expect(await getProntidaoLideranca()).toMatchObject({ success: false, error: 'Acesso exclusivo do RH.' });
    expect(sb.chamadas).toHaveLength(0);
  });
});
