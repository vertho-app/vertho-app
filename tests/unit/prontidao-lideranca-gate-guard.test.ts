import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GUARD: todo export de `actions/prontidao-lideranca.ts` aplica o gate ANTES do
 * primeiro `await` de dado. Num arquivo 'use server' cada export é um endpoint
 * HTTP; um `await sb.from(...)` antes do gate leria dado de tenant para quem
 * não tem sessão. A saída nomeia pessoas e diz quem está pronto para liderar:
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
      'getConfigProntidaoAdmin', 'salvarConfigProntidaoAdmin', 'setModuloAdmin', 'setModuloProntidaoAdmin',
      'listarCenariosLiderancaAdmin', 'reinstalarMatrizLiderancaAdmin',
      'exportarParecerPDF', 'exportarParecerPDFAdmin', 'exportarConsolidadoPDF', 'exportarConsolidadoPDFAdmin',
    ]);
  });

  const nomes = blocos.map((b) => b.slice(0, b.indexOf('(')));

  for (const bloco of blocos) {
    const nome = bloco.slice(0, bloco.indexOf('('));
    it(`${nome}: o primeiro await é um gate (ou delega a um export gatado)`, () => {
      const corpo = bloco.slice(bloco.indexOf('{'));
      const primeiroAwait = corpo.indexOf('await ');
      if (primeiroAwait === -1) {
        // Atalho sem await só passa se DELEGAR a outro export deste arquivo —
        // que o próprio laço verifica. Qualquer outro corpo sem await é um
        // export que não gata nada.
        const delegado = corpo.match(/return\s+(\w+)\s*\(/)?.[1];
        expect(delegado && nomes.includes(delegado), `${nome} não tem await nem delega: ${corpo.slice(0, 80)}`).toBe(true);
        return;
      }
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

/**
 * O CORTE não tem mais campo na tela (é 3,00 para todo mundo desde 14/09), mas
 * `sys_config.prontidao_lideranca` é JSONB livre e um tenant pode ter outro
 * valor gravado à mão. Se a tela parar de ENVIAR `corte_nota` no salvar,
 * `lerConfigProntidao` aplica o default e apaga esse ajuste em silêncio, no
 * primeiro "Salvar programa" clicado por outro motivo.
 *
 * É a classe "campo de UI sumiu, régua do servidor ficou": tirar o input é
 * seguro, parar de mandar o valor não é. Nada mais nesta base pega isso.
 */
describe('a tela sem campo de corte ainda PRESERVA o corte gravado', () => {
  const tab = readFileSync(join(process.cwd(), 'app', 'admin', 'fit', '_components', 'prontidao-lideranca-tab.tsx'), 'utf8');

  it('o payload do salvar leva corte_nota', () => {
    const chamada = tab.slice(tab.indexOf('salvarConfigProntidaoAdmin(empresaId, {'));
    expect(chamada.slice(0, chamada.indexOf('});'))).toMatch(/corte_nota:/);
  });

  it('o corte lido da config entra no form (senão o salvar mandaria o default)', () => {
    expect(tab).toMatch(/corte_nota: r\.cfg\.corte_nota/);
  });

  it('e o input de corte realmente saiu da tela', () => {
    expect(tab).not.toMatch(/type="number"[^>]*value=\{form\.corte_nota\}/);
  });
});
