/**
 * CONARH 52 — pré-renderiza as PÁGINAS dos PDFs da demo como imagem.
 *
 *   npx --yes tsx scripts/_conarh-paginas-pdf.ts
 *   → public/conarh/media/paginas/<slug>-pNN.webp
 *   → app/conarh/_data/paginas-pdf.json  (manifesto lido pela tela)
 *
 * POR QUÊ (07/08/2026): os cards abriam o PDF com `target="_blank"`. Num PWA
 * instalado no iOS o link em nova aba sai para uma view SEM barra de navegação:
 * o expositor abre o documento e **não consegue voltar para a demo** — medido
 * no iPhone. Fechar o app no multitarefa é a única saída, na frente do
 * visitante. E a mesma view é outro contexto de armazenamento, então em modo
 * avião ela nem teria o cache do service worker.
 *
 * A saída é o documento ser folheado DENTRO do app. Entre renderizar o PDF no
 * cliente (pdf.js, ~1,7 MB de JS) e servir as páginas como imagem, esta escolha
 * é a imagem: `<img>` é decodificada pelo Safari com gestão de memória própria
 * (10 canvas A4 em devicePixelRatio 2 são ~180 MB e derrubam a aba do iPhone),
 * entra no PRECACHE por nome ESTÁVEL — chunk de JS tem hash e só entraria no
 * cache de runtime, isto é, se alguém tivesse aberto um PDF antes do modo avião.
 *
 * O PDF continua no repositório e no precache: ele é a peça que a pessoa
 * recebe, e a tela ainda o entrega pelo botão de download (que no iOS abre a
 * folha de compartilhamento, não uma janela sem volta).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const RAIZ = path.resolve(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public', 'conarh');
const DESTINO = path.join(PUBLICO, 'media', 'paginas');
// Duas cópias do MESMO manifesto, por consumidores diferentes: a tela importa
// em build-time (`_data`), o service worker busca em runtime (`public`) para
// precachear as páginas sem lista fixa. O guard de CI compara as duas.
const MANIFESTO = path.join(RAIZ, 'app', 'conarh', '_data', 'paginas-pdf.json');
const MANIFESTO_PUBLICO = path.join(PUBLICO, 'paginas-pdf.json');
const PDFJS = path.join(RAIZ, 'node_modules', 'pdfjs-dist', 'build');

/** Os PDFs que a TELA abre. Reserva de conteúdo (personas) fica de fora — não é
 *  renderizada, e cada página aqui pesa no precache do tablet. */
const PDFS = [
  '/conarh/pdi-renata-falcao.pdf',
  '/conarh/media/guia-sandra-roteiro.pdf',
  '/conarh/media/perfil-exemplo-d.pdf',
  '/conarh/media/relatorio-gestor.pdf',
  '/conarh/media/relatorio-rh.pdf',
  '/conarh/media/perfil-organizacional.pdf',
  '/conarh/media/dna-organizacional.pdf',
];

/** 2× o A4 em pontos = 1190 px de largura. Abaixo disso o texto de corpo do
 *  relatório fica mole no iPad retina; acima, o peso sobe sem ganho visível. */
const ESCALA = 2;
const QUALIDADE = 0.82;

const PAGINA_HTML = `<!doctype html><meta charset="utf-8"><body><script type="module">
import * as pdfjs from '/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
window.abrir = async (url) => {
  window.__doc = await pdfjs.getDocument(url).promise;
  return window.__doc.numPages;
};
window.render = async (n, escala, qualidade) => {
  const pagina = await window.__doc.getPage(n);
  const vp = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  // Fundo branco: PDF sem cor de fundo vira WebP com alfa preto no Safari.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas.toDataURL('image/webp', qualidade);
};
window.__pronto = true;
</script></body>`;

function tipoDe(arquivo: string) {
  if (arquivo.endsWith('.mjs')) return 'text/javascript';
  if (arquivo.endsWith('.pdf')) return 'application/pdf';
  return 'text/html';
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });

  // Servidor efêmero: o pdf.js precisa de origem http (worker como módulo e
  // fetch do PDF não funcionam em file://).
  const servidor = createServer((req, res) => {
    const rota = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rota === '/' || rota === '/render.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGINA_HTML);
      return;
    }
    const alvo = rota.startsWith('/pdfjs/')
      ? path.join(PDFJS, rota.slice('/pdfjs/'.length))
      : path.join(PUBLICO, rota.replace(/^\/conarh\//, ''));
    if (!fs.existsSync(alvo)) {
      res.writeHead(404);
      res.end('nao encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': tipoDe(alvo) });
    res.end(fs.readFileSync(alvo));
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = (servidor.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${porta}`;

  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  const erros: string[] = [];
  pagina.on('pageerror', (e) => erros.push(String(e)));
  await pagina.goto(`${base}/render.html`);
  await pagina.waitForFunction('window.__pronto === true', undefined, { timeout: 30_000 });

  const manifesto: Record<string, string[]> = {};
  let bytesTotais = 0;

  for (const pdf of PDFS) {
    const slug = path.basename(pdf, '.pdf');
    const total = (await pagina.evaluate((u) => (window as any).abrir(u), `${base}${pdf}`)) as number;
    const paginas: string[] = [];

    for (let n = 1; n <= total; n++) {
      const dataUrl = (await pagina.evaluate(
        ([num, esc, q]) => (window as any).render(num, esc, q),
        [n, ESCALA, QUALIDADE] as const,
      )) as string;
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      const nome = `${slug}-p${String(n).padStart(2, '0')}.webp`;
      fs.writeFileSync(path.join(DESTINO, nome), bytes);
      paginas.push(`/conarh/media/paginas/${nome}`);
      bytesTotais += bytes.length;
    }

    manifesto[pdf] = paginas;
    console.log(`${String(total).padStart(2)} pág  ${slug}`);
  }

  if (erros.length) throw new Error(`erro na renderização: ${erros.join(' · ')}`);

  const json = `${JSON.stringify(manifesto, null, 2)}\n`;
  fs.writeFileSync(MANIFESTO, json, 'utf8');
  fs.writeFileSync(MANIFESTO_PUBLICO, json, 'utf8');
  await navegador.close();
  servidor.close();

  const totalPaginas = Object.values(manifesto).reduce((s, p) => s + p.length, 0);
  console.log(
    `\n${totalPaginas} páginas · ${(bytesTotais / 1024 / 1024).toFixed(1)} MB · manifesto em app/conarh/_data/paginas-pdf.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
