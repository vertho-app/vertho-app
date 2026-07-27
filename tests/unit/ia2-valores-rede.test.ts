import { describe, expect, it } from 'vitest';
import { consolidarValoresDaRede } from '@/lib/ia2-gabarito';

/**
 * Bug corrigido em 26/07: `buscarValores` fazia `.limit(1)` no PPP mais recente,
 * então numa empresa-rede (Ibipeba: 11 PPPs, 86 valores) a régua de competências
 * de TODO o município era autorada com os valores de uma escola arbitrária.
 */
describe('consolidarValoresDaRede', () => {
  it('1 escola: preserva a ordem declarada no PPP', () => {
    expect(consolidarValoresDaRede([['Ética', 'Autonomia', 'Solidariedade']]))
      .toEqual(['Ética', 'Autonomia', 'Solidariedade']);
  });

  it('ordena pelo que é COMPARTILHADO pela rede, não pela escola mais recente', () => {
    // "Disciplina" vem primeiro na escola 1 mas é dela só; "Solidariedade" é da rede.
    const out = consolidarValoresDaRede([
      ['Disciplina', 'Solidariedade'],
      ['Solidariedade', 'Autonomia'],
      ['Solidariedade', 'Autonomia'],
    ]);
    expect(out).toEqual(['Solidariedade', 'Autonomia', 'Disciplina']);
  });

  it('conta ESCOLAS, não ocorrências: valor repetido dentro do mesmo PPP não infla', () => {
    const out = consolidarValoresDaRede([
      ['Respeito', 'Respeito', 'respeito'],
      ['Autonomia'],
      ['Autonomia'],
    ]);
    expect(out).toEqual(['Autonomia', 'Respeito']);
  });

  it('dedup ignora acento, caixa e pontuação, e fica com a grafia mais curta', () => {
    const out = consolidarValoresDaRede([['ÉTICA,'], ['etica'], ['Ética']]);
    expect(out).toEqual(['Ética']);
  });

  it('corta em 10 valores (rede grande não pode inflar o prompt)', () => {
    const listas = Array.from({ length: 3 }, () =>
      Array.from({ length: 12 }, (_, i) => `Valor ${i}`));
    const out = consolidarValoresDaRede(listas);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe('Valor 0');
  });

  it('é determinístico — o prompt é cacheado, ordem instável quebraria o cache', () => {
    const listas = [['A', 'B'], ['B', 'C'], ['C', 'A']];
    expect(consolidarValoresDaRede(listas)).toEqual(consolidarValoresDaRede(listas));
  });

  it('tolera lixo no jsonb (não-string, vazio, só pontuação)', () => {
    const out = consolidarValoresDaRede([[null as any, '', '  ', '—', 'Ética', 42 as any]]);
    expect(out).toEqual(['Ética']);
  });

  it('caso real Ibipeba: 11 escolas → os 5 valores mais compartilhados no topo', () => {
    const rede = [
      ['Solidariedade', 'Ética', 'Educação antirracista'],
      ['Solidariedade', 'Autonomia', 'Gestão democrática'],
      ['Solidariedade', 'Democracia e participação', 'Cidadania'],
      ['Solidariedade', 'Ética', 'Gestão democrática'],
      ['Autonomia', 'Democracia e participação', 'Cultura quilombola'],
      ['Autonomia', 'Ética', 'Gestão democrática'],
      ['Democracia e participação', 'Cidadania'],
      ['Educação antirracista', 'Afeto e acolhimento'],
      ['Disciplina'],
      ['Coletividade'],
      ['Empatia'],
    ];
    expect(consolidarValoresDaRede(rede).slice(0, 5)).toEqual([
      'Solidariedade',            // 4 escolas
      'Ética',                    // 3
      'Autonomia',                // 3
      'Gestão democrática',       // 3
      'Democracia e participação',// 3
    ]);
  });
});
