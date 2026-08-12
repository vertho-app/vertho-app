import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Guard: a conversão NOTA → NÍVEL só pode existir em `lib/nivel-regua.ts`.
 *
 * Motivo medido (12/08/2026): a régua estava reimplementada como `Math.floor`
 * em NOVE pontos independentes (IA4, reavaliação, chat ao vivo, blueprint,
 * relatório individual, DNA, CONARH e duas telas). Nenhuma cópia conhecia o
 * corte do N4 em 3,5 — e a divergência não ficou no código: em 42 de 288
 * descritores das avaliações de Macaé o nível gravado divergia do nível escrito
 * pela IA na MESMA avaliação, e o auditor da 2ª IA leu isso como "consolidação
 * contraditória" (erro grave, teto de 60 pontos).
 *
 * O padrão proibido é `Math.floor` aplicado a uma expressão que se chama nota /
 * média / nível — não `Math.floor` em geral (paginação, índice, tempo).
 */
const PADRAO = /Math\.floor\s*\(\s*[^)]*\b(nota|notas|media|média|nivel|nível|score)\b/i;

// Dívida declarada: só pode ENCOLHER. Entrada nova aqui é exatamente o bug que
// este guard existe para pegar.
const ALLOWLIST: Record<string, number> = {};

describe('Guard: régua nota→nível centralizada', () => {
  it('nenhum arquivo NOVO deriva nível de nota por conta própria', () => {
    const arquivos = execSync('git ls-files "*.ts" "*.tsx"', { encoding: 'utf8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => !f.startsWith('tests/'))
      .filter((f) => f !== 'lib/nivel-regua.ts');

    const violacoes: Record<string, string[]> = {};
    for (const arq of arquivos) {
      let txt: string;
      try { txt = readFileSync(arq, 'utf8'); } catch { continue; }
      if (!txt.includes('Math.floor')) continue;
      const linhas = txt.split('\n')
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => PADRAO.test(l));
      if (linhas.length) violacoes[arq] = linhas.map(({ l, n }) => `:${n} ${l.trim().slice(0, 90)}`);
    }

    const fora = Object.keys(violacoes).filter((f) => !(f in ALLOWLIST));
    if (fora.length) {
      throw new Error(
        `${fora.length} arquivo(s) derivam nível de nota fora de lib/nivel-regua:\n` +
        fora.map((f) => `  ❌ ${f}\n${violacoes[f].map((l) => `       ${l}`).join('\n')}`).join('\n') +
        `\n\nUse \`nivelDaNota(nota)\` (lib/nivel-regua). A régua é N1 1,00–1,99 · ` +
        `N2 2,00–2,99 · N3 3,00–3,50 · N4 acima de 3,50 — floor puro erra o N4.`
      );
    }
    expect(fora).toEqual([]);
  });

  it('a régua canônica existe e está sozinha', () => {
    const regua = readFileSync('lib/nivel-regua.ts', 'utf8');
    expect(regua).toContain('export function nivelDaNota');
    expect(regua).toContain('TETO_N3');
  });
});
