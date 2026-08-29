/**
 * Gera o PDF de uma proposta comercial a partir do modelo HTML.
 *
 *   node scripts/build-proposta.mjs \
 *     --src "../deliverables/propostas/proposta.src.html" \
 *     --dados "../deliverables/propostas/boehringer.json" \
 *     --out "Proposta Vertho - Boehringer.pdf"
 *
 * O modelo é o TEMPLATE (com {{CAMPOS}}); o JSON traz os valores do cliente.
 * As fontes e o logo entram como data URI, então o PDF fica com a tipografia
 * certa sem depender de rede nem de caminho de arquivo.
 *
 * O script é fail-loud: se sobrar um {{CAMPO}} sem valor, ele reclama e não
 * finge que deu certo. Campos deliberadamente em branco (preço, datas) usam a
 * classe .fill no HTML e são contados no fim como pendência de preenchimento.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(AQUI, '..');

// ── args ─────────────────────────────────────────────────────────────────
function arg(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}
const abs = (p) => (isAbsolute(p) ? p : resolve(APP, p));

const SRC = abs(arg('src', '../deliverables/propostas/proposta.src.html'));
const DADOS = arg('dados', null);
const OUT_NOME = arg('out', 'Proposta Vertho.pdf');
const OUT_DIR = arg('dir', join(homedir(), 'Downloads'));

if (!existsSync(SRC)) {
  console.error(`✗ modelo não encontrado: ${SRC}`);
  process.exit(1);
}

// ── assets em data URI ───────────────────────────────────────────────────
const dataUri = (caminho, mime) => {
  const p = join(APP, caminho);
  if (!existsSync(p)) {
    console.error(`✗ asset não encontrado: ${p}`);
    process.exit(1);
  }
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
};

const ASSETS = {
  FONT_SPACE_GROTESK: dataUri('app/fonts/space-grotesk.woff2', 'font/woff2'),
  FONT_PLEX_400: dataUri('app/fonts/ibm-plex-sans-400.woff2', 'font/woff2'),
  FONT_PLEX_500: dataUri('app/fonts/ibm-plex-sans-500.woff2', 'font/woff2'),
  FONT_PLEX_600: dataUri('app/fonts/ibm-plex-sans-600.woff2', 'font/woff2'),
  FONT_MONO_400: dataUri('app/fonts/ibm-plex-mono-400.woff2', 'font/woff2'),
  FONT_MONO_500: dataUri('app/fonts/ibm-plex-mono-500.woff2', 'font/woff2'),
  // ⚠️ logo-vertho-cover.png é o H ESCURO (tinta índigo), o certo para papel
  // branco. logo-vertho.png é o CLARO e SOME no branco, sem erro nenhum.
  LOGO_H_DARK: dataUri('public/logo-vertho-cover.png', 'image/png'),
};

// ── dados do cliente ─────────────────────────────────────────────────────
const dados = DADOS ? JSON.parse(readFileSync(abs(DADOS), 'utf8')) : {};

// Datas derivadas: emissão = hoje, validade = +30 dias (padrão da casa).
const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const hoje = new Date();
const validade = new Date(hoje);
validade.setDate(validade.getDate() + (dados.VALIDADE_DIAS || 30));

const CAMPOS = {
  ...ASSETS,
  DATA_EMISSAO: fmt(hoje),
  DATA_VALIDADE: fmt(validade),
  ...dados,
};

// ── substituição ─────────────────────────────────────────────────────────
let html = readFileSync(SRC, 'utf8');
for (const [k, v] of Object.entries(CAMPOS)) {
  html = html.split(`{{${k}}}`).join(String(v));
}

const faltando = [...new Set([...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]))];
if (faltando.length) {
  console.error(`✗ campos sem valor no JSON: ${faltando.join(', ')}`);
  process.exit(1);
}

// HTML montado fica ao lado do modelo, para conferência visual no navegador.
const htmlOut = SRC.replace(/\.src\.html$/, '.html');
writeFileSync(htmlOut, html, 'utf8');

// ── PDF ──────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const pdfPath = join(OUT_DIR, OUT_NOME);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

// Guarda de paginação: cada <section class="page"> tem de caber em UMA folha A4.
// Se um texto crescer e a seção passar de 297mm, o Chromium a parte em duas e a
// numeração do rodapé (que é fixa no HTML) passa a mentir, sem erro nenhum.
const LIMITE_PX = 1122.5; // 297mm a 96dpi
const alturas = await page.evaluate(() =>
  [...document.querySelectorAll('section.page')].map((s) => s.getBoundingClientRect().height),
);
const estouros = alturas
  .map((h, i) => ({ pagina: i + 1, excedente: h - LIMITE_PX }))
  .filter((x) => x.excedente > 0.5);
if (estouros.length) {
  await browser.close();
  console.error('✗ seções que não cabem em uma folha A4 (o rodapé vai numerar errado):');
  for (const e of estouros) console.error(`    página ${e.pagina}: +${e.excedente.toFixed(0)}px`);
  console.error('  Corte texto ou aperte o espaçamento até zerar, e gere de novo.');
  process.exit(1);
}

await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});

// Screenshot das páginas para conferência. O guard prova que o código roda;
// só a imagem prova o que a pessoa vê.
const shotDir = arg('shots', null);
if (shotDir) {
  mkdirSync(abs(shotDir), { recursive: true });
  const paginas = await page.locator('section.page').all();
  for (let i = 0; i < paginas.length; i++) {
    await paginas[i].screenshot({ path: join(abs(shotDir), `p${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log(`  ${paginas.length} páginas capturadas em ${abs(shotDir)}`);
}

const pendencias = (html.match(/class="fill(-block)?"/g) || []).length;
await browser.close();

console.log(`✓ HTML  ${htmlOut}`);
console.log(`✓ PDF   ${pdfPath}`);
console.log(
  pendencias
    ? `⚠ ${pendencias} campo(s) marcado(s) em âmbar ainda a preencher. Não enviar assim.`
    : '✓ nenhum campo pendente.',
);
