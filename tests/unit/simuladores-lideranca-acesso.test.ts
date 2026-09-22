import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { ACESSO_ATUAL, SEM_ACESSO } from '@/lib/simuladores/acesso-cargo';

let sb: SupabaseMock;
const estado = { cargoLiberado: false, moduloLigado: true, ctx: null as any };
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

/**
 * O Mapeamento de liderança é do RH, pelo papel e pelo módulo contratado. A aba de
 * cargos diz só quem TREINA no simulador (decisão do dono, 22/09/2026); até então o
 * cargo do RH decidia estas quatro portas, e desmarcá-lo tirava dele o Mapeamento.
 */
describe('Mapeamento de liderança: papel e módulo decidem, a aba de cargos não', () => {
  beforeEach(() => {
    estado.cargoLiberado = false;
    estado.moduloLigado = true;
    estado.ctx = { role: 'rh', empresaId: 'empresa-a', isPlatformAdmin: false, colaborador: { empresa_id: 'empresa-a', cargo: 'RH' } };
    agregar.mockClear();
    sb = criarSupabaseMock({
      resolver: () => ({
        nome: 'Empresa', sys_config: {
          simuladores_por_cargo: { 'cargo-rh': estado.cargoLiberado ? ACESSO_ATUAL : SEM_ACESSO },
          modulos: { prontidao_lideranca: estado.moduloLigado }, prontidao_lideranca: { cargo_alvo: 'Gerente', exemplares: [] },
        },
      }),
      // O gate lê a lista de cargos da empresa e casa o nome normalizado (19/09/2026).
      lista: tabela => tabela === 'cargos_empresa' ? [{ id: 'cargo-rh', nome: 'RH' }] : [],
    });
  });
  it.each([
    ['painel', () => getProntidaoLideranca()],
    ['parecer', () => getParecerLideranca('10000000-0000-4000-8000-000000000001')],
    ['PDF nominal', () => exportarParecerPDF('10000000-0000-4000-8000-000000000001')],
    ['PDF consolidado', () => exportarConsolidadoPDF()],
  ])('🔴 RH com o próprio cargo FORA do simulador passa pela porta do %s', async (_nome, abrir) => {
    const r: any = await abrir();
    expect(String(r?.error ?? '')).not.toContain('cargo');
    expect(String(r?.error ?? '')).not.toContain('Acesso exclusivo do RH');
  });
  it('o painel abre e agrega com o cargo do RH fora do simulador', async () => {
    expect(await getProntidaoLideranca()).toMatchObject({ success: true });
    expect(agregar).toHaveBeenCalledOnce();
  });
  it('módulo não contratado continua fechando a porta', async () => {
    estado.cargoLiberado = true;
    estado.moduloLigado = false;
    expect(await getProntidaoLideranca()).toMatchObject({ success: false });
    expect(agregar).not.toHaveBeenCalled();
  });
  it('liberar um cargo não transforma colaborador em RH', async () => {
    estado.cargoLiberado = true; estado.ctx.role = 'colaborador';
    expect(await getProntidaoLideranca()).toMatchObject({ success: false, error: 'Acesso exclusivo do RH.' });
    expect(sb.chamadas).toHaveLength(0);
  });
});
