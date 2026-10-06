import { describe, it, expect, vi, beforeEach } from 'vitest';

const coletar = vi.fn();
vi.mock('@/lib/pipeline-fluxo/coletar', async () => {
  const real = await vi.importActual<any>('@/lib/pipeline-fluxo/coletar');
  return { ...real, coletarEntradaPrevia: (...a: any[]) => coletar(...a) };
});

import { filaConteudoEscopo, formatosDaBiblioteca } from '@/lib/pipeline-fluxo/conteudo';

/**
 * A trilha aborta sem conteúdo-base, e o conteúdo de kit não serve à montagem. A fila de CONTEÚDOS responde: o que falta
 * (descritor × formato) para quem vai ter trilha montada, só nos formatos que as pessoas precisam.
 */
const pref = (p: Record<string, number>) => ({ pref_video_curto: 0, pref_video_longo: 0, pref_texto: 0, pref_audio: 0, pref_estudo_caso: 0, ...p });
const entrada = (over: Record<string, any> = {}) => ({
  pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'CAIXA' }],
  cargos: [{ nome: 'CAIXA', foco: ['Rotina'], top5: 1 }],
  respostas: [], filaIA4: [],
  assessments: [{ colaborador_id: 'p1', competencia: 'Rotina' }],
  blueprints: [], pdis: [], trilhas: [],
  ...over,
});

function bancoFalso(t: { prefs?: any[]; competencias?: any[]; base?: any[]; conteudos?: any[]; globais?: any[]; falhar?: string } = {}) {
  const tabela = (nome: string, raw: boolean) => {
    const linhas = (): any[] => {
      if (nome === 'colaboradores') return t.prefs ?? [{ id: 'p1', ...pref({}) }];
      if (nome === 'competencias') return t.competencias ?? [];
      if (nome === 'competencias_base') return t.base ?? [];
      if (nome === 'micro_conteudos') return raw ? (t.globais ?? []) : (t.conteudos ?? []);
      return [];
    };
    // `falhar` aceita a tabela ou `tabela:raw` (só a leitura do catálogo GLOBAL) / `tabela:tdb` (só a da empresa)
    const falha = t.falhar === nome || t.falhar === `${nome}:${raw ? 'raw' : 'tdb'}`;
    const resposta = (de = 0) => (falha ? { data: null, error: { message: 'boom' } } : { data: de === 0 ? linhas() : [], error: null });
    const q: any = {
      select: () => q, in: () => q, not: () => q, eq: () => q, is: () => q, order: () => q,
      range: (de: number) => Promise.resolve(resposta(de)),
      then: (res: any, rej: any) => Promise.resolve(resposta(0)).then(res, rej),
    };
    return q;
  };
  return { from: (n: string) => tabela(n, false), raw: { from: (n: string) => tabela(n, true) } };
}
const desc = (comp: string, cargo: string, ...nomes: string[]) => nomes.map((n) => ({ nome: comp, cargo, nome_curto: n }));
const mc = (descritor: string, extra: Record<string, any> = {}) => ({ competencia: 'Rotina', descritor, cargo: 'CAIXA', kit_id: null, disc: null, ...extra });
const chaves = (itens: any[]) => itens.map((i) => `${i.descritor}:${i.formato}`).sort();

beforeEach(() => coletar.mockReset());

describe('formatosDaBiblioteca (união dos 2 primeiros, sem vídeo)', () => {
  it('une os formatos do cargo e deixa o vídeo de fora', () => {
    expect(formatosDaBiblioteca([pref({ pref_audio: 7, pref_video_curto: 6 }), pref({ pref_texto: 7, pref_estudo_caso: 6 })])).toEqual(['audio', 'texto', 'case']);
  });
  it('quem só tem vídeo e um formato: o formato de conteúdo é o único', () => {
    expect(formatosDaBiblioteca([pref({ pref_video_curto: 7, pref_audio: 6 })])).toEqual(['audio']);
  });
  it('sem preferência: texto + estudo de caso', () => {
    expect(formatosDaBiblioteca([pref({}), pref({})])).toEqual(['texto', 'case']);
    expect(formatosDaBiblioteca([])).toEqual(['texto', 'case']);
  });
});

describe('filaConteudoEscopo', () => {
  it('só os descritores SEM conteúdo servível entram; cada um nos formatos do cargo', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const tdb = bancoFalso({
      prefs: [{ id: 'p1', ...pref({ pref_audio: 7, pref_video_curto: 6 }) }],
      competencias: desc('Rotina', 'CAIXA', 'd1', 'd2', 'd3'),
      conteudos: [mc('d2')],
    });
    expect(chaves(await filaConteudoEscopo(tdb, { permitidos: null }))).toEqual(['d1:audio', 'd3:audio']);
  });

  it('conteúdo de OUTRO cargo, de KIT ou de DISC não conta como "existe" (a montagem não os serve)', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const tdb = bancoFalso({
      competencias: desc('Rotina', 'CAIXA', 'd1', 'd2', 'd3', 'd4'),
      conteudos: [mc('d1', { cargo: 'GERENTE' }), mc('d2', { kit_id: 'k1' }), mc('d3', { disc: 'D' }), mc('d4', { cargo: 'todos' })],
    });
    // d4 tem conteúdo "todos" (serve); d1, d2 e d3 só têm o que NÃO serve
    expect(chaves(await filaConteudoEscopo(tdb, { permitidos: null }))).toEqual(['d1:case', 'd1:texto', 'd2:case', 'd2:texto', 'd3:case', 'd3:texto']);
  });

  it('conteúdo do catálogo GLOBAL conta como existente', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const tdb = bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'd1', 'd2'), globais: [mc('d1', { cargo: 'todos' })] });
    expect(chaves(await filaConteudoEscopo(tdb, { permitidos: null }))).toEqual(['d2:case', 'd2:texto']);
  });

  it('o descritor casa pela forma normalizada (prefixo de código, acento, caixa)', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const tdb = bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'Busca de apoio'), conteudos: [mc('COO03_D2 — Busca de Apoio')] });
    expect(await filaConteudoEscopo(tdb, { permitidos: null })).toEqual([]);
  });

  it('sem linha da competência na empresa, cai no catálogo BASE', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const tdb = bancoFalso({ competencias: [], base: [{ nome: 'Rotina', nome_curto: 'b1' }, { nome: 'Rotina', nome_curto: 'b2' }] });
    expect(chaves(await filaConteudoEscopo(tdb, { permitidos: null }))).toEqual(['b1:case', 'b1:texto', 'b2:case', 'b2:texto']);
  });

  it('só gera para quem vai ter trilha MONTADA agora: quem já tem trilha, ou não mapeou o foco, fica fora', async () => {
    coletar.mockResolvedValue({ entrada: entrada({ trilhas: ['p1'] }) });
    expect(await filaConteudoEscopo(bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'd1') }), { permitidos: null })).toEqual([]);
    coletar.mockResolvedValue({ entrada: entrada({ assessments: [] }) });
    expect(await filaConteudoEscopo(bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'd1') }), { permitidos: null })).toEqual([]);
  });

  it('cargo sem competência foco: nada a gerar', async () => {
    coletar.mockResolvedValue({ entrada: entrada({ cargos: [{ nome: 'CAIXA', foco: [], top5: 0 }] }) });
    expect(await filaConteudoEscopo(bancoFalso(), { permitidos: null })).toEqual([]);
  });

  it('dois cargos: cada um com os SEUS descritores e os SEUS formatos', async () => {
    coletar.mockResolvedValue({ entrada: entrada({
      pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'CAIXA' }, { id: 'p2', nome: 'Bia', cargo: 'GERENTE' }],
      cargos: [{ nome: 'CAIXA', foco: ['Rotina'], top5: 1 }, { nome: 'GERENTE', foco: ['Rotina'], top5: 1 }],
      assessments: [{ colaborador_id: 'p1', competencia: 'Rotina' }, { colaborador_id: 'p2', competencia: 'Rotina' }],
    }) });
    const tdb = bancoFalso({
      prefs: [{ id: 'p1', ...pref({ pref_audio: 7, pref_video_curto: 6 }) }, { id: 'p2', ...pref({ pref_texto: 7, pref_estudo_caso: 6 }) }],
      competencias: [...desc('Rotina', 'CAIXA', 'c1'), ...desc('Rotina', 'GERENTE', 'g1')],
    });
    expect(chaves(await filaConteudoEscopo(tdb, { permitidos: null }))).toEqual(['c1:audio', 'g1:case', 'g1:texto']);
  });

  it('com a coleta pronta (a prévia), NÃO coleta de novo', async () => {
    const tdb = bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'd1') });
    const r = await filaConteudoEscopo(tdb, { permitidos: null }, entrada() as any);
    expect(coletar).not.toHaveBeenCalled();
    expect(chaves(r)).toEqual(['d1:case', 'd1:texto']);
  });

  it('o escopo (permitidos, cargos, exceção de internos) vai para a coleta', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    await filaConteudoEscopo(bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'd1') }), { permitidos: new Set(['p1']), cargos: ['CAIXA'], incluirInternos: ['p1'] });
    expect(coletar.mock.calls[0][1]).toMatchObject({ permitidos: new Set(['p1']), cargos: ['CAIXA'], incluirInternos: ['p1'] });
  });

  it.each(['competencias', 'micro_conteudos:tdb', 'micro_conteudos:raw', 'colaboradores'])('erro ao ler %s LANÇA (não vira "biblioteca completa")', async (tabela) => {
    coletar.mockResolvedValue({ entrada: entrada() });
    await expect(filaConteudoEscopo(bancoFalso({ competencias: desc('Rotina', 'CAIXA', 'd1'), falhar: tabela }), { permitidos: null })).rejects.toThrow(/boom/);
  });

  it('erro na coleta LANÇA', async () => {
    coletar.mockResolvedValue({ error: 'respostas: x' });
    await expect(filaConteudoEscopo(bancoFalso(), { permitidos: null })).rejects.toThrow(/respostas: x/);
  });
});
