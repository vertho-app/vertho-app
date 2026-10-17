// Composição do HyperFrames para um vídeo da biblioteca v7 (vertho.ai): um index.html autocontido (palco, base
// visual, executor próprio, linhas da marca, biblioteca, camada do montador, driver e os momentos em JSON) mais as
// fontes da marca, as ilustrações e a narração. Validado em 17/10/2026 contra os dois vídeos de validação aprovados
// (Amazon e Macaé): igual quadro a quadro dentro do ruído da comparação.
//
// Os momentos entram como DADOS (JSON); o driver chama LIB.T[tpl](dados). Nada vira código em texto.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const FUNDOS = ['navy', 'claro', 'branco'];
const RE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RE_TPL = /^[a-z][a-z_]{0,31}$/;
const RE_ARQ = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
// ordem de carga no navegador: o executor define `kit`, as linhas definem `UI`, a biblioteca usa os dois
const SCRIPTS = ['kit.js', 'ui-linhas.js', 'biblioteca.js', 'camada.js', 'driver.js'];
const ESTILOS = ['base.css', 'biblioteca.css'];

/**
 * Lê os arquivos de navegador desta pasta (ou de outra, nos testes).
 * @returns {Record<string, string>}
 */
export function lerRuntime(dir = AQUI) {
  /** @type {Record<string, string>} */
  const r = {};
  for (const n of [...SCRIPTS, ...ESTILOS]) r[n] = fs.readFileSync(path.join(dir, n), 'utf8');
  return r;
}

/**
 * Linha do tempo: início de cada momento, o fundo do anterior (para a passagem) e a duração total.
 * @param {{ id: string, tpl: string, data: object, dur: number, fundo: string }[]} momentos em ordem
 */
export function linhaDoTempo(momentos) {
  if (!Array.isArray(momentos) || !momentos.length) throw new Error('composição sem momentos');
  let t = 0;
  const saida = momentos.map((m, i) => {
    if (!RE_ID.test(String(m.id))) throw new Error('id de momento inválido: ' + m.id);
    if (!RE_TPL.test(String(m.tpl))) throw new Error('modelo inválido: ' + m.tpl);
    if (!FUNDOS.includes(m.fundo)) throw new Error('fundo inválido em ' + m.id + ': ' + m.fundo);
    if (!(m.dur > 0) || m.dur > 120) throw new Error('duração inválida em ' + m.id + ': ' + m.dur);
    const r = { id: m.id, tpl: m.tpl, data: m.data || {}, dur: m.dur, fundo: m.fundo, anterior: i ? momentos[i - 1].fundo : 'navy', start: +t.toFixed(4) };
    t += m.dur;
    return r;
  });
  return { momentos: saida, duracao: +t.toFixed(3) };
}

// texto dentro de <script>/<style>: só o fechamento da tag precisa de escape; JSON dentro de <script type=json>: "<"
const noScript = (s) => String(s).replace(/<\/script/gi, '<\\/script');
const noStyle = (s) => String(s).replace(/<\/style/gi, '<\\/style');
const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

/**
 * O index.html (puro: não toca no disco).
 * @param {object} o
 * @param {object[]} o.momentos em ordem ({ id, tpl, data, dur, fundo })
 * @param {Record<string,string>} [o.assets] nome usado pelo modelo → caminho relativo no projeto (ilustrações)
 * @param {{ arquivo: string, inicio: number }[]} [o.audios] caminho RELATIVO no projeto + início em segundos
 * @param {Record<string,string>} o.runtime os textos de lerRuntime()
 */
export function htmlDaComposicao({ momentos, assets = {}, audios = [], runtime, fps = 30, largura = 1920, altura = 1080, fundoPalco = '#0F2B54' }) {
  const { momentos: ms, duracao } = linhaDoTempo(momentos);
  const dados = { momentos: ms, duracao, fps, assets, fontes: ['400 40px "Codec-ExtraBold"', '400 40px "Roboto"', '500 40px "Roboto"', '700 40px "Roboto"'] };
  const tagsAudio = audios.map((a, i) => {
    if (!RE_ARQ.test(path.basename(a.arquivo))) throw new Error('nome de áudio inválido: ' + a.arquivo);
    const ini = Math.max(0, +a.inicio || 0);
    return `  <audio id="voz-${i}" src="${a.arquivo}" data-start="${ini}" data-duration="${(duracao - ini).toFixed(3)}" data-volume="1"></audio>`;
  });
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${largura}, height=${altura}" />
<style>
  @font-face { font-family: "Codec-ExtraBold"; src: url(fontes/Codec-ExtraBold.woff2) format("woff2"); font-weight: 100 900; font-display: block; }
  @font-face { font-family: "Roboto"; src: url(fontes/Roboto.woff2) format("woff2"); font-weight: 100 900; font-display: block; }
  html, body { margin: 0; width: ${largura}px; height: ${altura}px; overflow: hidden; background: ${fundoPalco}; }
  #root { position: relative; width: ${largura}px; height: ${altura}px; }
  #filme { position: absolute; inset: 0; }
  #stage { position: absolute; left: 0; top: 0; width: ${largura}px; height: ${altura}px; overflow: hidden; background: ${fundoPalco}; --sans: "Roboto"; --display: "Codec-ExtraBold"; }
  #stage .cena { position: absolute; inset: 0; overflow: hidden; display: none; }
</style>
${ESTILOS.map((n) => `<style>\n${noStyle(runtime[n])}\n</style>`).join('\n')}
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duracao}" data-width="${largura}" data-height="${altura}" data-fps="${fps}" data-no-timeline>
  <div id="filme" class="clip" data-start="0" data-duration="${duracao}" data-track-index="0" data-no-timeline>
    <div id="stage"></div>
  </div>
${tagsAudio.join('\n')}
</div>
<script type="application/json" id="filme-dados">${jsonSeguro(dados)}</script>
${SCRIPTS.map((n) => `<script>\n${noScript(runtime[n])}\n</script>`).join('\n')}
</body>
</html>
`;
  return { html, duracao, momentos: ms.length };
}

/**
 * Escreve o projeto do HyperFrames numa pasta: index.html, fontes/, midia/.
 * @param {object} o
 * @param {string} o.destino pasta do projeto (recriada)
 * @param {{ codec: string, roboto: string }} o.fontes caminhos dos .woff2 da marca
 * @param {{ nome: string, arquivo: string }[]} [o.imagens] ilustrações (o nome é o que o plano usa em `arquivo`)
 * @param {{ arquivo: string, inicio: number }[]} [o.audios] narração por cena (caminho no disco + início)
 */
export function montarComposicao({ destino, momentos, fontes, imagens = [], audios = [], runtimeDir = AQUI, ...resto }) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(path.join(destino, 'fontes'), { recursive: true });
  fs.mkdirSync(path.join(destino, 'midia'), { recursive: true });
  fs.copyFileSync(fontes.codec, path.join(destino, 'fontes', 'Codec-ExtraBold.woff2'));
  fs.copyFileSync(fontes.roboto, path.join(destino, 'fontes', 'Roboto.woff2'));
  const assets = {};
  for (const im of imagens) {
    if (!RE_ARQ.test(im.nome)) throw new Error('nome de imagem inválido: ' + im.nome);
    fs.copyFileSync(im.arquivo, path.join(destino, 'midia', im.nome));
    assets[im.nome] = 'midia/' + im.nome;
  }
  const rel = audios.map((a) => {
    const nome = path.basename(a.arquivo);
    fs.copyFileSync(a.arquivo, path.join(destino, 'midia', nome));
    return { arquivo: 'midia/' + nome, inicio: a.inicio };
  });
  const r = htmlDaComposicao({ momentos, assets, audios: rel, runtime: lerRuntime(runtimeDir), ...resto });
  fs.writeFileSync(path.join(destino, 'index.html'), r.html);
  return { arquivo: path.join(destino, 'index.html'), duracao: r.duracao, momentos: r.momentos };
}
