import { describe, it, expect } from 'vitest';
import { conteudosServiveisPorCargo, ehMesmoCargo } from '@/lib/season-engine/build-season';

/**
 * INVARIANTE: competência é ÚNICA POR CARGO. O conteúdo de um cargo NUNCA pode ser
 * servido a outro cargo (Autocuidado de Coordenação ≠ de Gestão Escolar). Só passa o
 * conteúdo do próprio cargo + o genérico (null/''/'todos'). Guard equivalente aos de
 * isolamento de tenant. Se a regra for afrouxada, os testes de "vaza" abaixo quebram.
 */
describe('isolamento de conteúdo por cargo', () => {
  const itens = [
    { id: 'coo', cargo: 'Coordenação Pedagógica' },
    { id: 'dir', cargo: 'Gestão Escolar' },
    { id: 'gen-todos', cargo: 'todos' },
    { id: 'gen-null', cargo: null },
    { id: 'gen-vazio', cargo: '' },
  ];

  it('serve o conteúdo do próprio cargo + os genéricos, e NADA de outro cargo', () => {
    const ids = conteudosServiveisPorCargo(itens, 'Gestão Escolar').map((c) => c.id).sort();
    expect(ids).toEqual(['dir', 'gen-null', 'gen-todos', 'gen-vazio']);
    // o de Coordenação NÃO pode aparecer para Gestão Escolar
    expect(ids).not.toContain('coo');
  });

  it('nunca vaza entre dois cargos específicos (simetria)', () => {
    const paraCoo = conteudosServiveisPorCargo(itens, 'Coordenação Pedagógica').map((c) => c.id);
    expect(paraCoo).toContain('coo');
    expect(paraCoo).not.toContain('dir');
  });

  it('normaliza acento/caixa/espaço ao comparar cargo', () => {
    expect(ehMesmoCargo(' gestão escolar ', 'Gestão Escolar')).toBe(true);
    expect(ehMesmoCargo('Coordenação Pedagógica', 'Gestão Escolar')).toBe(false);
  });

  it('trata null/vazio/todos como genérico (servível a qualquer cargo)', () => {
    expect(conteudosServiveisPorCargo(itens, 'Qualquer Cargo Novo').map((c) => c.id).sort())
      .toEqual(['gen-null', 'gen-todos', 'gen-vazio']);
  });
});
