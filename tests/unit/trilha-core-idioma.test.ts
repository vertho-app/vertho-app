import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { semComentarios } from '../helpers/fonte';

/**
 * Onda E (04/10/2026): quem monta a trilha entrega a PESSOA ao `buildSeason` (`colaboradorId`), e é por ela que a
 * missão e o cenário da semana de aplicação saem no idioma dela (`build-season-idioma.test.ts` prova o que o
 * `buildSeason` faz com ela). A trilha nasce por QUATRO caminhos em `lib/season-engine/trilha-core.ts` (a
 * trilha única do núcleo headless, o Onboarding, o Regular DUO e o Piloto), e o denominador é a contagem das
 * chamadas: um caminho que esquece a pessoa volta ao idioma do cookie de quem disparou, em silêncio, e só para
 * quem lê em outro idioma.
 *
 * Os caminhos do Onboarding e da trilha única também têm o teste de comportamento
 * (`onboarding/geracao-onboarding.test.ts` e `custom/personalizado-geracao.test.ts`).
 */

const FONTE = semComentarios(readFileSync('lib/season-engine/trilha-core.ts', 'utf8'));

/** O texto de cada `buildSeason({ ... })`, do abre-chaves ao fecha-chaves correspondente. */
function chamadasDoBuildSeason(fonte: string): string[] {
  const achados: string[] = [];
  const re = /buildSeason\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === '{') profundidade++;
      else if (fonte[i] === '}') profundidade--;
      i++;
    }
    achados.push(fonte.slice(m.index, i));
  }
  return achados;
}

describe('trilha-core: todo caminho entrega a pessoa ao buildSeason', () => {
  const chamadas = chamadasDoBuildSeason(FONTE);

  it('são quatro caminhos (se este número mudar, o novo caminho precisa passar a pessoa)', () => {
    expect(chamadas).toHaveLength(4);
  });

  it.each(chamadas.map((c, i) => [i + 1, c] as const))('o caminho %i passa `colaboradorId: colab.id`', (_i, chamada) => {
    expect(chamada).toContain('colaboradorId: colab.id');
  });
});
