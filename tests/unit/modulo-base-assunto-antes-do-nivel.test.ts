import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Escolha do módulo-base: o ASSUNTO vem antes do nível, e o código da matriz não atrapalha o nome.
 *
 * Nasceu do teste de ranqueamento de 29/09/2026, que rodou o resolver de produção nos 97 casos reais:
 * - no demo escolar, a semana de "Ritmo e transições" (alvo N1→N2) ancorava no módulo de "Recursos
 *   didáticos", porque o laço parava na primeira transição com QUALQUER candidato e o módulo certo
 *   está em N2→N3;
 * - na Coordenação de Ibipeba, o descritor chega com o código da matriz na frente e a regra do nome
 *   idêntico não disparava (a escolha caía no cosseno, com 0,53 num dos casos).
 *
 * O stub de `modulos_base_conteudo` respeita os filtros de nível e locale: o de
 * `modulo-base-match-exato.test.ts` devolve a mesma lista em qualquer transição e não enxergaria isto.
 */
const fetchMock = vi.fn();
const TRAVESSAO = '—';
const MEIA_RISCA = '–';

function sbPorNivel(modulos: any[]) {
  return {
    from: (t: string) => {
      if (t === 'competencias_base') return { select: () => ({ ilike: () => Promise.resolve({ data: [{ id: 'cb1' }], error: null }) }) };
      if (t === 'competencias') return { select: () => ({ eq: () => ({ ilike: () => Promise.resolve({ data: [], error: null }) }) }) };
      const filtros: Record<string, any> = {};
      const q: any = {
        select: () => q, or: () => q, is: () => q, ilike: () => q, not: () => q, limit: () => q,
        eq: (coluna: string, valor: any) => { filtros[coluna] = valor; return q; },
        then: (res: any) => res({
          data: t === 'modulos_base_conteudo'
            ? modulos.filter((m) => ['nivel_entrada', 'nivel_destino', 'locale'].every((c) => filtros[c] === undefined || m[c] === filtros[c]))
            : [],
          error: null,
        }),
      };
      return q;
    },
  } as any;
}

const mb = (id: string, descritor: string, entrada: string, destino: string, extra: any = {}) => ({
  id, descritor, titulo: descritor, empresa_id: 'e1', auditoria_ia: { nota: 6 },
  nivel_entrada: entrada, nivel_destino: destino, locale: 'pt-BR', ...extra,
});
const opcoes = (descritor: string) => ({
  competenciaNome: 'Didática e estratégias de ensino', descritor, cargo: 'Professor(a)', empresaId: 'e1', nivelMin: 1.0,
});

/** Vetor "quase igual" ao da consulta: simula o cosseno ~0,9 de texto idêntico. */
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

describe('resolverModuloBaseParaConteudo: assunto antes do nível', () => {
  it('nome idêntico no nível vizinho vence módulo de outro descritor no nível exato', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbPorNivel([
      mb('recursos', 'Recursos didáticos', 'N1', 'N2'),
      mb('ritmo', 'Ritmo e transições', 'N2', 'N3'),
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, opcoes('Ritmo e transições'));

    expect(r?.modulo?.id).toBe('ritmo');
    expect(r?.criterio).toContain('descritor-exato(1.00)');
    expect(r?.criterio).toContain('fallback-nivel');
  });

  it('sem nome idêntico em nenhum nível, fica o nível mais próximo, como antes', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbPorNivel([
      mb('recursos', 'Recursos didáticos', 'N1', 'N2'),
      mb('mediacao', 'Mediação da aprendizagem', 'N2', 'N3'),
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, opcoes('Ritmo e transições'));

    expect(r?.modulo?.id).toBe('recursos');
    expect(r?.criterio).not.toContain('fallback-nivel');
  });

  it('nome idêntico no nível exato continua vencendo o do nível vizinho', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbPorNivel([
      mb('ritmo-n1', 'Ritmo e transições', 'N1', 'N2'),
      mb('ritmo-n2', 'Ritmo e transições', 'N2', 'N3', { auditoria_ia: { nota: 10 } }),
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, opcoes('Ritmo e transições'));

    expect(r?.modulo?.id).toBe('ritmo-n1');
    expect(r?.criterio).not.toContain('fallback-nivel');
  });
});

describe('código da matriz na frente do descritor', () => {
  it('não derruba a regra do nome idêntico', async () => {
    const { resolverModuloBaseParaConteudo } = await import('@/lib/season-engine/modulo-base-integration');
    const sb = sbPorNivel([
      // vizinho: nota 10 e embedding "melhor"; certo: o nome, em caixa alta, sem o código
      mb('vizinho', 'Sustentabilidade pessoal', 'N1', 'N2', { auditoria_ia: { nota: 10 }, descritor_embedding: vetorOutro }),
      mb('certo', 'PROTAGONISMO DO BEM-ESTAR', 'N1', 'N2', { auditoria_ia: { nota: 9.9 }, descritor_embedding: vetorQuase }),
    ]);

    const r: any = await resolverModuloBaseParaConteudo(sb, {
      ...opcoes(`COO03_D5 ${TRAVESSAO} Protagonismo do bem-estar`),
      competenciaNome: 'Autocuidado e resiliência emocional', cargo: 'Coordenação Pedagógica',
    });

    expect(r?.modulo?.id).toBe('certo');
    expect(r?.criterio).toContain('descritor-exato(1.00)');
  });

  it('descritorSemCodigo tira só código de matriz seguido de separador', async () => {
    const { descritorSemCodigo } = await import('@/lib/season-engine/modulo-base-integration');
    // Formatos de código vistos em competencias.cod_desc (29/09/2026).
    expect(descritorSemCodigo(`COO03_D5 ${TRAVESSAO} Protagonismo do bem-estar`)).toBe('Protagonismo do bem-estar');
    expect(descritorSemCodigo('COO01-D04 - Planejamento semanal')).toBe('Planejamento semanal');
    expect(descritorSemCodigo('EMPREG06-D02: Escuta ativa')).toBe('Escuta ativa');
    expect(descritorSemCodigo(`G06.6 ${MEIA_RISCA} Feedback`)).toBe('Feedback');
    expect(descritorSemCodigo(`LD01_D3 ${TRAVESSAO} Delegação`)).toBe('Delegação');
    // Nome comum fica intacto, mesmo com número ou hífen.
    expect(descritorSemCodigo('Ritmo e transições')).toBe('Ritmo e transições');
    expect(descritorSemCodigo('B2B - vendas consultivas')).toBe('B2B - vendas consultivas');
    expect(descritorSemCodigo('Gestão 360 - visão')).toBe('Gestão 360 - visão');
    expect(descritorSemCodigo('ISO9001 - requisitos')).toBe('ISO9001 - requisitos');
    expect(descritorSemCodigo('COO03_D4')).toBe('COO03_D4');
    expect(descritorSemCodigo(undefined)).toBe('');
  });
});
