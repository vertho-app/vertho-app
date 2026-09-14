import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  resolveTenant: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/lib/tenant-resolver', () => ({
  getTenantSlug: (request: Request) => request.headers.get('x-tenant-slug'),
  resolveTenant: mock.resolveTenant,
}));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({ storage: { from: () => ({ download: mock.download }) } }),
}));

import { issueEngagementReportShareToken } from '@/lib/engajamento/report-share-link';
import { GET } from '@/app/relatorios/engajamento/[token]/route';

const EMPRESA = '44b632ae-b7b9-440d-bc74-92cead889d52';
const PATH = 'engajamento-rh/projetomacae/2026-09-14/engajamento-macae-rh-2026-09-14.pdf';

function request(tenant: string) {
  return new Request(`https://${tenant}.vertho.ai/relatorios/engajamento/token`, {
    headers: { 'x-tenant-slug': tenant },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'segredo-de-teste-que-nao-vai-para-o-token');
  mock.resolveTenant.mockResolvedValue({ id: EMPRESA, slug: 'projetomacae' });
  mock.download.mockResolvedValue({ data: new Blob(['%PDF-1.7']), error: null });
});

describe('rota pública do relatório de engajamento', () => {
  it('serve o PDF privado no domínio do tenant sem revelar o Supabase', async () => {
    const token = issueEngagementReportShareToken({
      tenantSlug: 'projetomacae', empresaId: EMPRESA, storagePath: PATH,
    });
    const response = await GET(request('projetomacae'), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('engajamento-macae-rh-2026-09-14.pdf');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(await response.text()).toBe('%PDF-1.7');
    expect(mock.download).toHaveBeenCalledWith(PATH);
  });

  it('recusa o mesmo token em outro subdomínio antes de ler o arquivo', async () => {
    const token = issueEngagementReportShareToken({
      tenantSlug: 'projetomacae', empresaId: EMPRESA, storagePath: PATH,
    });
    const response = await GET(request('ibipeba'), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(404);
    expect(mock.resolveTenant).not.toHaveBeenCalled();
    expect(mock.download).not.toHaveBeenCalled();
  });

  it('recusa quando o slug resolve para outra empresa', async () => {
    mock.resolveTenant.mockResolvedValue({ id: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', slug: 'projetomacae' });
    const token = issueEngagementReportShareToken({
      tenantSlug: 'projetomacae', empresaId: EMPRESA, storagePath: PATH,
    });
    const response = await GET(request('projetomacae'), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
});
