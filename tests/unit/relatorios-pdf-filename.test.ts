import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { contentDispositionHeader } from '@/lib/http/content-disposition';

let armazenado = true;
let empresa = 'Grupo Sinal — Demonstração';
const sb = criarSupabaseMock({
  resolver: (tabela) => tabela === 'relatorios'
    ? { id: 'rel-1', empresa_id: 'emp-1', tipo: 'rh', pdf_path: armazenado ? 'rel.pdf' : null, conteudo: {} }
    : tabela === 'empresas' ? { nome: empresa } : null,
});
sb.client.storage = { from: () => ({
  download: async () => ({ data: new Blob(['%PDF-1.7 teste']), error: null }),
  upload: async () => ({ error: null }),
}) };
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ role: 'rh', empresaId: 'emp-1' }),
  assertTenantAccess: () => null, assertColabAccess: () => null,
}));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: async () => ({}), nomeArquivoMarca: (v: string) => v }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => Buffer.from('%PDF-1.7 gerado') }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioGestor', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioRH', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoExecutivo', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoNR1', () => ({ default: () => null }));
import { GET } from '@/app/api/relatorios/pdf/route';

describe('nome de PDF no cabeçalho HTTP', () => {
  beforeEach(() => { armazenado = true; empresa = 'Grupo Sinal — Demonstração'; sb.reset(); });
  for (const modo of ['inline', 'attachment']) for (const storage of [true, false]) {
    it(`${modo}, ${storage ? 'armazenado' : 'gerado'}: RH Sinal devolve PDF sem ByteString error`, async () => {
      armazenado = storage;
      const r = await GET(new Request(`https://rh-sinal.vertho.ai/api/relatorios/pdf?id=rel-1&view=${modo}`));
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('application/pdf');
      expect(r.headers.get('x-pdf-source')).toBe(storage ? 'storage' : 'generated');
      expect(r.headers.get('content-disposition')).toContain(`${modo}; filename="`);
      expect(r.headers.get('content-disposition')).toContain("filename*=UTF-8''vertho-rh-grupo-sinal-%E2%80%94-demonstra%C3%A7%C3%A3o.pdf");
      expect(await r.text()).toMatch(/^%PDF-/);
    });
  }
  it('aspas, quebras de linha, apóstrofo e alfabetos não latinos não quebram nem injetam cabeçalhos', () => {
    const value = contentDispositionHeader('Relatório "São João" — 学校 (A)\r\nX-Injected: sim.pdf');
    const headers = new Headers({ 'Content-Disposition': value });
    expect(headers.has('X-Injected')).toBe(false);
    expect(value).toMatch(/^[\x20-\x7e]+$/);
    expect(value).toContain('%22S%C3%A3o');
    expect(value).toContain('%E5%AD%A6%E6%A0%A1');
    expect(contentDispositionHeader("d'Ávila.pdf")).toContain("d%27%C3%81vila.pdf");
  });
});
