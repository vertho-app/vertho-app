import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: chamada de IA do pipeline tem que dizer DE QUEM é o custo.
 *
 * `ia_usage_log` grava `empresa_id` a partir de `options.empresaId` do `callAI`.
 * Quem não passa a etiqueta continua sendo cobrado e registrado — a linha
 * existe, o custo entra no total, e some do tenant. O sintoma não é um erro: é
 * uma pergunta que deixa de ter resposta.
 *
 * `Medido: 01/09/2026` — ao fechar a conta da demo escolar, `ia3_check` (65
 * chamadas) e `ia4_avaliacao` (14) apareciam no tenant, enquanto `ia3_cenarios`
 * (67, US$ 3,66) e `ia2_gabarito` (8, US$ 0,67) apareciam com ZERO. Metade da
 * geração ficou sem dono, e "quanto custou este ambiente" virou estimativa.
 *
 * Este guard varre os núcleos do pipeline e exige a etiqueta em toda chamada
 * que declara `taskKey`. Ele lê o FONTE de propósito: o defeito é de escrita, e
 * um teste de comportamento precisaria de um ledger de verdade para vê-lo.
 */

const NUCLEOS = [
  'lib/ia2-gabarito.ts',
  'lib/ia3-cenarios.ts',
  'lib/ia4-avaliacao.ts',
  'lib/ia4-reavaliacao.ts',
];

/** Captura cada `callAI(...)` com o bloco de options no fim. */
const CHAMADA = /callAI\s*\(([\s\S]*?)\)\s*;/g;

describe('Guard: custo de IA do pipeline sabe de quem é', () => {
  for (const arquivo of NUCLEOS) {
    it(`${arquivo}: toda chamada com taskKey passa empresaId`, () => {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8');
      const semEtiqueta: string[] = [];

      for (const match of fonte.matchAll(CHAMADA)) {
        const args = match[1];
        if (!args.includes('taskKey')) continue;
        if (args.includes('empresaId')) continue;
        semEtiqueta.push(args.replace(/\s+/g, ' ').slice(0, 120));
      }

      expect(semEtiqueta, [
        `${semEtiqueta.length} chamada(s) sem \`empresaId\` em ${arquivo}:`,
        ...semEtiqueta.map((t) => `  callAI(${t})`),
        'O custo delas entra no total e some do tenant.',
      ].join('\n')).toEqual([]);
    });
  }

  it('o guard enxerga uma chamada sem etiqueta (validação do próprio teste)', () => {
    // Sem isto, um erro na regex deixaria o guard verde para sempre: ele
    // percorreria zero chamadas e concluiria que está tudo certo.
    const fonteFalsa = `
      const a = await callAI(system, user, cfg, 100, { taskKey: 'ia2_gabarito' });
      const b = await callAI(system, user, cfg, 100, { taskKey: 'ia3_check', empresaId: x });
    `;
    const achados = [...fonteFalsa.matchAll(CHAMADA)]
      .map((m) => m[1])
      .filter((args) => args.includes('taskKey') && !args.includes('empresaId'));
    expect(achados).toHaveLength(1);
  });
});
