import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Precedência do MATCH EXATO na escolha do módulo-base.
 *
 * Nasceu de uma regressão medida em 28/07, ao preencher os embeddings do acervo: o
 * cosseno de dois textos IGUAIS dá ~0,9, não 1,0 — e isso deixou um módulo de assunto
 * vizinho ("Identificação de custos", nota 10) vencer o de nome idêntico ("Formação
 * básica de preço", nota 9,9) por 0,1 de nota. Com tokens, exato valia 1.00 e era
 * imbatível; a semântica não pode custar essa garantia — ela serve para PARÁFRASE.
 *
 * Só foi visto porque a decisão foi fotografada antes e depois do backfill.
 */
const fetchMock = vi.fn();

function sbStub(modulos: any[]) {
  const q: any = {
    select: () => q, eq: () => q, or: () => q, ilike: () => q, is: () => q,
    then: (res: any) => res({ data: modulos }),
  };
  return {
    from: (t: string) => {
      if (t === 'competencias_base') return { select: () => ({ ilike: () => Promise.resolve({ data: [{ id: 'cb1' }] }) }) };
      if (t === 'competencias') return { select: () => ({ eq: () => ({ ilike: () => ({ eq: () => Promise.resolve({ data: [{ id: 'c1' }] }) }) }) }) };
      return q;
    },
  } as any;
}

/** Vetor "quase igual" ao da query: simula o cosseno ~0,9 de texto idêntico. */
const vetorQuase = Array.from({ length: 8 }, (_, i) => (i === 0 ? 0.9 : 0.1));
const vetorOutro = Array.from({ length: 8 }, (_, i) => (i === 0 ? 0.95 : 0.05));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('EMBEDDING_PROVIDER', 'voyage');
  vi.stubEnv('VOYAGE_API_KEY', 'k');
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: Array.from({ length: 8 }, (_, i) => (i === 0 ? 1 : 0)) }] }) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('resolverModuloBaseParaConteudo — match exato tem precedência', () => {
  it('nome idêntico vence módulo de nota maior com cosseno alto', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbStub([
      // vizinho: nota 10 e embedding "melhor"
      { id: 'vizinho', descritor: 'Identificação de custos', titulo: 'Conhecer os custos', empresa_id: 'e1',
        auditoria_ia: { nota: 10 }, descritor_embedding: vetorOutro, nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR' },
      // exato: nota 9.9
      { id: 'exato', descritor: 'Formação básica de preço', titulo: 'Formar o preço', empresa_id: 'e1',
        auditoria_ia: { nota: 9.9 }, descritor_embedding: vetorQuase, nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR' },
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: 'Gestão Financeira Básica', descritor: 'Formação básica de preço',
      cargo: 'MEI', empresaId: 'e1', nivelMin: 1.0,
    });

    expect(r?.modulo?.id).toBe('exato');
    expect(r?.criterio).toContain('descritor-exato(1.00)');
  });

  it('sem nome idêntico, a semântica decide (é para isso que ela serve)', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbStub([
      { id: 'longe', descritor: 'Outro tema qualquer', titulo: 't', empresa_id: 'e1',
        auditoria_ia: { nota: 9 }, descritor_embedding: Array.from({ length: 8 }, () => 0.1), nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR' },
      { id: 'perto', descritor: 'Precificação para autônomos', titulo: 't', empresa_id: 'e1',
        auditoria_ia: { nota: 9 }, descritor_embedding: vetorOutro, nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR' },
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: 'Gestão Financeira Básica', descritor: 'Formação básica de preço',
      cargo: 'MEI', empresaId: 'e1', nivelMin: 1.0,
    });

    expect(r?.modulo?.id).toBe('perto');
    expect(r?.criterio).toMatch(/sem[âa]ntico/);
  });

  it('exato é insensível a acento e caixa (a régua usa CAIXA ALTA em alguns cargos)', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbStub([
      { id: 'caixa-alta', descritor: 'REGULAÇÃO SOB PRESSÃO', titulo: 't', empresa_id: 'e1',
        auditoria_ia: { nota: 8 }, descritor_embedding: null, nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR' },
      { id: 'outro', descritor: 'Tema distante', titulo: 't', empresa_id: 'e1',
        auditoria_ia: { nota: 10 }, descritor_embedding: null, nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR' },
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: 'Autocuidado', descritor: 'Regulação sob pressão',
      cargo: 'Coordenação Pedagógica', empresaId: 'e1', nivelMin: 1.0,
    });

    expect(r?.modulo?.id).toBe('caixa-alta');
    expect(r?.criterio).toContain('descritor-exato');
  });
});
