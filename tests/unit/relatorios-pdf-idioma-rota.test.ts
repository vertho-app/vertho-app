import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-67 item 2 (onda D): a rota `/api/relatorios/pdf` entrega o PDF no idioma de quem BAIXA.
 *
 * O arquivo guardado diz em que idioma nasceu no próprio nome (`.pt-PT.pdf`...; sem marca é
 * pt-BR, porque todo PDF anterior à onda D é pt-BR). A rota:
 *  - serve o guardado quando o idioma casa;
 *  - renderiza de novo no idioma de quem baixa quando não casa, e SÓ troca o arquivo guardado
 *    quando quem baixa é o DONO do relatório;
 *  - guarda o PDF novo com a marca do idioma quando ainda não havia arquivo;
 *  - não muda o nome do arquivo baixado (contrato de `relatorios-pdf-filename`).
 */
const estado = vi.hoisted(() => ({
  ctx: null as any,
  rel: null as any,
  leitor: 'pt-BR' as string,
  renders: [] as any[],
  uploads: [] as string[],
  downloadFalha: false,
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'relatorios') return estado.rel;
    if (tabela === 'empresas') return { nome: 'Empresa A' };
    if (tabela === 'colaboradores') return { nome_completo: 'Ana Souza', cargo: 'Analista' };
    return null;
  },
});
sb.client.storage = {
  from: () => ({
    download: async () => (estado.downloadFalha
      ? { data: null, error: { message: 'sumiu' } }
      : { data: new Blob(['%PDF-1.7 salvo']), error: null }),
    upload: async (path: string) => { estado.uploads.push(path); return { error: null }; },
  }),
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/request-context', async (original) => ({
  ...(await original<typeof import('@/lib/auth/request-context')>()),
  requireUser: async () => estado.ctx,
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/pdf-locale', async (original) => ({
  ...(await original<typeof import('@/lib/pdf-locale')>()),
  idiomaDoLeitor: async () => estado.leitor,
}));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: async () => ({}), nomeArquivoMarca: (v: string) => v }));
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: async (el: any) => { estado.renders.push(el.props); return Buffer.from('%PDF-1.7 gerado'); },
}));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioGestor', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioRH', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoExecutivo', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoNR1', () => ({ default: () => null }));

import { GET } from '@/app/api/relatorios/pdf/route';

const EMPRESA = 'emp-a';
const sessao = (role: string, colabId: string) => ({
  email: `${colabId}@empresa-a.com`,
  colaborador: { id: colabId, email: `${colabId}@empresa-a.com`, empresa_id: EMPRESA, role },
  role, empresaId: EMPRESA, isPlatformAdmin: false,
});
const baixar = () => GET(new Request('https://empresa-a.vertho.ai/api/relatorios/pdf?id=rel-1'));
const atualizacoes = () => sb.escritas.filter((e) => e.tabela === 'relatorios' && e.op === 'update');

describe('/api/relatorios/pdf entrega no idioma de quem baixa', () => {
  beforeEach(() => {
    sb.reset();
    estado.renders = [];
    estado.uploads = [];
    estado.downloadFalha = false;
    estado.leitor = 'pt-BR';
    estado.ctx = sessao('rh', 'rh-1');
  });

  describe('PDI (individual)', () => {
    const relatorio = (pdf_path: string | null) => ({
      id: 'rel-1', empresa_id: EMPRESA, tipo: 'individual', colaborador_id: 'colab-1', pdf_path, conteudo: { competencias: [] },
    });

    it('guardado em pt-BR e leitor pt-BR: serve o guardado, sem renderizar nem gravar', async () => {
      estado.rel = relatorio('emp-a/individual-ana-1.pdf');
      const r = await baixar();
      expect(r.status).toBe(200);
      expect(r.headers.get('x-pdf-source')).toBe('storage');
      expect(r.headers.get('x-pdf-locale')).toBe('pt-BR');
      expect(estado.renders).toHaveLength(0);
      expect(estado.uploads).toHaveLength(0);
    });

    it('guardado em en-US e leitor en-US: serve o guardado', async () => {
      estado.rel = relatorio('emp-a/individual-ana-1.en-US.pdf');
      estado.leitor = 'en-US';
      const r = await baixar();
      expect(r.headers.get('x-pdf-source')).toBe('storage');
      expect(r.headers.get('x-pdf-locale')).toBe('en-US');
      expect(estado.renders).toHaveLength(0);
    });

    it('🔴 guardado em pt-BR e leitor es-ES: renderiza em es-ES (não entrega o pt-BR)', async () => {
      estado.rel = relatorio('emp-a/individual-ana-1.pdf');
      estado.leitor = 'es-ES';
      const r = await baixar();
      expect(r.status).toBe(200);
      expect(r.headers.get('x-pdf-source')).toBe('generated');
      expect(r.headers.get('x-pdf-locale')).toBe('es-ES');
      expect(estado.renders).toHaveLength(1);
      expect(estado.renders[0].locale).toBe('es-ES');
    });

    it('idioma diferente e leitor que NÃO é o dono: o arquivo guardado não é trocado', async () => {
      estado.rel = relatorio('emp-a/individual-ana-1.pdf');
      estado.leitor = 'es-ES';
      await baixar();
      expect(estado.uploads).toHaveLength(0);
      expect(atualizacoes()).toHaveLength(0);
    });

    it('idioma diferente e leitor É o dono do PDI: o PDF novo, com a marca do idioma, passa a ser o guardado', async () => {
      estado.rel = relatorio('emp-a/individual-ana-1.pdf');
      estado.leitor = 'pt-PT';
      estado.ctx = sessao('colaborador', 'colab-1');
      await baixar();
      expect(estado.uploads).toHaveLength(1);
      expect(estado.uploads[0]).toMatch(/^emp-a\/individual-.+-\d+\.pt-PT\.pdf$/);
      expect(atualizacoes()).toHaveLength(1);
      expect(atualizacoes()[0].payload.pdf_path).toBe(estado.uploads[0]);
    });

    it('sem PDF guardado: gera no idioma de quem baixa e guarda com a marca do idioma', async () => {
      estado.rel = relatorio(null);
      estado.leitor = 'en-US';
      const r = await baixar();
      expect(r.headers.get('x-pdf-source')).toBe('generated');
      expect(estado.renders[0].locale).toBe('en-US');
      expect(estado.uploads[0]).toMatch(/\.en-US\.pdf$/);
      expect(atualizacoes()[0].payload.pdf_path).toBe(estado.uploads[0]);
    });

    it('sem PDF guardado e leitor pt-BR: o caminho guardado é o formato de sempre, sem marca', async () => {
      estado.rel = relatorio(null);
      await baixar();
      expect(estado.uploads[0]).toMatch(/^emp-a\/individual-.+-\d+\.pdf$/);
      expect(estado.uploads[0]).not.toMatch(/\.(pt-BR|pt-PT|es-ES|en-US)\.pdf$/);
    });

    it('download do guardado falhou: gera no idioma de quem baixa e regrava (como antes)', async () => {
      estado.rel = relatorio('emp-a/individual-ana-1.pdf');
      estado.downloadFalha = true;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const r = await baixar();
        expect(r.headers.get('x-pdf-source')).toBe('generated');
        expect(estado.uploads).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('Relatório do Gestor e Relatório RH', () => {
    it('RH baixa o relatório de RH guardado em pt-BR estando em en-US: renderiza em en-US, sem trocar o guardado (RH não tem dono)', async () => {
      estado.rel = { id: 'rel-1', empresa_id: EMPRESA, tipo: 'rh', colaborador_id: null, pdf_path: 'emp-a/rh-acme-1.pdf', conteudo: {} };
      estado.leitor = 'en-US';
      const r = await baixar();
      expect(r.headers.get('x-pdf-source')).toBe('generated');
      expect(estado.renders[0].locale).toBe('en-US');
      expect(estado.uploads).toHaveLength(0);
    });

    it('o gestor dono baixa o próprio relatório em es-ES: renderiza e o arquivo dele passa a ser o es-ES', async () => {
      estado.rel = { id: 'rel-1', empresa_id: EMPRESA, tipo: 'gestor', colaborador_id: 'gestor-1', pdf_path: 'emp-a/gestor-acme-1.pdf', conteudo: {} };
      estado.ctx = sessao('gestor', 'gestor-1');
      estado.leitor = 'es-ES';
      await baixar();
      expect(estado.renders[0].locale).toBe('es-ES');
      expect(estado.uploads[0]).toMatch(/\.es-ES\.pdf$/);
    });
  });

  it('o nome do arquivo baixado não muda de contrato com o idioma', async () => {
    estado.rel = { id: 'rel-1', empresa_id: EMPRESA, tipo: 'rh', colaborador_id: null, pdf_path: null, conteudo: {} };
    for (const idioma of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      estado.leitor = idioma;
      const r = await baixar();
      expect(r.headers.get('content-disposition')).toContain('vertho-rh-empresa-a.pdf');
    }
  });
});
