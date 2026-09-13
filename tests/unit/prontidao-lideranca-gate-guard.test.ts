import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GUARD: todo export de `actions/prontidao-lideranca.ts` aplica o gate ANTES do
 * primeiro `await` de dado. Num arquivo 'use server' cada export é um endpoint
 * HTTP; um `await sb.from(...)` antes do gate leria dado de tenant para quem
 * não tem sessão. A saída nomeia pessoas e diz quem está pronto para liderar —
 * a régua é a do Ranking (mesmo par RH/admin), verificada aqui por texto.
 */
const GATES = ['ctxRh()', 'requireEmpresaSupabase('];

describe('actions/prontidao-lideranca.ts — gate antes do primeiro await', () => {
  const src = readFileSync(join(process.cwd(), 'actions', 'prontidao-lideranca.ts'), 'utf8');
  const blocos = src.split(/\nexport async function /).slice(1);

  it('o arquivo é use server e tem os pares RH/admin', () => {
    expect(src.startsWith("'use server'")).toBe(true);
    const nomes = blocos.map((b) => b.slice(0, b.indexOf('(')));
    expect(nomes).toEqual([
      'getProntidaoLideranca', 'getParecerLideranca',
      'getProntidaoLiderancaAdmin', 'getParecerLiderancaAdmin',
      'getConfigProntidaoAdmin', 'salvarConfigProntidaoAdmin', 'setModuloProntidaoAdmin', 'getCalibragemAdmin',
      'exportarParecerPDF', 'exportarParecerPDFAdmin', 'exportarConsolidadoPDF', 'exportarConsolidadoPDFAdmin',
    ]);
  });

  for (const bloco of blocos) {
    const nome = bloco.slice(0, bloco.indexOf('('));
    it(`${nome}: o primeiro await é um gate`, () => {
      const corpo = bloco.slice(bloco.indexOf('{'));
      const primeiroAwait = corpo.indexOf('await ');
      expect(primeiroAwait).toBeGreaterThan(-1);
      const trecho = corpo.slice(primeiroAwait, primeiroAwait + 60);
      expect(GATES.some((g) => trecho.includes(g)), `${nome} começa com: ${trecho}`).toBe(true);
    });
  }

  it('nenhum export lê o empresaId do cliente no caminho do RH', () => {
    // Os exports de RH não recebem empresaId: ele vem da sessão (ctxRh).
    for (const bloco of blocos) {
      const nome = bloco.slice(0, bloco.indexOf('('));
      const params = bloco.slice(bloco.indexOf('(') + 1, bloco.indexOf(')'));
      if (!nome.endsWith('Admin')) expect(params, nome).not.toMatch(/empresaId/);
    }
  });
});
