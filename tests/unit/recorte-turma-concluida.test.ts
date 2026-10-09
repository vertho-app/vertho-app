import { beforeEach, describe, expect, it } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';
import { resolverRecorteDeTurma } from '@/lib/relatorios/recorte-turma';
import { listarTurmasDoTenant } from '@/lib/turmas/contexto';

/**
 * Filtro de turma da Central de relatórios do RH com turma CONCLUÍDA (09/10/2026).
 *
 * O dono concluiu a Temporada 1 de Ibipeba e pediu que o RH continue lendo a turma
 * que terminou. A Central listava só turmas não encerradas e tirava as pessoas do
 * escopo de LOTE (participação ativa): mesmo listada, a turma concluída viria com
 * 0 pessoas. Agora a lista inclui a concluída (a arquivada segue fora) e as pessoas
 * vêm do escopo de LEITURA (quem passou pela turma).
 */

const TURMAS = [
  { id: 't1', nome: 'Turma 1', status: 'concluida', created_at: '2026-07-13T00:00:00Z' },
  { id: 't2', nome: 'Temporada 2', status: 'diagnostico', created_at: '2026-10-07T00:00:00Z' },
  { id: 't0', nome: 'Antiga', status: 'arquivada', created_at: '2026-06-01T00:00:00Z' },
];
const MARCO = '2026-10-07T12:22:33Z';
const MEMBROS = [
  // as mesmas 3 pessoas passaram da Turma 1 para a Temporada 2; a 'rh' é a conta da secretaria
  ...['p1', 'p2', 'p3', 'rh'].map((c) => ({ id: `a-${c}`, turma_id: 't1', colaborador_id: c, status: 'concluido', created_at: '2026-08-13T00:00:00Z', marco_jornada: null })),
  ...['p1', 'p2', 'p3', 'rh'].map((c) => ({ id: `n-${c}`, turma_id: 't2', colaborador_id: c, status: 'ativo', created_at: MARCO, marco_jornada: MARCO })),
  { id: 'x-p9', turma_id: 't0', colaborador_id: 'p9', status: 'removido', created_at: '2026-06-01T00:00:00Z', marco_jornada: null },
];

/** Aplica os filtros da cadeia que o código usa (eq, in, not in) sobre a lista. */
function filtrar(linhas: any[], cadeia: Chamada[]) {
  let r = linhas;
  for (const c of cadeia) {
    const [col, val, val2] = c.args;
    if (c.metodo === 'eq' && col !== 'empresa_id') r = r.filter((l) => l[col] === val);
    if (c.metodo === 'in') r = r.filter((l) => (val as any[]).includes(l[col]));
    if (c.metodo === 'not' && val === 'in') {
      const fora = String(val2).replace(/[()"]/g, '').split(',');
      r = r.filter((l) => !fora.includes(l[col]));
    }
  }
  return r;
}

const sb = criarSupabaseMock({
  resolver: (tabela, _cols, cadeia) => (tabela === 'turmas' ? filtrar(TURMAS, cadeia)[0] || null : null),
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'turmas') return filtrar(TURMAS, cadeia);
    if (tabela === 'turma_membros') return filtrar(MEMBROS, cadeia);
    if (tabela === 'colaboradores') return filtrar([{ id: 'rh', role: 'rh' }], cadeia);
    return [];
  },
});

describe('turma concluída nos filtros de leitura do RH', () => {
  beforeEach(() => sb.reset());

  it('a lista do RH traz a turma concluída, contando quem passou por ela; a arquivada fica fora', async () => {
    const turmas = await listarTurmasDoTenant(sb.client, 'emp', { incluirConcluidas: true });
    expect(turmas.map((t) => [t.nome, t.membros])).toEqual([['Turma 1', 3], ['Temporada 2', 3]]);
  });

  it('sem a opção (usos operacionais), só a turma em andamento', async () => {
    const turmas = await listarTurmasDoTenant(sb.client, 'emp');
    expect(turmas.map((t) => t.nome)).toEqual(['Temporada 2']);
  });

  it('o recorte da turma concluída tem as pessoas que passaram por ela, não 0', async () => {
    const r = await resolverRecorteDeTurma(sb.client, 'emp', 't1');
    expect(r.turma?.nome).toBe('Turma 1');
    expect([...(r.colaboradorIds || [])].sort()).toEqual(['p1', 'p2', 'p3', 'rh']);
    // e devolve o escopo de leitura, com a janela da participação de cada um
    expect(r.escopoLeitura?.participacaoPorColab.get('p1')?.id).toBe('a-p1');
  });

  it('turma arquivada ou de outro tenant cai para a empresa inteira', async () => {
    expect((await resolverRecorteDeTurma(sb.client, 'emp', 't0')).colaboradorIds).toBeNull();
    expect((await resolverRecorteDeTurma(sb.client, 'emp', 'de-outra-empresa')).colaboradorIds).toBeNull();
  });
});
