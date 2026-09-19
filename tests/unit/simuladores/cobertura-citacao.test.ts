import { describe, expect, it } from 'vitest';
import { consolidarCompetencia, mediaGeral, REGRA_COBERTURA } from '@/lib/simuladores/cobertura';
import { contemCitacao, descarteTolerado, normalizarCitacao } from '@/lib/simuladores/citacao';

describe('regra de cobertura comum (decisão do dono, 18/09/2026)', () => {
  it('competência só tem nível com 4 descritores observados: 3 não bastam, 4 bastam', () => {
    const tres = consolidarCompetencia([3, 3, 4, null, null, null]);
    expect(tres).toMatchObject({ observados: 3, total: 6, nota: null, nivel: null, suficiente: false });
    const quatro = consolidarCompetencia([3, 3, 4, 2, null, null]);
    expect(quatro).toMatchObject({ observados: 4, total: 6, nota: 3, nivel: 3, suficiente: true });
  });

  it('o nível sai da régua única (3,5 ainda é N3; acima é N4)', () => {
    expect(consolidarCompetencia([4, 3, 4, 3]).nivel).toBe(3);
    expect(consolidarCompetencia([4, 4, 4, 3]).nivel).toBe(4);
  });

  it('média geral exige 3 competências com nível e ignora as insuficientes', () => {
    expect(mediaGeral([{ nota: 3 }, { nota: 4 }, { nota: null }])).toMatchObject({ nota: null, competencias: 2, suficiente: false });
    const r = mediaGeral([{ nota: 3 }, { nota: 4 }, { nota: 2 }, { nota: null }]);
    expect(r).toMatchObject({ nota: 3, nivel: 3, competencias: 3, suficiente: true });
  });

  it('a conversa curta deixa de fechar na meta (o caso que motivou a regra)', () => {
    // Plano N3, abertura N3 e uma pergunta: antes, média 3,0. Agora não há média.
    const pl = consolidarCompetencia([3, 3, null, null, null, null]);
    const p = consolidarCompetencia([3, null, null, null, null, null]);
    const a = consolidarCompetencia([3, null, null, null, null, null]);
    expect(mediaGeral([pl, p, a]).nota).toBeNull();
  });

  it('a versão da regra é gravável no relatório', () => {
    expect(REGRA_COBERTURA).toMatchObject({ minDescritores: 4, minCompetencias: 3 });
    expect(REGRA_COBERTURA.versao).toMatch(/^cobertura-/);
  });
});

describe('citação literal tolerante à tipografia', () => {
  it('aspas curvas, reticências, travessão, espaços e caixa não são conteúdo', () => {
    expect(contemCitacao('Ela disse “está pendente” — e saiu…', "ela disse 'está pendente' - e saiu...")).toBe(true);
    expect(normalizarCitacao('  Quem   CONFIRMA? ')).toBe('quem confirma?');
  });

  it('paráfrase continua recusada', () => {
    expect(contemCitacao('Vamos revisar os pedidos juntos amanhã.', 'Vamos rever os pedidos amanhã.')).toBe(false);
    expect(contemCitacao('texto', '')).toBe(false);
    expect(contemCitacao(null, 'x')).toBe(false);
  });

  it('descarta até 20% dos descritores avaliados (piso 1); acima disso a avaliação é recusada', () => {
    expect(descarteTolerado(0, 10)).toBe(true);
    expect(descarteTolerado(1, 3)).toBe(true);
    expect(descarteTolerado(2, 10)).toBe(true);
    expect(descarteTolerado(3, 10)).toBe(false);
    expect(descarteTolerado(4, 20)).toBe(true);
    expect(descarteTolerado(5, 20)).toBe(false);
  });
});
