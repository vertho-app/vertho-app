import { describe, expect, it } from 'vitest';
import { calibrarComExemplares } from '@/lib/prontidao-lideranca/calibragem';
import type { NotaDescritor } from '@/lib/prontidao-lideranca/posicao';

const PROGRAMA = ['Priorização', 'Delegação'];
const n = (colaboradorId: string, competencia: string, descritor: string, nota: number): NotaDescritor =>
  ({ colaboradorId, competencia, descritor, nota });

describe('calibrarComExemplares — o exemplar afere a rubrica, não é instruído', () => {
  it('descritor em que um exemplar ficou abaixo do corte entra na lista de revisão, do pior para o melhor', () => {
    const notas = [
      n('e1', 'Priorização', 'D1', 3.5), n('e1', 'Priorização', 'D2', 2.0), n('e1', 'Delegação', 'D1', 3.8),
      n('e2', 'Priorização', 'D1', 3.4), n('e2', 'Priorização', 'D2', 2.5), n('e2', 'Delegação', 'D1', 3.9),
      n('e3', 'Priorização', 'D1', 2.9), n('e3', 'Priorização', 'D2', 3.6), n('e3', 'Delegação', 'D1', 4.0),
      n('x9', 'Priorização', 'D2', 1.0), // não é exemplar — não pode contaminar
    ];
    const c = calibrarComExemplares({ notas, exemplares: ['e1', 'e2', 'e3'], competencias: PROGRAMA, corte: 3, nomes: new Map([['e1', 'Daniel']]) });
    expect(c.exemplares).toBe(3);
    expect(c.comMapeamentoCompleto).toBe(3);
    expect(c.pendentes).toEqual([]);
    expect(c.descritoresParaRevisar.map((d) => `${d.competencia}/${d.descritor}`)).toEqual(['Priorização/D2', 'Priorização/D1']);
    const d2 = c.descritoresParaRevisar[0];
    expect(d2.avaliados).toBe(3);
    expect(d2.abaixoDoCorte.map((e) => [e.colaboradorId, e.nome, e.nota])).toEqual([['e1', 'Daniel', 2], ['e2', null, 2.5]]);
    expect(c.todos.find((d) => d.descritor === 'D1' && d.competencia === 'Delegação')!.abaixoDoCorte).toEqual([]);
  });

  it('exemplar com competência faltando é pendente; sem nota nenhuma também', () => {
    const notas = [n('e1', 'Priorização', 'D1', 4)];
    const c = calibrarComExemplares({ notas, exemplares: ['e1', 'e2'], competencias: PROGRAMA, corte: 3 });
    expect(c.comMapeamentoCompleto).toBe(0);
    expect(c.pendentes).toEqual([
      { colaboradorId: 'e1', nome: null, faltantes: ['Delegação'] },
      { colaboradorId: 'e2', nome: null, faltantes: ['Priorização', 'Delegação'] },
    ]);
  });

  it('nota EXATAMENTE no corte não é "abaixo"', () => {
    const c = calibrarComExemplares({ notas: [n('e1', 'Priorização', 'D1', 3.0)], exemplares: ['e1'], competencias: ['Priorização'], corte: 3 });
    expect(c.descritoresParaRevisar).toEqual([]);
  });

  it('descritor com código no eco é agrupado pela chave e exibido sem código', () => {
    const notas = [
      n('e1', 'Priorização', 'COO03_D6 — Busca de apoio', 2),
      n('e2', 'Priorização', 'Busca de apoio (COO03_D6)', 2.5),
    ];
    const c = calibrarComExemplares({ notas, exemplares: ['e1', 'e2'], competencias: ['Priorização'], corte: 3 });
    expect(c.todos).toHaveLength(1);
    expect(c.todos[0].descritor).toBe('Busca de apoio');
    expect(c.todos[0].avaliados).toBe(2);
  });
});
