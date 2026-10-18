import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * O vídeo do Remotion pedia `Inter, "Segoe UI", system-ui, sans-serif`, e a box de render não tem nenhuma delas: o
 * Chrome caía na fonte que sobrasse. `Medido 18/10/2026` em produção: títulos e legendas MONOESPAÇADOS e a saudação em
 * SERIFA, a mesma composição saindo em DejaVu Sans no Ubuntu do WSL. As fontes da marca agora vão no bundle
 * (`video-spike/remotion/fontes.ts`); estes testes impedem que a fonte volte a depender da máquina.
 */
const SRC = 'video-spike/remotion';
const PUBLIC = 'public/video-spike';
const fontes = readFileSync(`${SRC}/fontes.ts`, 'utf-8');

const arquivosTs = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? arquivosTs(p) : /\.tsx?$/.test(f) ? [p.split(path.sep).join('/')] : [];
  });

describe('fontes da marca dentro do bundle do vídeo', () => {
  const faces = [...fontes.matchAll(/familia:\s*'([^']+)',\s*arquivo:\s*'([^']+)'/g)].map((m) => ({ familia: m[1], arquivo: m[2] }));

  it('declara o Codec e o Roboto, e os arquivos estão no publicDir do Remotion', () => {
    expect(faces.map((f) => f.familia).sort()).toEqual(['Codec-ExtraBold', 'Roboto']);
    for (const f of faces) expect(existsSync(`${PUBLIC}/${f.arquivo}`), `${PUBLIC}/${f.arquivo} ausente: o render aborta`).toBe(true);
  });

  it('são os MESMOS arquivos do app e do miolo v7 (uma fonte da marca só)', () => {
    for (const f of faces) {
      const nome = path.basename(f.arquivo);
      const bytes = readFileSync(`${PUBLIC}/${f.arquivo}`);
      expect(bytes.equals(readFileSync(`app/fonts/${nome}`)), `${nome} difere de app/fonts`).toBe(true);
      expect(bytes.equals(readFileSync(`worker-hetzner/video-v7/fontes/${nome}`)), `${nome} difere do miolo v7`).toBe(true);
    }
  });

  it('as duas composições que a box renderiza seguram o quadro pelas fontes, na RAIZ do componente', () => {
    for (const [arq, comp] of [['VideoCompositionV3.tsx', 'VideoCompositionV3'], ['AvatarGreeting.tsx', 'AvatarGreeting']]) {
      const src = readFileSync(`${SRC}/${arq}`, 'utf-8');
      expect(src, `${comp} não chama useFontesDaMarca()`).toMatch(new RegExp(`export const ${comp}[^\\n]*=>\\s*\\{\\s*\\n\\s*useFontesDaMarca\\(\\);`));
    }
  });

  it('a espera (delayRender) vive DENTRO do hook, nunca no topo do módulo', () => {
    // `Medido 18/10/2026`: no topo do módulo, o renderStill passava e o renderMedia morria no quadro 152 por tempo-limite.
    const hook = fontes.slice(fontes.indexOf('export function useFontesDaMarca'));
    expect(hook).toMatch(/useState\(\(\) => delayRender\(/);
    expect(hook).toMatch(/continueRender\(/);
    expect(hook).toMatch(/cancelRender\(/);
    // a CHAMADA (com o rótulo), não a menção no comentário
    const chamadas = [...fontes.matchAll(/delayRender\('/g)].map((m) => m.index!);
    expect(chamadas.length).toBe(1);
    expect(chamadas[0]).toBeGreaterThan(fontes.indexOf('export function useFontesDaMarca'));
  });

  it('nenhum componente declara pilha de fonte própria (Inter, system-ui, Segoe UI): a fonte vem de fontes.ts', () => {
    const fora = arquivosTs(SRC)
      .filter((f) => !f.endsWith('/fontes.ts'))
      .filter((f) => /['"`][^'"`]*\b(Inter|system-ui|Segoe UI)\b[^'"`]*['"`]/.test(readFileSync(f, 'utf-8')));
    expect(fora).toEqual([]);
  });

  it('título do avatar e da saudação em Codec; a saudação define a fonte na raiz (senão herda a serifa do Chrome)', () => {
    const avatar = readFileSync(`${SRC}/scenes/AvatarClipV2.tsx`, 'utf-8');
    const saudacao = readFileSync(`${SRC}/AvatarGreeting.tsx`, 'utf-8');
    expect(avatar).toMatch(/fontFamily:\s*FONTE_TITULO/);
    expect(saudacao).toMatch(/<h1 style=\{\{[^}]*fontFamily:\s*FONTE_TITULO/);
    expect(saudacao).toMatch(/<AbsoluteFill style=\{\{[^}]*fontFamily:\s*FONTE_TEXTO/);
  });
});
