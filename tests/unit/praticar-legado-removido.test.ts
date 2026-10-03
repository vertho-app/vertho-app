import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * R-125 (revisão de 02/10/2026): `/dashboard/praticar/evidencia` era página
 * legada da antiga Fase 4, alcançável por URL direta. Lia coluna que não
 * existe, gravava em `capacitacao`, chamava IA (`actions/tutor-evidencia.ts`)
 * e dizia "Você ganhou 5 pontos", num produto que não tem pontos. Medido em
 * 03/10/2026: 0 evidências gravadas em `capacitacao` em toda a história.
 *
 * Saíram a página, a action (`praticar-actions.ts`) e o tutor, que só ela
 * chamava (conferido pelo grafo do bundler). Fica `/dashboard/praticar`, que só
 * redireciona para a temporada: o botão da home ainda aponta para ele.
 */
function versionados(prefixo: string): string[] | null {
  try {
    return execFileSync('git', ['ls-files', '-z', '--', prefixo], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean);
  } catch { return null; }
}

describe('Praticar legado: só o redirecionamento ficou', () => {
  it('em app/dashboard/praticar só existe o redirect para a temporada', () => {
    const arquivos = versionados('app/dashboard/praticar/');
    if (!arquivos) return; // fora de repo git: não se aplica
    expect(arquivos).toEqual(['app/dashboard/praticar/page.tsx']);
    const pagina = readFileSync('app/dashboard/praticar/page.tsx', 'utf-8');
    expect(pagina).toContain("router.replace('/dashboard/temporada')");
    expect(pagina, 'o redirect não chama action nenhuma').not.toMatch(/from ['"]\.\.?\//);
  });

  it('o tutor de evidência (IA) não voltou', () => {
    const arquivos = versionados('actions/tutor-evidencia.ts');
    if (!arquivos) return;
    expect(arquivos).toEqual([]);
  });
});
