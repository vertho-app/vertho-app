// Monta o Manual de Telas (HTML navegável) a partir de:
//   dados/telas-*.json  → o que cada tela mostra e o que cada controle faz (lido do código)
//   dados/capturas.json → o print de cada tela (Playwright)
// Gera: manual.html + img-web/*.jpg (versão leve das capturas)
//
// Uso: node scripts/_montar-manual-telas.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const BASE = fileURLToPath(new URL('../../deliverables/manual-telas/', import.meta.url));
const DADOS = path.join(BASE, 'dados');
const IMG_ORIG = path.join(BASE, 'img');
const IMG_WEB = path.join(BASE, 'img-web');
// O sufixo do logo é a TINTA, não o fundo: "escuro" é tinta escura, para papel claro.
// A capa é azul-escura, então vai o de tinta clara — o mesmo que o app usa na sidebar.
const LOGO = fileURLToPath(new URL('../public/logo-vertho.png', import.meta.url));

// ── ordem e títulos das seções ──────────────────────────────────────────────
const PARTES = [
  {
    id: 'admin',
    numero: 'Parte 1',
    titulo: 'Painel administrativo',
    resumo:
      'As telas de app.vertho.ai/admin — onde a Vertho configura tenants, roda o pipeline de implantação, '
      + 'opera as trilhas, cuida do conteúdo e governa a plataforma. Só platform admin entra.',
    blocos: [
      ['visao-geral', 'Visão geral e empresas'],
      ['pipeline-fases', 'Pipeline de implantação (fases 0 a 4)'],
      ['configuracao', 'Configuração do tenant'],
      ['operacao', 'Operação do dia a dia'],
      ['conteudo', 'Conteúdo: acervo, kit semanal e vídeos'],
      ['modulos-base', 'Módulos-Base (conteúdo mestre da Vertho)'],
      ['resultados', 'Resultados e entregáveis'],
      ['auditoria-vertho', 'Auditoria Vertho (qualidade do motor)'],
      ['radar-dados', 'Radar educacional (ingestão de dados)'],
      ['comercial', 'Canal comercial'],
      ['radar-empresas', 'Radar Empresas e mercado potencial'],
      ['custos', 'Custos de IA e orçamento'],
      ['sistema', 'Sistema e governança'],
    ],
  },
  {
    id: 'colaborador',
    numero: 'Parte 2',
    titulo: 'Telas do colaborador e do gestor',
    resumo:
      'O que a pessoa vê no subdomínio do tenant (ex.: acme-demo.vertho.ai). O admin não usa estas telas no '
      + 'dia a dia, mas é aqui que chega quase todo chamado de suporte — por isso cada tela traz por que ela '
      + 'pode não aparecer para alguém.',
    blocos: [
      ['user-entrada', 'Entrada e início'],
      ['user-assessment', 'Diagnóstico: assessment e perfil comportamental'],
      ['user-trilha', 'Trilha semanal (Temporada)'],
      ['user-outros', 'PDI, evolução, pulso e votação'],
      ['gestor', 'Área do gestor'],
    ],
  },
  {
    id: 'representante',
    numero: 'Parte 3',
    titulo: 'Portal do Representante',
    resumo:
      'O canal comercial dos representantes (RCs), em app.vertho.ai/representante. Quem entra é quem tem '
      + 'linha em sales_representatives — platform admin não passa por aqui, o caminho dele é o Canal Comercial.',
    blocos: [
      ['rep-carteira', 'Início, carteira e comissões'],
      ['rep-crm', 'CRM e inteligência comercial'],
      ['rep-propostas', 'Propostas'],
    ],
  },
];

// ── util ────────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Realça `arquivo.tsx:123` e trechos em backtick dentro do texto corrido. */
function rico(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\b((?:app|lib|actions|components|trigger|migrations)\/[\w./\[\]-]+(?::\d+(?:-\d+)?)?)/g, '<code>$1</code>');
}

/** `/admin/empresas/455f.../fase0?x=1` e `/admin/empresas/[empresaId]/fase0` viram a MESMA chave. */
function chaveRota(rota) {
  return (rota || '')
    .split('?')[0]
    .split('/')
    .map((seg) =>
      // os agentes escreveram o parâmetro de três jeitos: [x], {x} e <x>
      /^[[{<].+[\]}>]$/.test(seg) ? '[id]'
        : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ? '[id]'
          : /^\d+$/.test(seg) ? '[id]'
            : seg)
    .join('/')
    .replace(/\/$/, '');
}

/**
 * Vários agentes devolveram título com aposto ("Painel Admin (cabeçalho fixo) — conteúdo: …").
 * Corta no primeiro separador, desde que sobre nome de verdade (≥ 8 caracteres) —
 * o limiar existe para não transformar "Kits (por coorte)" em "Kits".
 */
function tituloCurto(t) {
  let s = String(t || '').trim();
  if (s.length > 46) {
    const corte = s.search(/\s+[—–]\s+|\s+\(|\s+·\s+|:\s/);
    if (corte >= 8) s = s.slice(0, corte).trim().replace(/[:\-–—]$/, '').trim();
  }
  return s.length > 72 ? s.slice(0, 69).trim() + '…' : s;
}

const SIM_NAO = {
  sim: ['reversivel-sim', 'Reversível'],
  nao: ['reversivel-nao', 'Irreversível'],
  parcial: ['reversivel-parcial', 'Parcial'],
};

// ── carga ───────────────────────────────────────────────────────────────────
// `final-*` é a versão já passada pelo revisor cético; `telas-*` é o insumo cru.
// Prefere o final quando existe — e guarda quem foi verificado, para o manual poder
// DIZER isso em vez de deixar o leitor supor.
const blocos = {};
for (const f of readdirSync(DADOS).filter((x) => /^telas-.*\.json$/.test(x))) {
  const chave = f.replace(/^telas-|\.json$/g, '');
  const final = path.join(DADOS, `final-${chave}.json`);
  const j = JSON.parse(readFileSync(existsSync(final) ? final : path.join(DADOS, f), 'utf8'));
  blocos[j.bloco || chave] = j;
}
const verificados = Object.values(blocos).filter((b) => b._verificado).length;
const totalBlocos = Object.keys(blocos).length;
const capturas = JSON.parse(readFileSync(path.join(DADOS, 'capturas.json'), 'utf8'));
const porRota = new Map();
for (const c of capturas) porRota.set(chaveRota(c.rota), c);

// ── imagens ─────────────────────────────────────────────────────────────────
if (!existsSync(IMG_WEB)) mkdirSync(IMG_WEB, { recursive: true });
async function prepararImagem(slug) {
  const orig = path.join(IMG_ORIG, `${slug}.png`);
  if (!existsSync(orig)) return null;
  const destino = path.join(IMG_WEB, `${slug}.jpg`);
  if (!existsSync(destino)) {
    await sharp(orig)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(destino);
  }
  const meta = await sharp(destino).metadata();
  return { src: `img-web/${slug}.jpg`, w: meta.width, h: meta.height };
}

// ── render de uma tela ──────────────────────────────────────────────────────
async function renderTela(tela, n, idSecao) {
  const cap = porRota.get(chaveRota(tela.rota));
  const img = cap ? await prepararImagem(cap.slug) : null;
  const id = `${idSecao}-${n}`;
  const avisos = [];
  if (cap?.redirecionou) {
    avisos.push(
      `<strong>Esta rota redireciona.</strong> Ao abrir <code>${esc(tela.rota)}</code> o sistema leva para `
      + `<code>${esc(new URL(cap.urlFinal).pathname + new URL(cap.urlFinal).search)}</code> — a tela foi absorvida `
      + `por outra (ou por uma aba dela). O print abaixo é do destino real.`);
  }
  if (cap?.aindaCarregando) {
    avisos.push('<strong>Print tirado com a tela ainda carregando.</strong> O conteúdo desta área depende de uma consulta que não respondeu no tempo da captura.');
  }
  if (cap?.nota) avisos.push(`<strong>Origem do print:</strong> ${esc(cap.nota)}.`);
  if (!cap) avisos.push('<strong>Sem print.</strong> Esta rota não entrou na captura automática.');

  const controles = (tela.controles || []).map((c) => {
    const [cls, rot] = SIM_NAO[String(c.reversivel || '').toLowerCase()] || ['reversivel-na', '—'];
    const cuidado = c.cuidados && c.cuidados !== '-' ? `<div class="cuidado">${rico(c.cuidados)}</div>` : '';
    return `<tr>
      <td class="ctrl"><span class="ctrl-nome">${esc(c.rotulo)}</span><span class="ctrl-tipo">${esc(c.tipo || '')}</span></td>
      <td>${rico(c.oQueFaz)}</td>
      <td class="efeito">${rico(c.efeito || '—')}${cuidado}</td>
      <td class="rev"><span class="${cls}">${rot}</span></td>
    </tr>`;
  }).join('\n');

  const mostra = (tela.oQueMostra || []).map((b) =>
    `<div class="mostra-item"><dt>${esc(b.bloco)}</dt><dd>${rico(b.descricao)}</dd></div>`).join('\n');

  const incertezas = (tela.incertezas || []).filter(Boolean);

  return `
<article class="tela" id="${id}" data-busca="${esc((tela.titulo + ' ' + tela.rota + ' ' + (tela.controles || []).map((c) => c.rotulo).join(' ')).toLowerCase())}">
  <header class="tela-head">
    <div class="tela-num">${n}</div>
    <div>
      <h3>${esc(tituloCurto(tela.titulo))}</h3>
      <code class="rota">${esc(tela.rota)}</code>
    </div>
  </header>

  <dl class="meta">
    <div><dt>Como chegar</dt><dd>${rico(tela.comoChegar)}</dd></div>
    <div><dt>Quem acessa</dt><dd>${rico(tela.quemAcessa)}</dd></div>
    ${tela.preRequisitos && tela.preRequisitos !== '-' ? `<div><dt>Pré-requisitos</dt><dd>${rico(tela.preRequisitos)}</dd></div>` : ''}
    <div><dt>Arquivo</dt><dd><code>${esc(tela.arquivo)}</code></dd></div>
  </dl>

  ${avisos.length ? `<div class="avisos">${avisos.map((a) => `<p>${a}</p>`).join('')}</div>` : ''}

  ${img ? `<figure class="print"><a href="${img.src}" target="_blank"><img src="${img.src}" width="${img.w}" height="${img.h}" alt="Tela ${esc(tituloCurto(tela.titulo))}" loading="lazy"></a><figcaption>Clique para abrir em tamanho real</figcaption></figure>` : ''}

  <h4>Para que serve</h4>
  <p class="serve">${rico(tela.paraQueServe)}</p>

  ${mostra ? `<h4>O que a tela mostra</h4><dl class="mostra">${mostra}</dl>` : ''}

  ${controles ? `<h4>O que cada controle faz <span class="contagem">${(tela.controles || []).length}</span></h4>
  <div class="tabela-wrap"><table class="controles">
    <thead><tr><th>Controle</th><th>O que faz</th><th>Efeito no sistema</th><th>Volta atrás?</th></tr></thead>
    <tbody>${controles}</tbody>
  </table></div>` : ''}

  <div class="notas">
    ${tela.estadosVazios && tela.estadosVazios !== '-' ? `<div class="nota"><span class="rot">Quando está vazia</span>${rico(tela.estadosVazios)}</div>` : ''}
    ${tela.dicas && tela.dicas !== '-' ? `<div class="nota dica"><span class="rot">Na prática</span>${rico(tela.dicas)}</div>` : ''}
    ${incertezas.length ? `<div class="nota atencao"><span class="rot">Pontos de atenção apurados no código</span><ul>${incertezas.map((i) => `<li>${rico(i)}</li>`).join('')}</ul></div>` : ''}
  </div>
</article>`;
}

// ── montagem ────────────────────────────────────────────────────────────────
const logoB64 = existsSync(LOGO) ? readFileSync(LOGO).toString('base64') : null;
const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

let corpo = '';
let sumario = '';
let totalTelas = 0;
let totalControles = 0;
let n = 0;

for (const parte of PARTES) {
  const disponiveis = parte.blocos.filter(([k]) => blocos[k]);
  if (!disponiveis.length) continue;
  const telasParte = disponiveis.reduce((a, [k]) => a + blocos[k].telas.length, 0);

  sumario += `<li class="sum-parte"><a href="#${parte.id}">${parte.numero} · ${esc(parte.titulo)}</a><span>${telasParte}</span></li>`;
  corpo += `<section class="parte" id="${parte.id}">
    <div class="parte-head">
      <span class="parte-num">${parte.numero}</span>
      <h2>${esc(parte.titulo)}</h2>
      <p>${esc(parte.resumo)}</p>
    </div>`;

  for (const [chave, titulo] of disponiveis) {
    const bloco = blocos[chave];
    sumario += `<li class="sum-bloco"><a href="#b-${chave}">${esc(titulo)}</a><span>${bloco.telas.length}</span></li>`;
    corpo += `<div class="bloco" id="b-${chave}"><h3 class="bloco-titulo">${esc(titulo)}</h3>`;
    for (const tela of bloco.telas) {
      n++; totalTelas++;
      totalControles += (tela.controles || []).length;
      corpo += await renderTela(tela, n, chave);
    }
    corpo += `</div>`;
  }
  corpo += `</section>`;
}

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manual de Telas · Vertho</title>
<style>
:root{
  --tinta:#0d2340; --tinta-2:#3a4f6b; --tinta-3:#6b7f99;
  --teal:#0f8f97; --teal-claro:#e6f7f8; --roxo:#7b3fb5;
  --papel:#ffffff; --papel-2:#f6f8fa; --linha:#e3e8ef;
  --alerta:#b45309; --alerta-bg:#fff8ed; --perigo:#b91c1c; --perigo-bg:#fef2f2;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"Cascadia Code",Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);font-family:var(--sans);
     font-size:15px;line-height:1.62;-webkit-font-smoothing:antialiased}
code{font-family:var(--mono);font-size:.87em;background:var(--papel-2);border:1px solid var(--linha);
     border-radius:4px;padding:.05em .35em;color:#33507a;word-break:break-word}

/* ── capa ── */
.capa{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:8vh 7vw;
      background:linear-gradient(160deg,#06172c 0%,#0a2242 55%,#0d2c52 100%);color:#dce8ff}
.capa img{width:170px;height:auto;margin-bottom:auto;opacity:.95}
.capa h1{font-family:var(--serif);font-size:clamp(42px,7vw,84px);line-height:1.02;margin:.35em 0 .1em;
         font-weight:400;letter-spacing:-.02em;color:#fff}
.capa h1 em{font-style:italic;color:#34c5cc}
.capa .sub{font-size:clamp(16px,2vw,21px);color:#8fa8cc;max-width:44ch;line-height:1.5}
.capa .fatos{margin-top:auto;padding-top:5vh;display:flex;flex-wrap:wrap;gap:2.5rem;
             border-top:1px solid rgba(255,255,255,.14)}
.capa .fato b{display:block;font-family:var(--serif);font-size:34px;color:#34c5cc;line-height:1}
.capa .fato span{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#7e97bd}

/* ── leitura ── */
.leitura{max-width:1180px;margin:0 auto;padding:0 6vw}
.intro{padding:9vh 0 5vh;border-bottom:1px solid var(--linha)}
.intro h2{font-family:var(--serif);font-weight:400;font-size:34px;margin:0 0 .5em}
.intro p{max-width:74ch;color:var(--tinta-2)}
.legenda{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.1rem;margin-top:2.4rem}
.legenda div{background:var(--papel-2);border:1px solid var(--linha);border-radius:10px;padding:1rem 1.15rem}
.legenda b{display:block;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--teal);margin-bottom:.35rem}
.legenda p{margin:0;font-size:13.5px;color:var(--tinta-2)}

/* ── sumário ── */
.sumario{padding:6vh 0}
.sumario h2{font-family:var(--serif);font-weight:400;font-size:30px;margin:0 0 1.2em}
.sumario ol{list-style:none;padding:0;margin:0;columns:2;column-gap:3.5rem}
.sumario li{break-inside:avoid;display:flex;justify-content:space-between;gap:1rem;
            border-bottom:1px dotted var(--linha);padding:.42rem 0}
.sumario li span{color:var(--tinta-3);font-size:12.5px;font-variant-numeric:tabular-nums}
.sumario a{color:var(--tinta);text-decoration:none}
.sumario a:hover{color:var(--teal)}
.sum-parte{margin-top:1.1rem;font-weight:700;border-bottom:1px solid var(--tinta)!important}
.sum-parte:first-child{margin-top:0}
.sum-bloco{padding-left:.9rem!important;font-size:14px}

/* ── busca ── */
.busca{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);
       border-bottom:1px solid var(--linha);padding:.7rem 0;margin-bottom:2rem}
.busca input{width:100%;max-width:420px;padding:.6rem .9rem;border:1px solid var(--linha);border-radius:8px;
             font-size:14px;font-family:inherit;color:var(--tinta)}
.busca input:focus{outline:2px solid var(--teal);outline-offset:1px;border-color:transparent}
.busca .conta{font-size:12.5px;color:var(--tinta-3);margin-left:.9rem}

/* ── partes e blocos ── */
.parte-head{padding:8vh 0 3vh;border-top:2px solid var(--tinta);margin-top:5vh}
.parte-num{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal);font-weight:700}
.parte-head h2{font-family:var(--serif);font-weight:400;font-size:clamp(30px,4.4vw,46px);margin:.15em 0 .3em}
.parte-head p{max-width:70ch;color:var(--tinta-2);margin:0}
.bloco-titulo{font-size:13px;text-transform:uppercase;letter-spacing:.14em;color:var(--tinta-3);
              margin:4rem 0 1.4rem;padding-bottom:.5rem;border-bottom:1px solid var(--linha)}

/* ── tela ── */
/* scroll-margin: a barra de busca é sticky — sem isso o título da ficha
   entra embaixo dela ao pular por link do sumário. */
.tela{padding:2.4rem 0 3rem;border-bottom:1px solid var(--linha);scroll-margin-top:76px}
.bloco,.parte{scroll-margin-top:76px}
.tela-head{display:flex;gap:1.1rem;align-items:baseline}
.tela-num{font-family:var(--serif);font-size:30px;color:var(--linha);line-height:1;min-width:1.6em}
.tela-head h3{font-size:24px;margin:0 0 .18em;letter-spacing:-.01em;font-weight:700}
.rota{background:var(--teal-claro);border-color:#bfe6e9;color:#0b6f76;font-size:12.5px}

.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:.1rem 2rem;
      margin:1.5rem 0 0;padding:1.1rem 1.3rem;background:var(--papel-2);border:1px solid var(--linha);border-radius:10px}
.meta>div{padding:.42rem 0}
.meta dt{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--tinta-3);font-weight:700}
.meta dd{margin:.2rem 0 0;font-size:13.5px;color:var(--tinta-2)}

.avisos{margin:1.2rem 0 0;border-left:3px solid var(--alerta);background:var(--alerta-bg);
        padding:.85rem 1.1rem;border-radius:0 8px 8px 0}
.avisos p{margin:.25rem 0;font-size:13.5px;color:#7c4a10}

.print{margin:1.6rem 0 0}
.print img{width:100%;height:auto;border:1px solid var(--linha);border-radius:10px;display:block;
           box-shadow:0 6px 26px rgba(13,35,64,.13)}
.print figcaption{font-size:11.5px;color:var(--tinta-3);margin-top:.5rem;text-align:right}

.tela h4{font-size:12px;text-transform:uppercase;letter-spacing:.13em;color:var(--teal);
         margin:2.3rem 0 .7rem;font-weight:700}
.contagem{background:var(--teal-claro);color:#0b6f76;border-radius:20px;padding:.08em .6em;
          font-size:11px;letter-spacing:0;margin-left:.4em}
.serve{max-width:78ch;margin:0}

.mostra{margin:0;display:grid;gap:.1rem}
.mostra-item{display:grid;grid-template-columns:minmax(150px,230px) 1fr;gap:1.4rem;
             padding:.6rem 0;border-bottom:1px solid var(--papel-2)}
.mostra dt{font-weight:700;font-size:14px}
.mostra dd{margin:0;color:var(--tinta-2);font-size:14px}

.tabela-wrap{overflow-x:auto;border:1px solid var(--linha);border-radius:10px}
table.controles{width:100%;border-collapse:collapse;font-size:13.5px;min-width:760px}
table.controles th{background:var(--papel-2);text-align:left;padding:.7rem .9rem;font-size:11px;
                   text-transform:uppercase;letter-spacing:.09em;color:var(--tinta-3);
                   border-bottom:1px solid var(--linha);white-space:nowrap}
table.controles td{padding:.8rem .9rem;border-bottom:1px solid var(--papel-2);vertical-align:top}
table.controles tr:last-child td{border-bottom:none}
.ctrl{width:20%}
.ctrl-nome{display:block;font-weight:700;color:var(--tinta)}
.ctrl-tipo{display:inline-block;margin-top:.28rem;font-size:10px;text-transform:uppercase;
           letter-spacing:.08em;color:var(--tinta-3);background:var(--papel-2);
           border:1px solid var(--linha);border-radius:4px;padding:.05em .4em}
.efeito{color:var(--tinta-2);width:38%}
.cuidado{margin-top:.5rem;padding:.45rem .65rem;background:var(--alerta-bg);border-left:2px solid var(--alerta);
         border-radius:0 5px 5px 0;font-size:12.5px;color:#7c4a10}
.rev{width:9%;white-space:nowrap}
.reversivel-sim{color:#15803d;font-weight:700;font-size:12px}
.reversivel-nao{color:var(--perigo);font-weight:700;font-size:12px}
.reversivel-parcial{color:var(--alerta);font-weight:700;font-size:12px}
.reversivel-na{color:var(--tinta-3);font-size:12px}

.notas{display:grid;gap:.9rem;margin-top:1.9rem}
.nota{border-left:3px solid var(--linha);padding:.2rem 0 .2rem 1.1rem;font-size:13.5px;color:var(--tinta-2)}
.nota .rot{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;
           color:var(--tinta-3);font-weight:700;margin-bottom:.25rem}
.nota.dica{border-left-color:var(--teal)}
.nota.atencao{border-left-color:var(--roxo)}
.nota ul{margin:.3rem 0 0;padding-left:1.15rem}
.nota li{margin:.25rem 0}

footer{padding:7vh 6vw;background:var(--papel-2);border-top:1px solid var(--linha);
       color:var(--tinta-3);font-size:13px}
footer b{color:var(--tinta)}

.escondido{display:none}

@media (max-width:760px){
  .sumario ol{columns:1}
  .mostra-item{grid-template-columns:1fr;gap:.1rem}
  .tela-head{flex-direction:column;gap:.3rem}
}

@media print{
  .busca{display:none}
  body{font-size:10.5px}
  .capa{min-height:auto;padding:3cm 2cm;page-break-after:always}
  .parte-head{page-break-before:always;padding-top:1cm}
  .tela{page-break-inside:avoid;border-bottom:1px solid var(--linha)}
  /* Nada de object-fit aqui: com width:100% + altura fixa ele encaixota a imagem
     e a encolhe até ficar ilegível. Deixar a proporção mandar e limitar só a altura. */
  .print img{box-shadow:none;width:auto;max-width:100%;max-height:23cm;margin:0 auto}
  .tabela-wrap{overflow:visible}
  table.controles{min-width:0;font-size:9px}
  a{color:inherit;text-decoration:none}
}
</style>
</head>
<body>

<header class="capa">
  ${logoB64 ? `<img src="data:image/png;base64,${logoB64}" alt="Vertho">` : '<div></div>'}
  <h1>Manual de <em>Telas</em></h1>
  <p class="sub">Guia do administrador da plataforma Vertho: o que cada tela mostra e o que cada botão faz.</p>
  <div class="fatos">
    <div class="fato"><b>${totalTelas}</b><span>telas documentadas</span></div>
    <div class="fato"><b>${totalControles}</b><span>controles mapeados</span></div>
    <div class="fato"><b>3</b><span>perfis de acesso</span></div>
    <div class="fato"><b>${hoje}</b><span>versão</span></div>
  </div>
</header>

<div class="leitura">

<section class="intro">
  <h2>Como ler este manual</h2>
  <p>Cada tela tem uma ficha: para que serve, o que aparece nela e uma tabela com <b>todos os controles</b> —
  botão, aba, filtro, campo — dizendo o que cada um faz e, principalmente, <b>o que ele muda no sistema</b>.
  A descrição de efeito não foi escrita olhando a tela: veio de ler o código que roda quando você clica,
  seguindo a chamada até a Server Action ou o endpoint que grava, apaga ou dispara. É por isso que a coluna
  “Volta atrás?” pode ser levada a sério.</p>
  <p>Os prints foram tirados do sistema em produção com uma sessão real de cada perfil, no tenant de
  demonstração (ACME Demo) sempre que ele tinha dado. Onde a demo estava vazia, o print vem de um tenant real
  e isso está avisado na própria ficha.</p>
  <p>Depois de escrito, cada bloco passou por uma segunda leitura adversarial: um revisor que abre os mesmos
  arquivos com a tarefa de <b>derrubar</b> as afirmações — conferir se o botão existe na linha citada, se o
  efeito descrito é o que a action faz e se o que apaga está marcado como irreversível.
  ${verificados === totalBlocos
    ? `Os ${totalBlocos} blocos passaram por essa revisão.`
    : `<b>${verificados} dos ${totalBlocos} blocos</b> passaram por essa revisão; os demais trazem a primeira leitura, sem segunda conferência.`}</p>

  <div class="legenda">
    <div><b>Volta atrás?</b><p><b>Reversível</b>: dá para desfazer pela própria interface. <b>Irreversível</b>: apaga, sobrescreve ou dispara algo para fora. <b>Parcial</b>: dá para corrigir, mas não desfazer.</p></div>
    <div><b>Caixa laranja na tabela</b><p>Cuidado específico daquele controle: gasta IA, envia mensagem de verdade, não pede confirmação, custa dinheiro.</p></div>
    <div><b>Pontos de atenção</b><p>Divergências encontradas ao ler o código — número que não bate, botão sem ação, rótulo que promete outra coisa. Não são opinião: cada um cita <code>arquivo:linha</code>.</p></div>
    <div><b>Aviso no topo da ficha</b><p>A rota redireciona para outro lugar, o print saiu carregando, ou o print veio de tenant real em vez da demo.</p></div>
  </div>
</section>

<section class="sumario">
  <h2>Sumário</h2>
  <ol>${sumario}</ol>
</section>

<div class="busca">
  <input type="search" id="q" placeholder="Filtrar telas por nome, rota ou botão…" autocomplete="off">
  <span class="conta" id="conta"></span>
</div>

${corpo}

</div>

<footer>
  <p><b>Manual de Telas · Vertho</b> — gerado em ${hoje} a partir do código em <code>nextjs-app/</code>
  e de capturas do ambiente de produção.</p>
  <p>Para atualizar: <code>node scripts/_capturar-telas-manual.mjs todos</code> refaz os prints e
  <code>node scripts/_montar-manual-telas.mjs</code> remonta este arquivo.</p>
</footer>

<script>
const q = document.getElementById('q');
const conta = document.getElementById('conta');
const telas = [...document.querySelectorAll('.tela')];
const blocos = [...document.querySelectorAll('.bloco')];
function filtrar(){
  const t = q.value.trim().toLowerCase();
  let v = 0;
  telas.forEach(el => {
    const bate = !t || el.dataset.busca.includes(t);
    el.classList.toggle('escondido', !bate);
    if (bate) v++;
  });
  blocos.forEach(b => {
    b.classList.toggle('escondido', ![...b.querySelectorAll('.tela')].some(e => !e.classList.contains('escondido')));
  });
  conta.textContent = t ? v + ' de ' + telas.length + ' telas' : '';
}
q.addEventListener('input', filtrar);
</script>
</body>
</html>`;

writeFileSync(path.join(BASE, 'manual.html'), html, 'utf8');
console.log(`manual.html gerado · ${totalTelas} telas · ${totalControles} controles`);
const semPrint = [];
for (const parte of PARTES) {
  for (const [k] of parte.blocos) {
    if (!blocos[k]) { console.log(`  ⚠ bloco AUSENTE: ${k}`); continue; }
    for (const t of blocos[k].telas) if (!porRota.get(chaveRota(t.rota))) semPrint.push(t.rota);
  }
}
if (semPrint.length) console.log(`  ⚠ ${semPrint.length} tela(s) sem print: ${semPrint.join(', ')}`);
