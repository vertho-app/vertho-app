import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildIA3SystemPrompt, buildIA3UserPrompt } from '@/lib/ia3-cenarios';
import { FIXTURES_GOLDEN_IA3 } from './fixtures-golden-ia3';

/**
 * Golden dos prompts do Cenário A (IA3), capturado de `origin/master` em
 * 18/09/2026 antes de extrair os blocos para o Cenário B reusar.
 *
 * O Cenário A é o instrumento do diagnóstico: mudar o prompt dele muda a régua de
 * todo cenário gerado depois. A extração tinha que ser byte a byte, e este teste
 * é a prova. Mudança DELIBERADA no prompt do A (M02: área, contexto cultural e
 * liderança) atualiza este arquivo com o diff à vista, nunca em silêncio.
 */
const GOLDEN: Record<string, string> = JSON.parse(readFileSync('tests/unit/ia3/golden-prompts-ia3.json', 'utf-8'));

describe('prompts do Cenário A (IA3): golden', () => {
  it('system prompt idêntico', () => {
    expect(buildIA3SystemPrompt()).toBe(GOLDEN.system);
  });

  for (const [nome, f] of Object.entries(FIXTURES_GOLDEN_IA3)) {
    it(`user prompt idêntico: ${nome}`, () => {
      const f2: any = f;
      expect(buildIA3UserPrompt(f2.empresa, f2.cargoNome, f2.cargoDetalhe, f2.comp, f2.descritores, f2.valores, f2.contextoPPP, f2.gabCIS))
        .toBe(GOLDEN[nome]);
    });
  }
});
