/**
 * A barra da sala de apresentação nunca pode ficar acima de um diálogo.
 *
 * Ela é `fixed` no canto superior direito — o mesmo canto onde praticamente
 * todo modal do produto põe o "X" de fechar. `Medido: 02/09/2026`: em z-[90]
 * ela cobria 35 dos 40 overlays do app, e no vídeo da jornada o clique de
 * fechar caía no seletor de visão.
 *
 * O guard lê o DISCO e compara duas grandezas reais: o z da barra e o MENOR z
 * entre os overlays `fixed inset-0` do produto. Se alguém introduzir um modal
 * mais baixo, ou reerguer a barra, isto fica vermelho antes da apresentação.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const BARRA = join(RAIZ, 'components', 'dashboard', 'presentation-role-switcher.tsx');

function arquivosTsx(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.next' || nome.startsWith('.')) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosTsx(caminho, acc);
    else if (nome.endsWith('.tsx')) acc.push(caminho);
  }
  return acc;
}

/** `z-[60]` e `z-50` viram 60 e 50; sem z explícito, o overlay não entra na conta. */
function zDaLinha(linha: string): number | null {
  const bracket = linha.match(/z-\[(\d+)\]/);
  if (bracket) return Number(bracket[1]);
  const tailwind = linha.match(/\bz-(\d+)\b/);
  return tailwind ? Number(tailwind[1]) : null;
}

describe('camada da barra de apresentação', () => {
  const fonteBarra = readFileSync(BARRA, 'utf8');

  it('a barra declara um z-index explícito', () => {
    // Sem esta âncora o resto do arquivo mede o nada e fica verde à toa.
    // O casamento é pelo CONTAINER fixo com z explícito, não pelo canto: a
    // barra já mudou de canto uma vez (topo direito -> rodapé esquerdo) e um
    // guard preso a `right-3` passaria a medir o nada em silêncio.
    expect(fonteBarra).toMatch(/className="fixed [^"]*z-\[\d+\]/);
  });

  it('fica abaixo do overlay modal mais baixo do produto', () => {
    const zBarra = zDaLinha(fonteBarra.match(/className="fixed [^"]*z-\[\d+\][^"]*"/)![0])!;
    expect(Number.isFinite(zBarra)).toBe(true);

    const overlays: Array<{ arquivo: string; z: number }> = [];
    for (const dir of ['app', 'components']) {
      for (const arquivo of arquivosTsx(join(RAIZ, dir))) {
        if (arquivo === BARRA) continue;
        for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
          if (!linha.includes('fixed inset-0')) continue;
          const z = zDaLinha(linha);
          if (z !== null) overlays.push({ arquivo: arquivo.slice(RAIZ.length + 1), z });
        }
      }
    }

    // Denominador: "nenhum overlay abaixo da barra" só significa alguma coisa
    // se a varredura de fato encontrou overlays.
    expect(overlays.length).toBeGreaterThan(20);

    const abaixoDaBarra = overlays.filter((o) => o.z <= zBarra);
    expect(
      abaixoDaBarra.map((o) => `${o.arquivo} (z-${o.z} <= barra z-${zBarra})`),
    ).toEqual([]);
  });
});
