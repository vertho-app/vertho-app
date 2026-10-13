import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { promptsGoldenV2 } from './golden-v2-fontes';

/**
 * Golden das regras v2 dos cenários (plano de 11/10/2026) e do auditor do A nas duas réguas,
 * capturado em 13/10/2026. A v1 tem o seu golden em `golden-prompts-ia3.json` e não muda.
 *
 * O prompt é a régua: mudar uma frase muda todo cenário gerado ou auditado depois. Mudança
 * deliberada regrava `golden-prompts-ia3-v2.json` com o diff à vista no commit.
 */
const GOLDEN: Record<string, string> = JSON.parse(readFileSync('tests/unit/ia3/golden-prompts-ia3-v2.json', 'utf-8'));

describe('prompts v2 dos cenários: golden', () => {
  const atuais = promptsGoldenV2();

  it('cobre as mesmas peças do arquivo (nenhuma sumiu, nenhuma entrou sem golden)', () => {
    expect(Object.keys(atuais).sort()).toEqual(Object.keys(GOLDEN).sort());
  });

  for (const nome of Object.keys(GOLDEN)) {
    it(`idêntico: ${nome}`, () => {
      expect(atuais[nome]).toBe(GOLDEN[nome]);
    });
  }
});
