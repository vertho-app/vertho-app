/**
 * Marca dos PDFs por tenant (`lib/pdf-marca.ts`) e a invariante que importa:
 * com `mostrarVertho: false`, NENHUM texto do PDI pode conter "vertho".
 *
 * O segundo bloco não renderiza PDF de verdade (isso baixaria fontes da CDN e
 * deixaria o CI refém de rede): percorre a árvore de elementos React invocando
 * os componentes-função, que aqui são puros, e junta todas as strings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resposta: { data: null as any, error: null as any },
  fetchOk: true,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => mocks.resposta }) }),
    }),
  }),
}));

vi.mock('@/lib/pdf-assets', () => ({
  getLogoCoverBase64: () => 'data:image/png;base64,LOGO-VERTHO',
  getReportCoverBgBase64: () => null,
  getLogoDarkBase64: () => null,
  getLogoDarkHBase64: () => null,
  getIconDarkBase64: () => null,
}));

const { resolverMarcaPdf, nomeArquivoMarca, resetMarcaPdfCache } = await import('@/lib/pdf-marca');

beforeEach(() => {
  resetMarcaPdfCache();
  mocks.resposta = { data: null, error: null };
  vi.restoreAllMocks();
});

describe('resolverMarcaPdf', () => {
  it('sem a flag: marca Vertho (comportamento de sempre)', async () => {
    mocks.resposta = { data: { sys_config: {}, ui_config: {} }, error: null };
    const m = await resolverMarcaPdf('emp-1');
    expect(m.mostrarVertho).toBe(true);
    expect(m.logoBase64).toContain('LOGO-VERTHO');
  });

  it('com a flag e SEM opt-in de logo: sem marca e sem imagem nenhuma', async () => {
    mocks.resposta = {
      data: { sys_config: { pdf_sem_marca: true }, ui_config: { logo_url: 'https://x/logo.jpg' } },
      error: null,
    };
    vi.stubGlobal('fetch', async () => { throw new Error('não deveria buscar o logo'); });
    const m = await resolverMarcaPdf('emp-5');
    expect(m.mostrarVertho).toBe(false);
    expect(m.logoBase64).toBeNull();
  });

  it('com a flag + pdf_logo_tenant: usa o logo do TENANT', async () => {
    mocks.resposta = {
      data: {
        sys_config: { pdf_sem_marca: true, pdf_logo_tenant: true },
        ui_config: { logo_url: 'https://x/logo.jpg' },
      },
      error: null,
    };
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    const m = await resolverMarcaPdf('emp-2');
    expect(m.mostrarVertho).toBe(false);
    expect(m.logoBase64).toMatch(/^data:image\/jpeg;base64,/);
    expect(m.logoBase64).not.toContain('LOGO-VERTHO');
  });

  it('logo do tenant indisponível: fica SEM logo, nunca cai no da Vertho', async () => {
    mocks.resposta = {
      data: {
        sys_config: { pdf_sem_marca: true, pdf_logo_tenant: true },
        ui_config: { logo_url: 'https://x/logo.jpg' },
      },
      error: null,
    };
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, headers: { get: () => null } }));
    const m = await resolverMarcaPdf('emp-3');
    expect(m.mostrarVertho).toBe(false);
    expect(m.logoBase64).toBeNull();
  });

  it('erro de leitura mantém a marca padrão (não inventa white-label)', async () => {
    mocks.resposta = { data: null, error: { message: 'conexão caiu' } };
    const m = await resolverMarcaPdf('emp-4');
    expect(m.mostrarVertho).toBe(true);
  });

  it('nomeArquivoMarca tira o "vertho-" do arquivo baixado', () => {
    expect(nomeArquivoMarca('vertho-pdi', { logoBase64: null, mostrarVertho: true })).toBe('vertho-pdi');
    expect(nomeArquivoMarca('vertho-pdi', { logoBase64: null, mostrarVertho: false })).toBe('pdi');
    expect(nomeArquivoMarca('vertho', { logoBase64: null, mostrarVertho: false })).toBe('relatorio');
  });
});

/** Junta todo texto da árvore, invocando os componentes-função (puros). */
function textoDaArvore(node: any, profundidade = 0): string[] {
  if (node == null || node === false) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((n) => textoDaArvore(n, profundidade));
  if (profundidade > 60) return [];

  const saida: string[] = [];
  // Props que carregam texto sem ser children (ex.: `linha`, `tagline`).
  for (const [k, v] of Object.entries(node.props || {})) {
    if (k !== 'children' && typeof v === 'string' && v.length > 2) saida.push(v);
  }
  if (typeof node.type === 'function') {
    try {
      saida.push(...textoDaArvore(node.type(node.props), profundidade + 1));
    } catch {
      /* componente que depende de runtime do react-pdf — ignora */
    }
  }
  saida.push(...textoDaArvore(node.props?.children, profundidade + 1));
  return saida;
}

describe('PDI: nenhuma identificação Vertho com mostrarVertho=false', () => {
  const data = {
    conteudo: {
      acolhimento: 'Olá',
      mensagem_final: 'Bom trabalho',
      competencias: [{ nome: 'Conhecimento das normas', nivel_atual: 2, nivel_meta: 3 }],
    },
    colaborador_nome: 'Fulano de Tal',
    colaborador_cargo: 'Diretor(a) Escolar',
    gerado_em: '2026-08-17T12:00:00Z',
  };

  it('com marca (default), o documento MENCIONA a Vertho — se não, o teste abaixo não prova nada', async () => {
    const { default: PDI } = await import('@/components/pdf/RelatorioIndividual');
    const React = (await import('react')).default;
    const textos = textoDaArvore(React.createElement(PDI as any, { data, empresaNome: 'X' }));
    expect(textos.join(' | ').toLowerCase()).toContain('vertho');
  });

  it('sem marca, NENHUM texto contém "vertho"', async () => {
    const { default: PDI } = await import('@/components/pdf/RelatorioIndividual');
    const React = (await import('react')).default;
    const textos = textoDaArvore(
      React.createElement(PDI as any, { data, empresaNome: 'X', mostrarVertho: false }),
    );
    const suspeitos = textos.filter((t) => /vertho/i.test(t));
    expect(suspeitos, `textos com a marca: ${suspeitos.join(' · ')}`).toEqual([]);
  });
});
