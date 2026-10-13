import { describe, expect, it } from 'vitest';
import { ehCenarioB, chaveDaCelulaA, versaoMaisNovaQue, idsSubstituidos } from '@/lib/cenario-versoes';

/**
 * Régua única de "qual versão do cenário A se regenera" (servidor e tela da Fase 1).
 * Conferido em 13/10/2026: sem ela, regenerar de novo a versão respondida criava mais
 * uma linha a cada clique, e "Revisar todos" repetido fazia a célula crescer sem limite.
 */

const c = (id: string, created_at: string | null, extra: Record<string, any> = {}) =>
  ({ id, competencia_id: 'c-1', cargo: 'Caixa', ppp_escola_id: null, tipo_cenario: null, created_at, ...extra });

describe('versaoMaisNovaQue', () => {
  it('devolve a linha mais nova da MESMA célula que veio depois', () => {
    const antiga = c('a', '2026-10-01T10:00:00Z');
    const meio = c('b', '2026-10-05T10:00:00Z');
    const nova = c('d', '2026-10-09T10:00:00Z');
    expect(versaoMaisNovaQue(antiga, [antiga, meio, nova])?.id).toBe('d');
    expect(versaoMaisNovaQue(meio, [antiga, meio, nova])?.id).toBe('d');
    expect(versaoMaisNovaQue(nova, [antiga, meio, nova])).toBeNull();
  });

  it('outra competência, outro cargo ou outro PPP é outra célula', () => {
    const antiga = c('a', '2026-10-01T10:00:00Z');
    const linhas = [
      antiga,
      c('x', '2026-10-09T10:00:00Z', { competencia_id: 'c-2' }),
      c('y', '2026-10-09T10:00:00Z', { cargo: 'Eletrônica' }),
      c('z', '2026-10-09T10:00:00Z', { ppp_escola_id: 'ppp-1' }),
    ];
    expect(versaoMaisNovaQue(antiga, linhas)).toBeNull();
  });

  it('o Cenário B não é versão do A, e o B nunca tem "versão mais nova" por esta régua', () => {
    const antiga = c('a', '2026-10-01T10:00:00Z');
    const b = c('b', '2026-10-09T10:00:00Z', { tipo_cenario: 'cenario_b' });
    expect(versaoMaisNovaQue(antiga, [antiga, b])).toBeNull();
    expect(versaoMaisNovaQue(b, [antiga, b, c('n', '2026-10-10T10:00:00Z')])).toBeNull();
  });

  it('sem data legível não afirma ordem; empate na data também não', () => {
    const semData = c('a', null);
    expect(versaoMaisNovaQue(semData, [semData, c('n', '2026-10-10T10:00:00Z')])).toBeNull();
    const t = '2026-10-10T10:00:00Z';
    expect(versaoMaisNovaQue(c('a', t), [c('a', t), c('b', t)])).toBeNull();
  });
});

describe('idsSubstituidos (a tela marca e tira das filas)', () => {
  it('marca só as versões que têm outra mais nova na mesma célula', () => {
    const linhas = [
      c('a', '2026-10-01T10:00:00Z'),
      c('b', '2026-10-05T10:00:00Z'),
      c('outra', '2026-09-01T10:00:00Z', { competencia_id: 'c-2' }),
      c('b-fech', '2026-10-09T10:00:00Z', { tipo_cenario: 'cenario_b' }),
    ];
    expect([...idsSubstituidos(linhas)]).toEqual(['a']);
  });

  it('lista vazia ou nula não quebra', () => {
    expect(idsSubstituidos([]).size).toBe(0);
    expect(idsSubstituidos(null as any).size).toBe(0);
  });
});

describe('peças da régua', () => {
  it('ehCenarioB só para tipo_cenario = cenario_b', () => {
    expect(ehCenarioB({ tipo_cenario: 'cenario_b' })).toBe(true);
    expect(ehCenarioB({ tipo_cenario: null })).toBe(false);
    expect(ehCenarioB(null)).toBe(false);
  });

  it('a célula sem PPP é a de rede', () => {
    expect(chaveDaCelulaA(c('a', null))).toBe('c-1::Caixa::rede');
    expect(chaveDaCelulaA(c('a', null, { ppp_escola_id: 'p' }))).toBe('c-1::Caixa::p');
  });
});
