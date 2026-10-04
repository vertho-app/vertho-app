import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-67 item 2 (onda D): a pessoa baixa o PRÓPRIO PDI (`baixarMeuPdiPdf`).
 *
 *  - o PDF sai no idioma dela (`colaboradores.locale`, senão o da empresa, senão pt-BR);
 *  - o arquivo guardado diz o idioma em que nasceu; em outro idioma, é gerado de novo e passa a
 *    ser o dela (é o PDI dela: o idioma dela é o do arquivo);
 *  - o erro volta com um CÓDIGO estável (`codigo`) que a tela traduz (`Pdf.download.errors.*`), como
 *    o login faz; o texto em pt-BR segue em `error` só para o log e para quem ainda o lê.
 */
const h = vi.hoisted(() => ({
  email: 'ana@acme.com' as string | null,
  colab: { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Analista', empresa_id: 'emp-1' } as any,
  rel: null as any,
  idioma: 'pt-BR' as string,
  renders: [] as any[],
  uploads: [] as string[],
  uploadErro: null as any,
  assinaturaErro: null as any,
  sb: null as any,
}));

vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => h.email }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => h.colab }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: async () => ({ logoBase64: null, mostrarVertho: true }), nomeArquivoMarca: (v: string) => v }));
vi.mock('@/lib/pdf-locale', async (original) => ({
  ...(await original<typeof import('@/lib/pdf-locale')>()),
  idiomaDaPessoa: async () => h.idioma,
}));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async (el: any) => { h.renders.push(el.props); return Buffer.from('%PDF-1.7'); } }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/lib/demo/convidado-demo', () => ({ totalDoMapeamento: () => 0 }));
vi.mock('@/lib/demo/degustacao-mapeamento', () => ({ colaboradorEmDegustacao: async () => false }));

import { baixarMeuPdiPdf, loadPDI } from '@/app/dashboard/pdi/pdi-actions';

const montar = () => {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => (tabela === 'relatorios' ? h.rel : tabela === 'empresas' ? { nome: 'Acme' } : null),
  });
  h.sb.client.storage = {
    from: () => ({
      upload: async (path: string) => { if (h.uploadErro) return { error: h.uploadErro }; h.uploads.push(path); return { error: null }; },
      createSignedUrl: async (path: string) => (h.assinaturaErro
        ? { data: null, error: h.assinaturaErro }
        : { data: { signedUrl: `https://storage/${path}` }, error: null }),
    }),
  };
};

const relatorio = (pdf_path: string | null) => ({
  id: 'rel-1', empresa_id: 'emp-1', colaborador_id: 'c1', pdf_path, gerado_em: '2026-09-01T00:00:00Z', conteudo: { competencias: [] },
});

beforeEach(() => {
  h.email = 'ana@acme.com';
  h.rel = relatorio('emp-1/individual-ana-1.pdf');
  h.idioma = 'pt-BR';
  h.renders = [];
  h.uploads = [];
  h.uploadErro = null;
  h.assinaturaErro = null;
  montar();
});

describe('baixarMeuPdiPdf: o idioma da pessoa', () => {
  it('guardado em pt-BR e pessoa pt-BR: usa o guardado, sem renderizar', async () => {
    const r: any = await baixarMeuPdiPdf();
    expect(r.success).toBe(true);
    expect(r.url).toContain('emp-1/individual-ana-1.pdf');
    expect(h.renders).toHaveLength(0);
    expect(h.uploads).toHaveLength(0);
  });

  it('guardado no idioma da pessoa: usa o guardado', async () => {
    h.idioma = 'en-US';
    h.rel = relatorio('emp-1/individual-ana-1.en-US.pdf');
    montar();
    const r: any = await baixarMeuPdiPdf();
    expect(r.url).toContain('individual-ana-1.en-US.pdf');
    expect(h.renders).toHaveLength(0);
  });

  it('🔴 guardado em pt-BR e pessoa es-ES: gera de novo em es-ES, guarda com a marca e passa a ser o arquivo dela', async () => {
    h.idioma = 'es-ES';
    const r: any = await baixarMeuPdiPdf();
    expect(h.renders).toHaveLength(1);
    expect(h.renders[0].locale).toBe('es-ES');
    expect(h.uploads[0]).toMatch(/^emp-1\/individual-.+-\d+\.es-ES\.pdf$/);
    const troca = h.sb.escritas.find((e: any) => e.tabela === 'relatorios' && e.op === 'update');
    expect(troca.payload.pdf_path).toBe(h.uploads[0]);
    expect(r.url).toContain('.es-ES.pdf');
  });

  it('sem PDF guardado e pessoa pt-BR: gera e guarda no formato de sempre (sem marca)', async () => {
    h.rel = relatorio(null);
    montar();
    await baixarMeuPdiPdf();
    expect(h.renders[0].locale).toBe('pt-BR');
    expect(h.uploads[0]).not.toMatch(/\.(pt-BR|pt-PT|es-ES|en-US)\.pdf$/);
  });

  it('o nome do arquivo baixado não muda de contrato com o idioma', async () => {
    h.idioma = 'en-US';
    const r: any = await baixarMeuPdiPdf();
    expect(r.filename).toBe('vertho-pdi-ana-souza.pdf');
  });
});

describe('baixarMeuPdiPdf: erro com código estável', () => {
  it('sem sessão', async () => {
    h.email = null;
    expect(await baixarMeuPdiPdf()).toEqual({ error: 'Não autenticado', codigo: 'nao_autenticado' });
  });

  it('sem cadastro', async () => {
    h.colab = null;
    expect(await baixarMeuPdiPdf()).toMatchObject({ codigo: 'colaborador_nao_encontrado' });
    h.colab = { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Analista', empresa_id: 'emp-1' };
  });

  it('sem PDI', async () => {
    h.rel = null;
    montar();
    expect(await baixarMeuPdiPdf()).toMatchObject({ codigo: 'pdi_nao_encontrado' });
  });

  it('upload falhou: código de salvar, e o detalhe técnico vai ao log', async () => {
    h.idioma = 'es-ES';
    h.uploadErro = { message: 'bucket cheio' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r: any = await baixarMeuPdiPdf();
      expect(r.codigo).toBe('falha_salvar');
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('link assinado falhou: código de link', async () => {
    h.assinaturaErro = { message: 'expirou' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await baixarMeuPdiPdf() as any).codigo).toBe('falha_link');
    } finally {
      log.mockRestore();
    }
  });

  it('o carregamento da página também devolve código (sessão e cadastro)', async () => {
    h.email = null;
    expect(await loadPDI()).toEqual({ error: 'Não autenticado', codigo: 'nao_autenticado' });
    h.email = 'ana@acme.com';
    h.colab = null;
    expect(await loadPDI()).toMatchObject({ codigo: 'colaborador_nao_encontrado' });
    h.colab = { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Analista', empresa_id: 'emp-1' };
  });

  it('a tela traduz o código (Pdf.download.errors.*) e só cai no texto cru quando não há código', () => {
    const pagina = readFileSync('app/dashboard/pdi/page.tsx', 'utf8');
    expect(pagina).toContain("const tPdf = useTranslations('Pdf');");
    expect(pagina).toContain('tPdf(`download.errors.${r.codigo}`)');
    expect(pagina).toContain('tPdf(`download.errors.${result.codigo}`)');
  });
});
