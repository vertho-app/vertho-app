import { describe, expect, it } from 'vitest';
import { ordenarRanking, somarVoto, type ContagemCompetencia } from '@/lib/votacao/ranking';

/**
 * Régua do ranking da votação. O caso-âncora é o empate real da 4Life em
 * 26/09/2026, com as posições medidas nos 17 votos do Professor(a) de EI.
 */

const c = (pontos: number, votos: number, posicoes: number[]): ContagemCompetencia => ({ pontos, votos, posicoes });

// Medido no banco (26/09): pontos, votos e [1º, 2º, 3º, 4º, 5º].
const QUATRO_LIFE: Record<string, ContagemCompetencia> = {
  'Interação com as Famílias': c(24, 9, [0, 1, 4, 4, 0]),
  'Ação Pedagógica': c(31, 10, [4, 1, 1, 0, 4]),
  'Condução de Grupos e Gestão de Sala': c(24, 9, [3, 0, 0, 3, 3]),
  'Planejamento e Organização': c(31, 11, [2, 1, 3, 3, 2]),
  'Identidade Humana': c(22, 9, [0, 4, 0, 1, 4]),
};

describe('ordenarRanking', () => {
  it('4Life: empate em pontos e votos é decidido por quem ficou mais vezes em 1º lugar', () => {
    const r = ordenarRanking(QUATRO_LIFE);
    expect(r.map((x) => x.nome)).toEqual([
      'Planejamento e Organização', // 31 pts, 11 votos
      'Ação Pedagógica', // 31 pts, 10 votos
      'Condução de Grupos e Gestão de Sala', // 24 pts, 9 votos, 3× em 1º
      'Interação com as Famílias', // 24 pts, 9 votos, 0× em 1º
      'Identidade Humana',
    ]);
    const conducao = r.find((x) => x.nome.startsWith('Condução'))!;
    const interacao = r.find((x) => x.nome.startsWith('Interação'))!;
    expect(conducao.desempate).toEqual({ posicao: 0, vezes: 3 });
    expect(interacao.desempate).toEqual({ posicao: 0, vezes: 0 });
    expect(conducao.empate || interacao.empate).toBe(false);
  });

  it('quem foi separado por pontos ou votos não carrega selo de desempate', () => {
    const r = ordenarRanking(QUATRO_LIFE);
    for (const nome of ['Planejamento e Organização', 'Ação Pedagógica', 'Identidade Humana']) {
      const item = r.find((x) => x.nome === nome)!;
      expect(item.desempate).toBeNull();
      expect(item.empate).toBe(false);
    }
  });

  // Nos dois casos abaixo o ALFABETO aponta para o lado contrário da posição: sem
  // o critério 3, o desempate final (alfabético) inverteria a ordem. Nomes que
  // concordam com o alfabeto deixariam o teste verde com o critério apagado.
  it('mais vezes em 1º lugar vence mesmo sendo a última no alfabeto', () => {
    const r = ordenarRanking({
      Alfa: c(6, 2, [0, 1, 0, 1, 0]), // 4 + 2
      Zeta: c(6, 2, [1, 0, 0, 0, 1]), // 5 + 1
    });
    expect(r.map((x) => x.nome)).toEqual(['Zeta', 'Alfa']);
    expect(r[0].desempate).toEqual({ posicao: 0, vezes: 1 });
  });

  it('empatadas também em 1º lugar: decide o 2º lugar', () => {
    const r = ordenarRanking({
      Alfa: c(10, 3, [1, 0, 1, 1, 0]), // 5 + 3 + 2
      Zeta: c(10, 3, [1, 1, 0, 0, 1]), // 5 + 4 + 1
    });
    expect(r.map((x) => x.nome)).toEqual(['Zeta', 'Alfa']);
    expect(r[0].desempate).toEqual({ posicao: 1, vezes: 1 });
    expect(r[1].desempate).toEqual({ posicao: 1, vezes: 0 });
  });

  it('empate em TUDO: sai marcado como empate, em ordem alfabética', () => {
    const r = ordenarRanking({
      Zeta: c(9, 2, [1, 1, 0, 0, 0]),
      Alfa: c(9, 2, [1, 1, 0, 0, 0]),
    });
    expect(r.map((x) => x.nome)).toEqual(['Alfa', 'Zeta']);
    expect(r.every((x) => x.empate)).toBe(true);
    expect(r.every((x) => x.desempate === null)).toBe(true);
  });

  it('a ordem não depende da ordem em que os votos foram lidos', () => {
    const invertido = Object.fromEntries(Object.entries(QUATRO_LIFE).reverse());
    expect(ordenarRanking(invertido).map((x) => x.nome)).toEqual(ordenarRanking(QUATRO_LIFE).map((x) => x.nome));
  });
});

describe('somarVoto', () => {
  it('1º vale 5 pontos e 5º vale 1, e conta a posição de cada escolha', () => {
    const contagem: Record<string, ContagemCompetencia> = {};
    somarVoto(contagem, ['A', 'B', 'C', 'D', 'E']);
    somarVoto(contagem, ['B', 'A', 'C', 'D', 'E']);
    expect(contagem.A).toEqual({ votos: 2, pontos: 9, posicoes: [1, 1, 0, 0, 0] });
    expect(contagem.E).toEqual({ votos: 2, pontos: 2, posicoes: [0, 0, 0, 0, 2] });
  });

  it('ignora nome vazio e voto que não é lista; posição além da 5ª não tira ponto', () => {
    const contagem: Record<string, ContagemCompetencia> = {};
    somarVoto(contagem, null);
    somarVoto(contagem, ['', 'A', 'B', 'C', 'D', 'E', 'F']);
    expect(contagem['']).toBeUndefined();
    expect(contagem.F).toEqual({ votos: 1, pontos: 0, posicoes: [0, 0, 0, 0, 0] });
  });
});
