import { describe, it, expect, vi } from 'vitest';
import { lerTudoPaginado, coletarEntradaPrevia } from '@/lib/pipeline-fluxo/coletar';

vi.mock('@/lib/ia4-fila', () => ({ buscarFilaIA4: vi.fn(async () => ({ data: [] })) }));

/**
 * O PostgREST corta cada consulta em 1.000 linhas SEM avisar. Uma coleta que não pagina conclui "ninguém
 * respondeu" numa empresa grande (a base já pagou por isso: 1.034 → 1.000 derrubou 3 células com cobertura 100%).
 */
const paginas = (total: number) => {
  const chamadas: Array<[number, number]> = [];
  const fabrica = async (de: number, ate: number) => {
    chamadas.push([de, ate]);
    const n = Math.max(0, Math.min(ate, total - 1) - de + 1);
    return { data: Array.from({ length: n }, (_, i) => ({ i: de + i })), error: null };
  };
  return { fabrica, chamadas };
};

describe('lerTudoPaginado', () => {
  it('1.034 linhas (o caso real do corte de 1.000): lê as duas páginas e devolve TODAS', async () => {
    const { fabrica, chamadas } = paginas(1034);
    const r = await lerTudoPaginado(fabrica);
    expect(r.data).toHaveLength(1034);
    expect(chamadas).toEqual([[0, 999], [1000, 1999]]);
  });
  it('múltiplo exato de 1.000: ainda pede a página seguinte (que vem vazia) — não presume que acabou', async () => {
    const { fabrica, chamadas } = paginas(2000);
    const r = await lerTudoPaginado(fabrica);
    expect(r.data).toHaveLength(2000);
    expect(chamadas).toHaveLength(3);
  });
  it('menos de uma página: uma chamada só', async () => {
    const { fabrica, chamadas } = paginas(37);
    expect((await lerTudoPaginado(fabrica)).data).toHaveLength(37);
    expect(chamadas).toHaveLength(1);
  });
  it('vazio', async () => {
    expect((await lerTudoPaginado(paginas(0).fabrica)).data).toEqual([]);
  });
  it('erro de leitura volta COM o erro (não vira "ninguém respondeu")', async () => {
    const r = await lerTudoPaginado(async () => ({ data: null, error: { message: 'boom' } }));
    expect(r.error).toBe('boom');
  });
  it('erro na SEGUNDA página também falha (não devolve só a primeira como se fosse tudo)', async () => {
    let n = 0;
    const r = await lerTudoPaginado(async () => (++n === 1
      ? { data: Array.from({ length: 1000 }, (_, i) => ({ i })), error: null }
      : { data: null, error: { message: 'timeout' } }));
    expect(r.error).toBe('timeout');
  });
});

describe('coletarEntradaPrevia — escopo e filtros', () => {
  // Banco falso mínimo: cada tabela devolve suas linhas em qualquer encadeamento.
  const tabelas: Record<string, any[]> = {
    colaboradores: [
      { id: 'a', nome_completo: 'Ana', cargo: 'CAIXA', gestor_email: 'g@x.com', email: 'a@x.com' },
      { id: 'b', nome_completo: 'Bia', cargo: 'GERENTE', gestor_email: null, email: 'b@x.com' },
      { id: 'c', nome_completo: 'Caio', cargo: 'CAIXA', gestor_email: null, email: 'c@x.com' },
    ],
    cargos_empresa: [{ nome: 'CAIXA', competencia_foco: null, competencias_foco: ['Simplicidade'], top5_workshop: ['x', 'y'] }],
    respostas: [
      { colaborador_id: 'a', competencia_nome: 'Simplicidade', avaliacao_ia: { x: 1 } },
      { colaborador_id: 'b', competencia_nome: 'Simplicidade', avaliacao_ia: null },
    ],
    descriptor_assessments: [{ colaborador_id: 'a', competencia: 'Simplicidade' }, { colaborador_id: 'b', competencia: 'Simplicidade' }],
    development_blueprints: [{ colaborador_id: 'a', auditado_em: '2026-09-01' }, { colaborador_id: 'b', auditado_em: null }],
    relatorios: [{ colaborador_id: 'a' }],
    trilhas: [{ colaborador_id: 'c' }],
  };
  const tdb = {
    from: (t: string) => {
      const q: any = {
        select: () => q, not: () => q, eq: () => q, order: () => q,
        // `excludeInternalEmails` chega como `.or(...)`: o falso aplica a MESMA regra (interno = @vertho.ai, menos persona de demo).
        or: (f: string) => { if (f.includes('not.ilike.*@vertho.ai')) filtros.push((r: any) => !String(r.email || '').toLowerCase().endsWith('@vertho.ai') || String(r.email).toLowerCase().endsWith('.demo@vertho.ai')); return q; },
        in: (_c: string, ids: string[]) => { filtros.push((r: any) => ids.includes(r.id)); return q; },
        range: (de: number) => Promise.resolve({ data: de === 0 ? tabelas[t].filter((r) => filtros.every((f) => f(r))) : [], error: null }),
      };
      const filtros: Array<(r: any) => boolean> = [];
      return q;
    },
  };

  it('sem escopo nem filtro: todas as pessoas; cargo e foco vêm de focoDoCargo; top5 conta o top5_workshop', async () => {
    const { entrada } = await coletarEntradaPrevia(tdb, { permitidos: null });
    expect(entrada!.pessoas.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(entrada!.cargos).toEqual([{ nome: 'CAIXA', foco: ['Simplicidade'], top5: 2 }]);
    expect(entrada!.respostas.find((r) => r.colaborador_id === 'a')!.avaliada).toBe(true);
    expect(entrada!.respostas.find((r) => r.colaborador_id === 'b')!.avaliada).toBe(false);
    expect(entrada!.blueprints.find((b) => b.colaborador_id === 'a')!.auditado).toBe(true);
    expect(entrada!.blueprints.find((b) => b.colaborador_id === 'b')!.auditado).toBe(false);
  });
  it('o escopo de TURMA restringe pessoas E todos os artefatos (nada de fora vaza para a contagem)', async () => {
    const { entrada } = await coletarEntradaPrevia(tdb, { permitidos: new Set(['a']) });
    expect(entrada!.pessoas.map((p) => p.id)).toEqual(['a']);
    expect(entrada!.respostas.every((r) => r.colaborador_id === 'a')).toBe(true);
    expect(entrada!.assessments.every((r) => r.colaborador_id === 'a')).toBe(true);
    expect(entrada!.blueprints.map((b) => b.colaborador_id)).toEqual(['a']);
    expect(entrada!.trilhas).toEqual([]); // a trilha é do 'c', fora do escopo
  });
  it('o filtro de cargo restringe as pessoas pelo nome exato', async () => {
    const { entrada } = await coletarEntradaPrevia(tdb, { permitidos: null, cargos: ['GERENTE'] });
    expect(entrada!.pessoas.map((p) => p.id)).toEqual(['b']);
  });
  it('conta INTERNA (@vertho.ai) fica de fora por padrão; entra só pelo id da exceção explícita', async () => {
    tabelas.colaboradores.push({ id: 'z', nome_completo: 'Staff', cargo: 'CAIXA', gestor_email: null, email: 'staff@vertho.ai' });
    tabelas.colaboradores.push({ id: 'y', nome_completo: 'Outro Staff', cargo: 'CAIXA', gestor_email: null, email: 'outro@vertho.ai' });
    try {
      expect((await coletarEntradaPrevia(tdb, { permitidos: null })).entrada!.pessoas.map((p) => p.id)).toEqual(['a', 'b', 'c']);
      const com = await coletarEntradaPrevia(tdb, { permitidos: null, incluirInternos: ['z'] });
      expect(com.entrada!.pessoas.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'z']);   // só o 'z'; o 'y' (interno) segue fora
      // a exceção NÃO fura o escopo: fora da turma, continua fora
      const turma = await coletarEntradaPrevia(tdb, { permitidos: new Set(['a']), incluirInternos: ['z'] });
      expect(turma.entrada!.pessoas.map((p) => p.id)).toEqual(['a']);
      // id que já entrava (não interno) não duplica
      expect((await coletarEntradaPrevia(tdb, { permitidos: null, incluirInternos: ['a'] })).entrada!.pessoas.filter((p) => p.id === 'a')).toHaveLength(1);
    } finally { tabelas.colaboradores.splice(3); }
  });
  it('erro ao ler as contas da exceção derruba a coleta com a causa', async () => {
    const falho = { from: (t: string) => { const filtros: any[] = []; const q: any = { select: () => q, not: () => q, eq: () => q, or: () => q, order: () => q, in: () => { filtros.push(1); return q; }, range: () => Promise.resolve(filtros.length ? { data: null, error: { message: 'exc' } } : { data: [], error: null }) }; return q; } };
    const r = await coletarEntradaPrevia(falho, { permitidos: null, incluirInternos: ['z'] });
    expect(r.error).toMatch(/exceção de contas internas\): exc/);
  });
  it('erro de leitura em qualquer tabela derruba a coleta com a causa (nunca uma prévia "vazia")', async () => {
    const falho = { from: (t: string) => { const q: any = { select: () => q, not: () => q, eq: () => q, or: () => q, order: () => q, range: () => Promise.resolve(t === 'respostas' ? { data: null, error: { message: 'x' } } : { data: [], error: null }) }; return q; } };
    const r = await coletarEntradaPrevia(falho, { permitidos: null });
    expect(r.entrada).toBeUndefined();
    expect(r.error).toMatch(/respostas: x/);
  });
});
