import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import type { EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

/**
 * Panorama do RH por TURMA (07/10/2026).
 *
 * O Andamento "por turma" passava os ids dos membros ativos e o panorama contava, por
 * PESSOA, qualquer trilha ativa: a Temporada 2 herdava as 27 trilhas ativas da Turma 1,
 * e a Turma 1 (sem ativos) sumia da lista. Com o escopo de leitura, cada turma conta as
 * trilhas da PARTICIPAÇÃO dela (`trilhas.turma_membro_id`, ou a janela quando legada).
 */

const MARCO = Date.parse('2026-10-07T12:22:33.000Z');

const trilha = (id: string, colab: string, status: string, membro: string | null, criado: string) => ({
  id, colaborador_id: colab, status, turma_membro_id: membro, criado_em: criado,
  data_inicio: criado.slice(0, 10), temporada_plano: [], programa_modo: 'jornada', programa_config: null,
});

let TRILHAS: any[] = [];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { nome: 'Prefeitura de Exemplo', sys_config: {}, is_demo: false } : null),
  contagem: (tabela) => (tabela === 'colaboradores' ? 3 : null),
  lista: (tabela, _cols, cadeia) => {
    // A lista respeita o filtro de STATUS da cadeia: é ele que separa em curso, concluída e encerrada.
    if (tabela === 'trilhas') {
      let r = TRILHAS;
      for (const c of cadeia) {
        if (c.metodo === 'eq' && c.args[0] === 'status') r = r.filter((t) => t.status === c.args[1]);
        if (c.metodo === 'in' && c.args[0] === 'status') r = r.filter((t) => (c.args[1] as string[]).includes(t.status));
      }
      return r;
    }
    if (tabela === 'colaboradores') return [
      { id: 'p1', cargo: 'Vendas', email: 'ana@gmail.com' },
      { id: 'p2', cargo: 'Vendas', email: 'bia@gmail.com' },
      { id: 'p3', cargo: 'Vendas', email: 'caio@gmail.com' },
    ];
    if (tabela === 'cargos_empresa') return [{ nome: 'Vendas', top5_workshop: ['Negociação'] }];
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { carregarPanoramaRH } from '@/lib/home/loaders';

const escopo = (prefixo: 'a' | 'n', janela: any, ativa: boolean): EscopoDeLeitura => ({
  turmaId: prefixo === 'a' ? 'T1' : 'T2', turmaNome: prefixo === 'a' ? 'Turma 1' : 'Temporada 2', turmaStatus: 'x',
  colaboradorIds: ['p1', 'p2', 'p3'],
  participacaoPorColab: new Map(['p1', 'p2', 'p3'].map((id) => [id, { id: `${prefixo}-${id}`, janela, ativa }])),
});
const antiga = () => escopo('a', { de: null, ate: MARCO }, false);
const nova = () => escopo('n', { de: MARCO, ate: null }, true);

describe('panorama do RH com turma', () => {
  beforeEach(() => {
    sb.reset();
    // Ibipeba em miniatura: as 3 pessoas têm trilha da jornada 1 (2 ativas, 1 concluída).
    TRILHAS = [
      trilha('t-p1', 'p1', 'ativa', 'a-p1', '2026-07-13T00:00:00Z'),
      trilha('t-p2', 'p2', 'ativa', 'a-p2', '2026-07-13T00:00:00Z'),
      trilha('t-p3', 'p3', 'concluida', 'a-p3', '2026-07-13T00:00:00Z'),
    ];
  });

  it('a turma ANTIGA mantém as jornadas dela; a NOVA começa sem nenhuma', async () => {
    const velha = await carregarPanoramaRH('emp-1', { escopoTurma: antiga() });
    expect([velha.emJornada, velha.jornadasEncerradas, velha.jornadasIniciadas]).toEqual([2, 1, 3]);

    // O defeito: a Temporada 2 herdava as 2 trilhas ativas da jornada 1.
    const recente = await carregarPanoramaRH('emp-1', { escopoTurma: nova() });
    expect([recente.emJornada, recente.jornadasEncerradas, recente.jornadasIniciadas]).toEqual([0, 0, 0]);
  });

  it('trilha ENCERRADA pela operação conta como jornada iniciada, não como em curso nem como concluída', async () => {
    // A Temporada 1 de Ibipeba foi encerrada em 09/10/2026: as ativas viraram `encerrada`.
    // Sem tratá-la, a turma antiga perdia as 26 jornadas que começaram (38 → 12).
    TRILHAS = TRILHAS.map((t) => (t.status === 'ativa' ? { ...t, status: 'encerrada' } : t));
    const velha = await carregarPanoramaRH('emp-1', { escopoTurma: antiga() });
    expect([velha.emJornada, velha.jornadasEncerradas, velha.jornadasIniciadas]).toEqual([0, 1, 3]);
    // E na visão da empresa inteira (sem turma), a mesma conta.
    const empresa = await carregarPanoramaRH('emp-1');
    expect([empresa.emJornada, empresa.jornadasEncerradas, empresa.jornadasIniciadas]).toEqual([0, 1, 3]);
  });

  it('com a jornada 2 em curso, cada turma conta a trilha da sua participação (a pessoa não conta duas vezes)', async () => {
    TRILHAS = [
      ...TRILHAS,
      trilha('t2-p1', 'p1', 'ativa', 'n-p1', '2026-10-12T00:00:00Z'),
    ];
    // p1 passou para a jornada 2: na Turma 1 a trilha dela (ativa) segue sendo a 1; na Temporada 2, a 2.
    const velha = await carregarPanoramaRH('emp-1', { escopoTurma: antiga() });
    expect(velha.emJornada).toBe(2);
    const recente = await carregarPanoramaRH('emp-1', { escopoTurma: nova() });
    expect(recente.emJornada).toBe(1);
  });

  it('trilha legada (sem carimbo) só conta na turma cuja janela a contém', async () => {
    TRILHAS = [trilha('t-leg', 'p1', 'ativa', null, '2026-07-13T00:00:00Z')];
    expect((await carregarPanoramaRH('emp-1', { escopoTurma: antiga() })).emJornada).toBe(1);
    expect((await carregarPanoramaRH('emp-1', { escopoTurma: nova() })).emJornada).toBe(0);
  });

  it('o recorte da turma entra em TODA consulta de pessoa (meio painel recortado seria pior que nenhum)', async () => {
    await carregarPanoramaRH('emp-1', { escopoTurma: antiga() });
    const recortes = sb.chamadas.filter((c) => c.metodo === 'in' && ['id', 'colaborador_id'].includes(c.args[0]));
    // colaboradores (3) + trilhas da turma (1) + descriptor_assessments (1).
    expect(recortes.length).toBeGreaterThanOrEqual(5);
    for (const c of recortes) expect(c.args[1]).toEqual(['p1', 'p2', 'p3']);
  });

  it('turma sem ninguém é NINGUÉM, nunca a empresa toda', async () => {
    const vazio: EscopoDeLeitura = { ...antiga(), colaboradorIds: [], participacaoPorColab: new Map() };
    const p = await carregarPanoramaRH('emp-1', { escopoTurma: vazio });
    expect(p.emJornada).toBe(0);
    const recortes = sb.chamadas.filter((c) => c.metodo === 'in' && ['id', 'colaborador_id'].includes(c.args[0]));
    for (const c of recortes) expect(c.args[1]).toEqual([]);
  });

  it('erro ao ler as trilhas da turma marca o panorama como indisponível, não como zero', async () => {
    sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const p = await carregarPanoramaRH('emp-1', { escopoTurma: antiga() });
    expect(p.indisponivel).toBe(true);
  });
});
