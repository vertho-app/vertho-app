import { beforeEach, describe, expect, it, vi } from 'vitest';
import { engagementLinks } from '@/lib/engajamento/surface';
import { engagementDetailHref } from '@/lib/engajamento/prioridades';

const mock = vi.hoisted(() => ({ gate: vi.fn(), rollup: vi.fn(), evolution: vi.fn(), coordinator: vi.fn(), tenant: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requireRoleAction: mock.gate }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: mock.tenant }));
vi.mock('@/lib/engajamento/roll-up', () => ({ rollUpEngajamento: mock.rollup }));
vi.mock('@/lib/engajamento/evolucao', () => ({ carregarEvolucaoEngajamento: mock.evolution }));
vi.mock('@/lib/engajamento/coordenadores', () => ({ anexarCoordenador: mock.coordinator }));
import { getEngajamentoRh, getEvolucaoEngajamentoRh } from '@/actions/engajamento-rh';

beforeEach(() => {
  vi.clearAllMocks();
  mock.gate.mockResolvedValue({ role: 'rh', empresaId: 'empresa-da-sessao', isPlatformAdmin: false });
  mock.tenant.mockReturnValue({});
  mock.rollup.mockResolvedValue({ resumo: { inscritos: 1 }, colaboradores: [{ colaboradorId: 'p1', nome: 'Ana' }] });
  mock.coordinator.mockResolvedValue([{ colaboradorId: 'p1', nome: 'Ana', coordenadorNome: 'Carla', coordenadorEmail: 'carla@teste' }]);
  mock.evolution.mockResolvedValue({ ok: true, data: { inscritos: 1 } });
});

describe('RH: painel e evolução da própria empresa', () => {
  it('usa a empresa da sessão e mantém os eixos de semana, função e coordenação', async () => {
    const result = await getEngajamentoRh(5, 'Professor');
    expect(mock.gate).toHaveBeenCalledWith(['rh', 'admin']);
    expect(mock.rollup).toHaveBeenCalledWith('empresa-da-sessao', 5, null, 'Professor');
    expect(mock.coordinator).toHaveBeenCalledWith({}, 'empresa-da-sessao', [{ colaboradorId: 'p1', nome: 'Ana' }]);
    expect(result.colaboradores[0].coordenadorNome).toBe('Carla');
    expect(result.coordenacaoDisponivel).toBe(true);
    await getEvolucaoEngajamentoRh('Operações');
    expect(mock.evolution).toHaveBeenCalledWith('empresa-da-sessao', 'Operações');
  });

  it('uma nova sessão muda o recorte da evolução sem aceitar empresa do navegador', async () => {
    await getEvolucaoEngajamentoRh();
    mock.gate.mockResolvedValue({ role: 'rh', empresaId: 'outra-sessao', isPlatformAdmin: false });
    await getEvolucaoEngajamentoRh('empresa-forjada-no-filtro');
    expect(mock.evolution.mock.calls).toEqual([
      ['empresa-da-sessao', undefined], ['outra-sessao', 'empresa-forjada-no-filtro'],
    ]);
  });

  it.each(['UNAUTHORIZED', 'FORBIDDEN'])('interrompe os leitores se o gate retorna %s', async (error) => {
    mock.gate.mockRejectedValue(new Error(error));
    await expect(getEngajamentoRh()).rejects.toThrow(error);
    await expect(getEvolucaoEngajamentoRh()).rejects.toThrow(error);
    expect(mock.rollup).not.toHaveBeenCalled();
    expect(mock.evolution).not.toHaveBeenCalled();
  });

  it('recusa sessão sem empresa e não transforma erro de consulta em métricas zeradas', async () => {
    mock.gate.mockResolvedValue({ role: 'rh', empresaId: null });
    await expect(getEngajamentoRh()).rejects.toThrow('FORBIDDEN');
    expect(mock.rollup).not.toHaveBeenCalled();
    mock.gate.mockResolvedValue({ role: 'rh', empresaId: 'empresa-da-sessao' });
    mock.rollup.mockResolvedValue({ resumo: { erro: 'Banco indisponível' }, colaboradores: [] });
    await expect(getEngajamentoRh()).rejects.toThrow('Não foi possível carregar');
    expect(mock.coordinator).not.toHaveBeenCalled();
  });

  it('mantém as pessoas quando falha o vínculo e sinaliza a indisponibilidade', async () => {
    mock.coordinator.mockResolvedValue(null);
    const result = await getEngajamentoRh();
    expect(result.colaboradores).toEqual([{ colaboradorId: 'p1', nome: 'Ana' }]);
    expect(result.coordenacaoDisponivel).toBe(false);
  });

  it('gera navegação no portal RH sem links administrativos nem parâmetros de outra empresa', () => {
    const links = engagementLinks('empresa-ignorada', 'rh');
    expect(links.dashboard).toBe('/dashboard/gestor/engajamento');
    expect(links.report).toBe('/dashboard/gestor/engajamento/relatorio');
    expect(links.reviewEnvios).toBeNull();
    const url = new URL(engagementDetailHref('empresa-ignorada', { id: 'pessoa & 1', week: 5 }, 'rh'), 'https://app.vertho.ai');
    expect(url.pathname).toBe(links.dashboard);
    expect(url.searchParams.get('pessoa')).toBe('pessoa & 1');
    expect(url.searchParams.get('semana')).toBe('5');
    expect(url.searchParams.has('empresa')).toBe(false);
    expect(url.hash).toBe('#pessoas');
  });
});
