import { describe, it, expect } from 'vitest';
import {
  escolherCenarioB, escolherCenariosBPorCompetencia, fechamentoPorCompetencia, perguntasDoCenarioB,
} from '@/lib/season-engine/cenario-b';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O fechamento do Onboarding serve UM Cenário B por competência (5 cenários, 4
 * perguntas cada), e não um caso único que integre as 5 (decisão do dono,
 * 04/10/2026, depois de ver a Onda D). O B de cada competência é o que o lote da
 * Fase 5 gera por célula, e a escolha é a MESMA régua de `escolherCenarioB`.
 */

const PERGUNTAS = { p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4' };
const B = (id: string, competencia_id: string | null, dia: number, cargo = 'Professor', extra: Record<string, unknown> = {}) => ({
  id, titulo: `t-${id}`, descricao: `desc ${id}`, cargo, competencia_id,
  created_at: `2026-09-${String(dia).padStart(2, '0')}T12:00:00Z`, alternativas: { ...PERGUNTAS, ...extra },
});
const COMPS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'].map((nome, i) => ({ id: `c${i}`, nome }));
const TOP5 = COMPS.map((c) => c.nome);

const mock = (rows: any[]) => criarSupabaseMock({
  lista: (tabela) => (tabela === 'banco_cenarios' ? rows : tabela === 'competencias' ? COMPS : []),
});

describe('fechamentoPorCompetencia: só o Onboarding fecha um cenário por competência', () => {
  it('Onboarding com várias competências: sim', () => {
    expect(fechamentoPorCompetencia('onboarding', TOP5)).toBe(true);
  });

  it('Jornada, Personalizado, DUO de Ibipeba, piloto e legado seguem no formato de sempre', () => {
    for (const modo of ['jornada', 'custom', 'regular', 'regular_duo', 'regular_single', 'piloto', null, undefined]) {
      expect(fechamentoPorCompetencia(modo as any, TOP5), String(modo)).toBe(false);
    }
  });

  it('Onboarding de uma competência só (ou nomes repetidos) não é por competência', () => {
    expect(fechamentoPorCompetencia('onboarding', ['Comp A'])).toBe(false);
    expect(fechamentoPorCompetencia('onboarding', ['Comp A', ' comp a '])).toBe(false);
    expect(fechamentoPorCompetencia('onboarding', [])).toBe(false);
  });
});

describe('perguntasDoCenarioB: as 4 perguntas do B por célula, como a rota sempre serviu', () => {
  it('p1 a p4 com o rótulo de cada uma, na ordem', () => {
    expect(perguntasDoCenarioB(PERGUNTAS)).toEqual([
      { dimensao: 'SITUAÇÃO', texto: 'P1' }, { dimensao: 'AÇÃO', texto: 'P2' },
      { dimensao: 'RACIOCÍNIO', texto: 'P3' }, { dimensao: 'AUTOSSENSIBILIDADE', texto: 'P4' },
    ]);
  });

  it('só as que têm texto (a contagem real vem do tamanho da lista, nunca de um 4 escrito à mão)', () => {
    expect(perguntasDoCenarioB({ p1: 'só uma', p2: '', p3: undefined }).map((p) => p.dimensao)).toEqual(['SITUAÇÃO']);
    expect(perguntasDoCenarioB(null)).toEqual([]);
    expect(perguntasDoCenarioB({ competencias_integradas: ['a', 'b'] })).toEqual([]);
  });

  it('uma 5ª chave não vira pergunta: o B por célula tem 4, e o Onboarding serve 5 cenários, não 5 perguntas', () => {
    expect(perguntasDoCenarioB({ ...PERGUNTAS, p5: 'não conta' })).toHaveLength(4);
  });
});

describe('escolherCenariosBPorCompetencia: um B por competência, pela régua do fechamento', () => {
  const TODOS = COMPS.map((c, i) => B(`b-${c.id}`, c.id, 10 + i));

  it('as 5 competências com B: um cenário por competência, na ORDEM da trilha, sem campo interno', async () => {
    const r = await escolherCenariosBPorCompetencia(mock(TODOS).client, 'emp', 'Professor', [...TOP5].reverse());
    expect(r.faltantes).toEqual([]);
    expect(r.itens.map((i) => i.competencia)).toEqual([...TOP5].reverse());
    expect(r.itens.map((i) => i.cenario?.id)).toEqual(['b-c4', 'b-c3', 'b-c2', 'b-c1', 'b-c0']);
    expect((r.itens[0].cenario as any).cobertas).toBeUndefined();
  });

  it('lê banco_cenarios UMA vez para as 5 (e filtra por tenant, tipo e cargo)', async () => {
    const sb = mock(TODOS);
    await escolherCenariosBPorCompetencia(sb.client, 'emp', 'Professor', TOP5);
    expect(sb.chamadas.filter((c) => c.tabela === 'banco_cenarios' && c.metodo === 'select')).toHaveLength(1);
    expect(sb.usou('banco_cenarios', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('banco_cenarios', 'eq', 'tipo_cenario')).toBe(true);
  });

  it('falta o B de duas competências: elas aparecem pelo NOME, na ordem da trilha', async () => {
    const r = await escolherCenariosBPorCompetencia(mock([TODOS[0], TODOS[2], TODOS[3]]).client, 'emp', 'Professor', TOP5, { registrar: false });
    expect(r.faltantes).toEqual(['Comp B', 'Comp E']);
    expect(r.itens.find((i) => i.competencia === 'Comp B')?.cenario).toBeNull();
    expect(r.itens.find((i) => i.competencia === 'Comp A')?.cenario?.id).toBe('b-c0');
  });

  it('o B de OUTRA competência não serve (avaliaria a coisa errada)', async () => {
    const r = await escolherCenariosBPorCompetencia(mock([B('b-outra', 'c9', 10)]).client, 'emp', 'Professor', ['Comp A'], { registrar: false });
    expect(r.faltantes).toEqual(['Comp A']);
  });

  it('B sem texto ou sem perguntas não conta como B da competência', async () => {
    const vazio = { ...B('b-vazio', 'c0', 12), alternativas: {} };
    const semTexto = { ...B('b-sem-texto', 'c1', 12), descricao: '  ' };
    const r = await escolherCenariosBPorCompetencia(mock([vazio, semTexto]).client, 'emp', 'Professor', ['Comp A', 'Comp B'], { registrar: false });
    expect(r.faltantes).toEqual(['Comp A', 'Comp B']);
  });

  it('cargo específico vence "todos"; "todos" serve quando o cargo não tem; o mais recente desempata', async () => {
    const rows = [B('todos-a', 'c0', 20, 'todos'), B('cargo-a', 'c0', 1, 'Professor'), B('velho-b', 'c1', 1, 'Professor'), B('novo-b', 'c1', 9, 'Professor')];
    const r = await escolherCenariosBPorCompetencia(mock(rows).client, 'emp', 'Professor', ['Comp A', 'Comp B']);
    expect(r.itens.map((i) => i.cenario?.id)).toEqual(['cargo-a', 'novo-b']);
    const soTodos = await escolherCenariosBPorCompetencia(mock([B('todos-a', 'c0', 20, 'todos')]).client, 'emp', 'Professor', ['Comp A']);
    expect(soTodos.itens[0].cenario?.id).toBe('todos-a');
  });

  it('nome repetido na trilha (outra caixa, espaços) vira uma competência só', async () => {
    const r = await escolherCenariosBPorCompetencia(mock(TODOS).client, 'emp', 'Professor', ['Comp A', ' comp a ', null, '']);
    expect(r.itens.map((i) => i.competencia)).toEqual(['Comp A']);
  });

  it('é a MESMA escolha do fechamento de uma competência: cada item iguala escolherCenarioB([competência])', async () => {
    const rows = [...TODOS, B('b-extra-a', 'c0', 25), B('b-todos-b', 'c1', 28, 'todos')];
    const multi = await escolherCenariosBPorCompetencia(mock(rows).client, 'emp', 'Professor', TOP5, { registrar: false });
    for (const item of multi.itens) {
      const unica = await escolherCenarioB(mock(rows).client, 'emp', 'Professor', [item.competencia], { registrar: false });
      expect(item.cenario?.id, item.competencia).toBe(unica.cenario?.id);
    }
  });

  it('cada competência sem B vira degradação CRÍTICA própria (chave por competência), e registrar:false não grava', async () => {
    const sb = mock([TODOS[0]]);
    await escolherCenariosBPorCompetencia(sb.client, 'emp', 'Professor', ['Comp A', 'Comp B', 'Comp C'], { colaboradorId: 'col1', trilhaId: 'tr1' });
    const regs = sb.escritas.filter((e) => e.tabela === 'degradacao_log');
    expect(regs).toHaveLength(2);
    expect(regs.map((r) => r.payload.chave).sort()).toEqual(['emp:professor:comp b', 'emp:professor:comp c']);
    expect(regs.every((r) => r.payload.tipo === 'cenario-b-sem-elegivel' && r.payload.severidade === 'critico' && r.payload.colaborador_id === 'col1')).toBe(true);

    const mudo = mock([TODOS[0]]);
    await escolherCenariosBPorCompetencia(mudo.client, 'emp', 'Professor', ['Comp A', 'Comp B'], { registrar: false });
    expect(mudo.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });

  it('erro ao ler banco_cenarios ou competencias LANÇA (a rota responde 500), não vira "sem B"', async () => {
    const a = mock(TODOS);
    a.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'timeout no pool' });
    await expect(escolherCenariosBPorCompetencia(a.client, 'emp', 'Professor', TOP5)).rejects.toThrow(/timeout no pool/);
    const b = mock(TODOS);
    b.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'conexão caiu' });
    await expect(escolherCenariosBPorCompetencia(b.client, 'emp', 'Professor', TOP5)).rejects.toThrow(/conexão caiu/);
  });
});
