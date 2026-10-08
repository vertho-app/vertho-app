/**
 * Brand book (out/2026): Ciano `#34C5CC`, títulos em Codec Bold, textos em Roboto.
 *
 * Guard ESTÁTICO: prova o CONTRATO entre as peças que têm de andar juntas, não a
 * aparência (que só a imagem prova). Três coisas moram em mais de um lugar e
 * divergem sem erro nenhum:
 *
 *  1. a rampa de ciano está escrita DUAS vezes em `app/globals.css`: o fallback
 *     de `--color-brand-*` (tenant sem branding) e o `--color-cyan-*` que
 *     substituiu a do Tailwind (866 usos de `cyan-400` na UI);
 *  2. o padrão do accent do tenant vive em `lib/ui-resolver.ts` e no
 *     `DEFAULT_THEME` do `dashboard-shell`, que precisam ser o mesmo ciano;
 *  3. o título (`font-display`) é Codec, e o Codec só existe em peso 800 (Extra Bold): sem a
 *     face `italic` apontando para o MESMO arquivo, o navegador sintetiza um
 *     oblíquo por cima dele nos títulos que eram itálicos.
 *
 * E uma ratchet: a tela do produto não volta ao Instrument Serif / Manrope.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), 'utf8');

const CIANO_VERTHO = '#34C5CC';
const DEGRAUS = [100, 200, 300, 400, 500, 600, 700] as const;

const css = ler('app/globals.css');

/** `--color-cyan-400: #34C5CC;` -> { 400: '#34C5CC' } (hex normalizado em maiúsculas). */
function rampa(re: RegExp): Record<number, string> {
  const out: Record<number, string> = {};
  for (const m of css.matchAll(re)) out[Number(m[1])] = m[2].toUpperCase();
  return out;
}
const cyan = rampa(/--color-cyan-(\d+):\s*(#[0-9a-fA-F]{6})\s*;/g);
const brandFallback = rampa(/--color-brand-(\d+):\s*var\(--brand-\d+,\s*(#[0-9a-fA-F]{6})\)\s*;/g);

describe('rampa de ciano (brand book)', () => {
  it('o degrau 400, o accent da UI escura, é o Ciano Vertho', () => {
    expect(cyan[400]).toBe(CIANO_VERTHO);
    expect(brandFallback[400]).toBe(CIANO_VERTHO);
  });

  it('o fallback de brand-* é a MESMA rampa do cyan-* (100 a 700)', () => {
    for (const d of DEGRAUS) {
      expect(cyan[d], `cyan-${d} ausente`).toBeTruthy();
      expect(brandFallback[d], `brand-${d} ausente`).toBe(cyan[d]);
    }
  });

  it('a rampa escurece do 100 ao 700 (sem degrau fora de ordem)', () => {
    const luz = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    const valores = DEGRAUS.map(d => luz(cyan[d]));
    expect([...valores].sort((a, b) => b - a)).toEqual(valores);
  });

  it('o padrão do accent do tenant é o mesmo ciano (resolver e shell)', () => {
    expect(ler('lib/ui-resolver.ts')).toMatch(new RegExp(`accent_color \\|\\| '${CIANO_VERTHO}'`, 'i'));
    expect(ler('app/dashboard/dashboard-shell.tsx')).toMatch(new RegExp(`accent: '${CIANO_VERTHO}'`, 'i'));
  });
});

describe('tipografia (brand book)', () => {
  const layout = ler('app/layout.tsx');

  it('o Codec Bold atende normal E italic com o mesmo arquivo (sem oblíquo sintético)', () => {
    const bloco = layout.match(/const codec = localFont\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
    const arquivos = [...bloco.matchAll(/path:\s*"(\.\/fonts\/[^"]+)",\s*weight:\s*"(\d+)",\s*style:\s*"(\w+)"/g)];
    expect(arquivos.map(a => a[3]).sort()).toEqual(['italic', 'normal']);
    expect(new Set(arquivos.map(a => a[1])).size).toBe(1);
    expect(new Set(arquivos.map(a => a[2]))).toEqual(new Set(['800']));
    expect(bloco).toContain('variable: "--font-codec"');
  });

  it('os tokens do :root apontam para Codec (título) e Roboto (texto)', () => {
    expect(css).toMatch(/--vh-font-display:\s*var\(--font-codec\)/);
    expect(css).toMatch(/--vh-font-body:\s*var\(--font-roboto\)/);
    expect(css).toMatch(/--font-display:\s*var\(--vh-font-display\)/);
    expect(css).toMatch(/--font-sans:\s*var\(--vh-font-body\)/);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--vh-font-body\)/);
  });

  it('os dois arquivos de fonte existem e são woff2', () => {
    for (const f of ['app/fonts/roboto.woff2', 'app/fonts/codec-cold-extrabold.woff2']) {
      const bytes = readFileSync(join(RAIZ, f));
      expect(bytes.subarray(0, 4).toString('latin1'), f).toBe('wOF2');
    }
  });
});

/** Superfícies que MIGRARAM. /radar, /radarbett, /imprensa, /proposta, /conarh e /copiloto ficam de fora de propósito. */
const MIGRADAS = ['app/dashboard', 'app/admin', 'app/admin-v2', 'app/degustacao', 'app/representante', 'components'];
const ANTIGAS = /font-serif|--font-serif|--font-manrope|Instrument Serif/;

function arquivosDe(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${nome}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) { out.push(...arquivosDe(rel)); continue; }
    if (/\.(tsx?|css)$/.test(nome)) out.push(rel);
  }
  return out;
}

describe('a tela do produto não volta às fontes antigas', () => {
  it('nenhum arquivo migrado cita Instrument Serif / Manrope', () => {
    const reincidentes = MIGRADAS.flatMap(arquivosDe).filter(f => ANTIGAS.test(readFileSync(join(RAIZ, f), 'utf8')));
    // Vale também para COMENTÁRIO: o nome da fonte antiga em texto é o sinal de doc que ficou para trás.
    expect(reincidentes.map(f => relative('.', f)), 'tela migrada cita fonte antiga (comentário também conta)').toEqual([]);
  });
});
