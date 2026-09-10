import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildViews } from '@/lib/engajamento/relatorio-model';

const mock = vi.hoisted(() => ({
  auth: vi.fn(), empresa: vi.fn(), rollup: vi.fn(), evolution: vi.fn(), marca: vi.fn(), render: vi.fn(),
}));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: mock.auth }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ raw: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.empresa }) }) }) } }) }));
vi.mock('@/lib/engajamento/roll-up', () => ({ rollUpEngajamento: mock.rollup }));
vi.mock('@/lib/engajamento/evolucao', () => ({ carregarEvolucaoEngajamento: mock.evolution }));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: mock.marca, nomeArquivoMarca: (name: string, marca: any) => marca.mostrarVertho ? name : name.replace('vertho-', '') }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: mock.render }));
vi.mock('@/components/pdf/RelatorioEngajamento', () => ({ default: () => null }));
import { GET } from '@/app/api/relatorios/engajamento/pdf/route';

const EMPRESA = '44b632ae-b7b9-440d-bc74-92cead889d52';
const rollup = { resumo: { inscritos: 99, abriramLink: 99, consumiram: 99, enviaramEvidencia: 99, porFormato: [] }, colaboradores: [] };
const evolucao: any = {
  semanaAtual: 5, inscritos: 50, emRisco: 2, recuperados: 1,
  trajetorias: { critical: 1, attention: 1 },
  semanas: [
    { semana: 4, elegiveis: 40, ativados: 20, ativacaoPct: 50, consumiram: 10, consumoPct: 25, evidencias: 4, evidenciaPct: 10, usaramTutor: 2 },
    { semana: 5, elegiveis: 20, ativados: 5, ativacaoPct: 25, consumiram: 3, consumoPct: 15, evidencias: 1, evidenciaPct: 5, usaramTutor: 1 },
  ],
  pessoasEmRisco: [{ nome: 'Nome nominal restrito', cargo: 'Analista', area: 'Operações', semanaAtual: 5, trajetoria: 'critical', motivo: 'Sem atividade há duas semanas' }],
  areas: [{ area: 'Operações', participantes: 50, emRisco: 2, tendencia: -10 }],
  cargos: [{ cargo: 'Analista', participantes: 50, elegiveis: 20, ativados: 5, consumiram: 3, evidencias: 1, ativacaoPct: 25, consumoPct: 15, evidenciaPct: 5, emRisco: 2, criticos: 1, atencao: 1, riscoPct: 4 }],
};
const request = (query = '') => new Request(`https://app.vertho.ai/api/relatorios/engajamento/pdf?empresa=${EMPRESA}${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ isPlatformAdmin: true });
  mock.empresa.mockResolvedValue({ data: { nome: 'Empresa teste', slug: 'empresa-teste' }, error: null });
  mock.rollup.mockResolvedValue(rollup);
  mock.evolution.mockResolvedValue({ ok: true, data: evolucao });
  mock.marca.mockResolvedValue({ logoBase64: null, mostrarVertho: false });
  mock.render.mockResolvedValue(Buffer.from('%PDF-1.7'));
});

describe('PDF de engajamento: dados e autorização', () => {
  it('o RH recebe apenas o relatório da empresa da sessão, com links do seu portal', async () => {
    mock.auth.mockResolvedValue({ role: 'rh', empresaId: EMPRESA, isPlatformAdmin: false });
    const res = await GET(new Request('https://app.vertho.ai/api/relatorios/engajamento/pdf?view=inline'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mock.evolution).toHaveBeenCalledWith(EMPRESA);
    expect(mock.rollup).toHaveBeenCalledWith(EMPRESA);
    const props = mock.render.mock.calls[0][0].props;
    expect(props.detailUrl).toBe('https://app.vertho.ai/dashboard/gestor/engajamento?view=evolucao');
    expect(props.data.eyebrow).toBe('Leitura de RH / Diretoria');
    expect(JSON.stringify(props)).not.toContain('Nome nominal restrito');
  });

  it.each(['colaborador', 'gestor', 'tutor'])('não amplia o acesso à empresa inteira para %s', async (role) => {
    mock.auth.mockResolvedValue({ role, empresaId: EMPRESA, isPlatformAdmin: false });
    expect((await GET(request('&publico=rh'))).status).toBe(403);
    expect(mock.empresa).not.toHaveBeenCalled();
    expect(mock.rollup).not.toHaveBeenCalled();
  });

  it('bloqueia troca de empresa, leitura nominal e RH sem empresa antes das consultas', async () => {
    mock.auth.mockResolvedValue({ role: 'rh', empresaId: '00000000-0000-0000-0000-000000000001', isPlatformAdmin: false });
    expect((await GET(request('&publico=rh'))).status).toBe(403);
    mock.auth.mockResolvedValue({ role: 'rh', empresaId: EMPRESA, isPlatformAdmin: false });
    expect((await GET(request('&publico=gestor'))).status).toBe(403);
    mock.auth.mockResolvedValue({ role: 'rh', empresaId: null, isPlatformAdmin: false });
    expect((await GET(request('&publico=rh'))).status).toBe(403);
    expect(mock.empresa).not.toHaveBeenCalled();
    expect(mock.evolution).not.toHaveBeenCalled();
    expect(mock.render).not.toHaveBeenCalled();
  });

  it.each([401, 403])('interrompe antes de consultar dados quando o gate retorna %i', async (status) => {
    mock.auth.mockResolvedValue(new Response(null, { status }));
    const res = await GET(request());
    expect(res.status).toBe(status);
    expect(mock.empresa).not.toHaveBeenCalled();
    expect(mock.rollup).not.toHaveBeenCalled();
    expect(mock.render).not.toHaveBeenCalled();
  });

  it('rejeita empresa e público inválidos antes das consultas', async () => {
    expect((await GET(new Request('https://app.vertho.ai/api/relatorios/engajamento/pdf?empresa=invalida'))).status).toBe(400);
    expect((await GET(request('&publico=colaborador'))).status).toBe(400);
    expect(mock.empresa).not.toHaveBeenCalled();
  });

  it('usa o fechamento e seus deltas, mesmo quando o agregado tem outros totais', () => {
    const views = buildViews({ empresaNome: 'Teste', rollup, evolucao })!;
    for (const data of Object.values(views)) {
      expect(data.eligible).toBe(20);
      expect(data.activation).toEqual({ count: 5, pct: 25, delta: -25 });
      expect(data.consumption).toEqual({ count: 3, pct: 15, delta: -10 });
      expect(data.evidence).toEqual({ count: 1, pct: 5, delta: -5 });
      expect(data.trend.at(-1)).toEqual({ label: 'S5', activation: 25, consumption: 15, evidence: 5 });
      expect(data.cargos[0]).toMatchObject({ cargo: 'Analista', elegiveis: 20, ativacaoPct: 25, riscoPct: 4 });
      expect(data.cargos[0].acao).toContain('15 pessoas sem ativação');
    }
    expect(views.rh.cargos).toEqual(views.gestor.cargos);
    expect(views.rh.focusItems[0].context).toContain('2 pessoas em risco');
  });

  it.each([
    [0, 0, 0, 0, 2, 'ainda não chegou ao fechamento'],
    [10, 8, 3, 2, 2, '5 pessoas com ativação, mas sem consumo'],
    [10, 9, 9, 2, 2, '7 pessoas com consumo concluído, mas sem evidência'],
    [10, 10, 10, 10, 2, 'Acompanhar as trajetórias em risco e possíveis quedas'],
    [10, 10, 10, 10, 0, 'Reconhecer a participação'],
  ])('sugere ação coerente com a base e o gargalo do cargo (%i, %i, %i, %i)', (elegiveis, ativados, consumiram, evidencias, emRisco, expected) => {
    const data = buildViews({ empresaNome: 'Teste', rollup, evolucao: {
      ...evolucao, cargos: [{ ...evolucao.cargos[0], elegiveis, ativados, consumiram, evidencias, emRisco }],
    } })!;
    expect(data.rh.cargos[0].acao).toContain(expected);
  });

  it('entrega PDF privado de RH por área e respeita a marca da empresa', async () => {
    const res = await GET(request('&publico=rh&view=inline'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="engajamento-empresa-teste-rh.pdf"');
    const props = mock.render.mock.calls[0][0].props;
    expect(props.mostrarVertho).toBe(false);
    expect(props.data.focusItems[0].name).toBe('Operações');
    expect(props.data.cargos[0]).toMatchObject({ cargo: 'Analista', participantes: 50, emRisco: 2 });
    expect(JSON.stringify(props)).not.toContain('Nome nominal restrito');
    expect(mock.evolution).toHaveBeenCalledWith(EMPRESA);
    expect(mock.rollup).toHaveBeenCalledWith(EMPRESA);
  });

  it('a visão do gestor leva as prioridades nominais ao PDF autorizado', async () => {
    const res = await GET(request('&publico=gestor'));
    expect(res.headers.get('content-disposition')).toContain('attachment;');
    expect(mock.render.mock.calls[0][0].props.data.focusItems[0].name).toBe('Nome nominal restrito');
  });

  it('não gera um PDF zerado quando falha a leitura da evolução', async () => {
    mock.evolution.mockResolvedValue({ ok: false, error: 'Banco indisponível' });
    expect((await GET(request())).status).toBe(500);
    expect(mock.render).not.toHaveBeenCalled();
  });

  it('não gera um PDF quando falha o agregado ou a empresa não existe', async () => {
    mock.rollup.mockResolvedValue({ resumo: { erro: 'Falha de consulta' } });
    expect((await GET(request())).status).toBe(500);
    mock.empresa.mockResolvedValue({ data: null, error: null });
    expect((await GET(request())).status).toBe(404);
    expect(mock.render).not.toHaveBeenCalled();
  });
});
