import { describe, expect, it } from 'vitest';
import { listaEmPortugues } from '@/lib/notifications/lista-em-portugues';

describe('listaEmPortugues', () => {
  it('um nome fica como está; dois levam "e"; três ou mais, vírgulas e "e" no fim', () => {
    expect(listaEmPortugues(['Comunicação'])).toBe('Comunicação');
    expect(listaEmPortugues(['Comunicação', 'Liderança'])).toBe('Comunicação e Liderança');
    expect(listaEmPortugues(['A', 'B', 'C'])).toBe('A, B e C');
    expect(listaEmPortugues(['A', 'B', 'C', 'D'])).toBe('A, B, C e D');
  });

  it('vazios, nulos e espaços sobrando saem (variável de template não pode ter "A e  e B")', () => {
    expect(listaEmPortugues(['A', '', null, undefined, '  ', 'B'])).toBe('A e B');
    expect(listaEmPortugues(['  Comunicação   clara '])).toBe('Comunicação clara');
    expect(listaEmPortugues([])).toBe('');
  });

  it('repetido (mesmo nome, outra caixa) entra uma vez só, na ordem da primeira ocorrência', () => {
    expect(listaEmPortugues(['Comunicação', 'comunicação', 'Liderança'])).toBe('Comunicação e Liderança');
  });
});
