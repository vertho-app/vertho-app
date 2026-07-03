import { describe, it, expect } from 'vitest';
import { fundirArguicao, AJUSTE_POR_SUSTENTACAO, LIMITE_AJUSTE } from '@/lib/season-engine/fusao-arguicao';

const parsedBase = () => ({
  avaliacao_por_descritor: [
    { descritor: 'D1', nota_pre: 2.0, nota_pos: 3.0, delta: 1.0 },
    { descritor: 'D2', nota_pre: 2.5, nota_pos: 2.5, delta: 0.0 },
  ],
  nota_media_pre: 2.25,
  nota_media_pos: 2.75,
  delta_medio: 0.5,
});

const extracao = (evs: any[]) => ({
  resumo: { leitura_geral: '', sustentacao_mais_forte: '', fragilidade_mais_relevante: '' },
  evidencias_por_descritor: evs,
});

describe('fundirArguicao — modulação determinística (±0,5 no código)', () => {
  it('aprofundou/forte = +0,5 e fragilizou/moderada = −0,35; recalcula médias', () => {
    const { parsed, ajustados } = fundirArguicao(parsedBase(), extracao([
      { descritor: 'D1', sustentou: 'aprofundou', forca: 'forte' },
      { descritor: 'D2', sustentou: 'fragilizou', forca: 'moderada' },
    ]));
    const [d1, d2] = parsed.avaliacao_por_descritor;
    expect(d1.nota_base_cenario).toBe(3.0);
    expect(d1.ajuste_arguicao).toBe(0.5);
    expect(d1.nota_pos).toBe(3.5);
    expect(d1.delta).toBe(1.5); // recalculado vs nota_pre
    expect(d2.ajuste_arguicao).toBe(-0.35);
    expect(d2.nota_pos).toBe(2.2); // 2.5 - 0.35 = 2.15 → 2.2
    expect(parsed.nota_media_pos).toBe(2.9); // (3.5+2.2)/2 = 2.85 → round1 = 2.9
    expect(ajustados).toBe(2);
  });

  it('confirmou e sem_sinal → ajuste 0 (não conta como ajustado)', () => {
    const { parsed, ajustados } = fundirArguicao(parsedBase(), extracao([
      { descritor: 'D1', sustentou: 'confirmou', forca: 'forte' },
      { descritor: 'D2', sustentou: 'sem_sinal', forca: 'fraca' },
    ]));
    expect(parsed.avaliacao_por_descritor[0].nota_pos).toBe(3.0);
    expect(parsed.avaliacao_por_descritor[0].ajuste_arguicao).toBe(0);
    expect(ajustados).toBe(0);
  });

  it('clamp da nota no teto e no piso da escala [1,4]', () => {
    const p = { avaliacao_por_descritor: [
      { descritor: 'A', nota_pre: 3.5, nota_pos: 3.8 },
      { descritor: 'B', nota_pre: 1.5, nota_pos: 1.2 },
    ], nota_media_pre: 2.5, nota_media_pos: 2.5 };
    const { parsed } = fundirArguicao(p, extracao([
      { descritor: 'A', sustentou: 'aprofundou', forca: 'forte' },   // 3.8+0.5=4.3 → 4.0
      { descritor: 'B', sustentou: 'fragilizou', forca: 'forte' },   // 1.2-0.5=0.7 → 1.0
    ]));
    expect(parsed.avaliacao_por_descritor[0].nota_pos).toBe(4.0);
    expect(parsed.avaliacao_por_descritor[1].nota_pos).toBe(1.0);
  });

  it('descritor sem match na arguição → ajuste 0, marcado sem_sinal', () => {
    const { parsed, ajustados } = fundirArguicao(parsedBase(), extracao([
      { descritor: 'OUTRO', sustentou: 'aprofundou', forca: 'forte' },
    ]));
    expect(parsed.avaliacao_por_descritor[0].ajuste_arguicao).toBe(0);
    expect(parsed.avaliacao_por_descritor[0].sustentacao_arguicao).toBe('sem_sinal');
    expect(ajustados).toBe(0);
  });

  it('descritor DUPLICADO conflitante → mantém o ajuste mais conservador (independe da ordem)', () => {
    // Extrator emitiu D1 duas vezes: aprofundou/forte (+0,5) e fragilizou/fraca (−0,2).
    // Determinístico: fica o de menor magnitude (−0,2), nas duas ordens.
    const ordemA = fundirArguicao(parsedBase(), extracao([
      { descritor: 'D1', sustentou: 'aprofundou', forca: 'forte' },
      { descritor: 'D1', sustentou: 'fragilizou', forca: 'fraca' },
    ]));
    const ordemB = fundirArguicao(parsedBase(), extracao([
      { descritor: 'D1', sustentou: 'fragilizou', forca: 'fraca' },
      { descritor: 'D1', sustentou: 'aprofundou', forca: 'forte' },
    ]));
    expect(ordemA.parsed.avaliacao_por_descritor[0].ajuste_arguicao).toBe(-0.2);
    expect(ordemB.parsed.avaliacao_por_descritor[0].ajuste_arguicao).toBe(-0.2);
  });

  it('match é case/space-insensitive', () => {
    const { parsed } = fundirArguicao(parsedBase(), extracao([
      { descritor: '  d1  ', sustentou: 'aprofundou', forca: 'moderada' },
    ]));
    expect(parsed.avaliacao_por_descritor[0].ajuste_arguicao).toBe(0.35);
  });

  it('sem extração → no-op (ajustados 0, notas intactas)', () => {
    const p = parsedBase();
    const { parsed, ajustados } = fundirArguicao(p, null);
    expect(ajustados).toBe(0);
    expect(parsed.avaliacao_por_descritor[0].nota_pos).toBe(3.0);
  });

  it('nota_pos não-numérica → sem modulação', () => {
    const p = { avaliacao_por_descritor: [{ descritor: 'D1', nota_pre: 2, nota_pos: null }], nota_media_pre: 2 };
    const { parsed, ajustados } = fundirArguicao(p, extracao([{ descritor: 'D1', sustentou: 'aprofundou', forca: 'forte' }]));
    expect(parsed.avaliacao_por_descritor[0].ajuste_arguicao).toBe(0);
    expect(ajustados).toBe(0);
  });

  it('todos os valores do mapa vivem dentro de [−0,5, +0,5]', () => {
    for (const forcas of Object.values(AJUSTE_POR_SUSTENTACAO)) {
      for (const v of Object.values(forcas)) {
        expect(Math.abs(v)).toBeLessThanOrEqual(LIMITE_AJUSTE);
      }
    }
  });
});
