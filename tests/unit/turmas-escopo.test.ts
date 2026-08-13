import { describe, it, expect } from 'vitest';
import {
  EscopoOperacionalSchema,
  resolverEscopoDeLote,
  idsDoEscopoOuFalhar,
  EscopoObrigatorioError,
  mensagemEscopoObrigatorio,
} from '@/lib/turmas/escopo';

/**
 * Mock mínimo e explícito: o helper genérico do repo modela um builder
 * encadeável genérico, e aqui o que importa é COMO cada tabela responde a um
 * conjunto de filtros — descrever isso em dados deixa o teste legível.
 */
function sbFake(dados: {
  turmas?: Array<{ id: string; nome: string; empresa_id: string; status: string }>;
  membros?: Array<{ turma_id: string; colaborador_id: string; empresa_id: string; status: string }>;
  colaboradores?: Array<{ id: string; empresa_id: string }>;
}) {
  const t = dados.turmas || [];
  const m = dados.membros || [];
  const c = dados.colaboradores || [];

  return {
    from(tabela: string) {
      const filtros: Record<string, any> = {};
      let notIn: { coluna: string; valores: string[] } | null = null;
      let inFiltro: { coluna: string; valores: string[] } | null = null;

      const linhas = () => {
        let base: any[] = tabela === 'turmas' ? t : tabela === 'turma_membros' ? m : c;
        base = base.filter((row) => Object.entries(filtros).every(([k, v]) => row[k] === v));
        if (inFiltro) base = base.filter((row) => inFiltro!.valores.includes(row[inFiltro!.coluna]));
        if (notIn) base = base.filter((row) => !notIn!.valores.includes(row[notIn!.coluna]));
        return base;
      };

      const api: any = {
        select: (_cols: string, opts?: any) => {
          api._head = opts?.head === true;
          return api;
        },
        eq: (col: string, val: any) => { filtros[col] = val; return api; },
        in: (col: string, vals: string[]) => { inFiltro = { coluna: col, valores: vals }; return api; },
        not: (col: string, _op: string, lista: string) => {
          notIn = { coluna: col, valores: lista.replace(/[()"]/g, '').split(',') };
          return api;
        },
        maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data: linhas(), count: linhas().length, error: null }),
      };
      return api;
    },
  };
}

const EMP = 'emp-1';
const DUAS_TURMAS = {
  turmas: [
    { id: 't-dir', nome: 'Diretores escolares — 2026.2', empresa_id: EMP, status: 'diagnostico' },
    { id: 't-prof', nome: 'Professores — 2026.2', empresa_id: EMP, status: 'planejada' },
  ],
  membros: [
    { turma_id: 't-dir', colaborador_id: 'c1', empresa_id: EMP, status: 'ativo' },
    { turma_id: 't-dir', colaborador_id: 'c2', empresa_id: EMP, status: 'ativo' },
    { turma_id: 't-prof', colaborador_id: 'c3', empresa_id: EMP, status: 'ativo' },
    { turma_id: 't-prof', colaborador_id: 'c4', empresa_id: EMP, status: 'removido' },
  ],
  colaboradores: [
    { id: 'c1', empresa_id: EMP }, { id: 'c2', empresa_id: EMP },
    { id: 'c3', empresa_id: EMP }, { id: 'c4', empresa_id: EMP },
    { id: 'x1', empresa_id: 'outra-empresa' },
  ],
};

describe('schema do escopo', () => {
  it('empresa_inteira exige justificativa de verdade', () => {
    expect(EscopoOperacionalSchema.safeParse({ tipo: 'empresa_inteira' }).success).toBe(false);
    expect(EscopoOperacionalSchema.safeParse({ tipo: 'empresa_inteira', justificativa: 'pq sim' }).success).toBe(false);
    expect(EscopoOperacionalSchema.safeParse({
      tipo: 'empresa_inteira', justificativa: 'comunicado institucional para as duas safras',
    }).success).toBe(true);
  });

  it('tipo desconhecido é rejeitado (o escopo vem do cliente)', () => {
    expect(EscopoOperacionalSchema.safeParse({ tipo: 'todos' }).success).toBe(false);
    expect(EscopoOperacionalSchema.safeParse({ tipo: 'selecionados', colaboradorIds: [] }).success).toBe(false);
  });
});

describe('resolverEscopoDeLote', () => {
  it('🔴 com 2+ turmas ativas e SEM escopo, FALHA — nunca "empresa inteira"', async () => {
    const sb = sbFake(DUAS_TURMAS);
    await expect(resolverEscopoDeLote(sb, EMP)).rejects.toBeInstanceOf(EscopoObrigatorioError);
  });

  it('com UMA turma e sem escopo, segue como hoje (compatibilidade)', async () => {
    const sb = sbFake({
      turmas: [{ id: 't1', nome: 'Turma inicial', empresa_id: EMP, status: 'em_jornada' }],
      membros: [{ turma_id: 't1', colaborador_id: 'c1', empresa_id: EMP, status: 'ativo' }],
      colaboradores: [{ id: 'c1', empresa_id: EMP }, { id: 'c2', empresa_id: EMP }],
    });
    const r = await resolverEscopoDeLote(sb, EMP);
    expect(r.colaboradorIds.sort()).toEqual(['c1', 'c2']);   // a empresa toda, como antes
    expect(r.turmaId).toBeNull();
  });

  it('escopo de turma traz só os membros ATIVOS dela', async () => {
    const sb = sbFake(DUAS_TURMAS);
    const r = await resolverEscopoDeLote(sb, EMP, { tipo: 'turma', turmaId: 't-prof' });
    expect(r.colaboradorIds).toEqual(['c3']);          // c4 saiu (removido)
    expect(r.turmaId).toBe('t-prof');
    expect(r.rotulo).toContain('Professores');
  });

  it('turma de OUTRA empresa é recusada', async () => {
    const sb = sbFake({
      ...DUAS_TURMAS,
      turmas: [{ id: 't-alheia', nome: 'De outro tenant', empresa_id: 'outra-empresa', status: 'em_jornada' }],
    });
    await expect(resolverEscopoDeLote(sb, EMP, { tipo: 'turma', turmaId: 't-alheia' }))
      .rejects.toThrow(/não encontrada nesta empresa/i);
  });

  it('selecionados filtra pelo tenant (os ids vêm do cliente)', async () => {
    const sb = sbFake(DUAS_TURMAS);
    const r = await resolverEscopoDeLote(sb, EMP, { tipo: 'selecionados', colaboradorIds: ['c1', 'x1'] });
    expect(r.colaboradorIds).toEqual(['c1']);          // x1 é de outra empresa
  });

  it('empresa_inteira explícita passa mesmo com 2 turmas', async () => {
    const sb = sbFake(DUAS_TURMAS);
    const r = await resolverEscopoDeLote(sb, EMP, {
      tipo: 'empresa_inteira', justificativa: 'comunicado institucional para todas as safras',
    });
    expect(r.colaboradorIds.length).toBe(4);
    expect(r.turmaId).toBeNull();
  });
});

describe('idsDoEscopoOuFalhar (fluxos existentes)', () => {
  it('sem turmaId e com 2 turmas ativas, lança', async () => {
    const sb = sbFake(DUAS_TURMAS);
    await expect(idsDoEscopoOuFalhar(sb, EMP)).rejects.toBeInstanceOf(EscopoObrigatorioError);
  });

  it('com turmaId, devolve o conjunto da turma', async () => {
    const sb = sbFake(DUAS_TURMAS);
    const set = await idsDoEscopoOuFalhar(sb, EMP, { turmaId: 't-dir' });
    expect([...(set as Set<string>)].sort()).toEqual(['c1', 'c2']);
  });

  it('turma ARQUIVADA não conta para o fail-closed', async () => {
    const sb = sbFake({
      ...DUAS_TURMAS,
      turmas: [
        { id: 't-dir', nome: 'Diretores', empresa_id: EMP, status: 'em_jornada' },
        { id: 't-velha', nome: 'Turma 2025', empresa_id: EMP, status: 'arquivada' },
      ],
    });
    await expect(idsDoEscopoOuFalhar(sb, EMP)).resolves.toBeNull();
  });

  it('a mensagem de erro diz quantas turmas e o que fazer', async () => {
    const sb = sbFake(DUAS_TURMAS);
    try {
      await idsDoEscopoOuFalhar(sb, EMP);
      throw new Error('deveria ter lançado');
    } catch (e) {
      const msg = mensagemEscopoObrigatorio(e);
      expect(msg).toContain('2 turmas ativas');
      expect(msg).toContain('escolha a turma');
    }
  });
});
