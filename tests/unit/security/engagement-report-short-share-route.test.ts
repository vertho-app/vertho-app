import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  resolveTenant: vi.fn(),
  list: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/lib/tenant-resolver', () => ({
  getTenantSlug: (request: Request) => request.headers.get('x-tenant-slug'),
  resolveTenant: mock.resolveTenant,
}));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({
    storage: { from: () => ({ list: mock.list, download: mock.download }) },
  }),
}));

import { issueEngagementReportShortShareUrl } from '@/lib/engajamento/report-share-link';
import { GET } from '@/app/r/e/[date]/[token]/route';

const EMPRESA = '44b632ae-b7b9-440d-bc74-92cead889d52';
const FILE = 'engajamento-macae-rh-2026-09-14.pdf';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'segredo-de-teste-que-nao-vai-para-o-token');
  mock.resolveTenant.mockResolvedValue({ id: EMPRESA, slug: 'macae' });
  mock.list.mockResolvedValue({ data: [{ name: FILE }], error: null });
  mock.download.mockResolvedValue({ data: new Blob(['%PDF-1.7']), error: null });
});

describe('rota curta do relatório de engajamento', () => {
  it('descobre o PDF da data e o serve no subdomínio assinado', async () => {
    const url = issueEngagementReportShortShareUrl({
      tenantSlug: 'macae', empresaId: EMPRESA, reportDate: '2026-09-14',
    });
    const parts = new URL(url).pathname.split('/');
    const response = await GET(new Request(url, { headers: { 'x-tenant-slug': 'macae' } }), {
      params: Promise.resolve({ date: parts.at(-2)!, token: parts.at(-1)! }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(await response.text()).toBe('%PDF-1.7');
    expect(mock.list).toHaveBeenCalledWith('engajamento-rh/macae/2026-09-14', { limit: 3 });
    expect(mock.download).toHaveBeenCalledWith(`engajamento-rh/macae/2026-09-14/${FILE}`);
  });

  it('recusa o token no host de outro tenant antes de listar o bucket', async () => {
    const url = issueEngagementReportShortShareUrl({
      tenantSlug: 'macae', empresaId: EMPRESA, reportDate: '2026-09-14',
    });
    const parts = new URL(url).pathname.split('/');
    mock.resolveTenant.mockResolvedValue({ id: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', slug: 'ibipeba' });
    const response = await GET(new Request(url, { headers: { 'x-tenant-slug': 'ibipeba' } }), {
      params: Promise.resolve({ date: parts.at(-2)!, token: parts.at(-1)! }),
    });
    expect(response.status).toBe(404);
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.download).not.toHaveBeenCalled();
  });

  it('falha fechado se houver zero ou mais de um PDF na data', async () => {
    const url = issueEngagementReportShortShareUrl({
      tenantSlug: 'macae', empresaId: EMPRESA, reportDate: '2026-09-14',
    });
    const parts = new URL(url).pathname.split('/');
    mock.list.mockResolvedValue({ data: [{ name: FILE }, { name: 'outro.pdf' }], error: null });
    const response = await GET(new Request(url, { headers: { 'x-tenant-slug': 'macae' } }), {
      params: Promise.resolve({ date: parts.at(-2)!, token: parts.at(-1)! }),
    });
    expect(response.status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
});
