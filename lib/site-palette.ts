/**
 * Paleta do site do cliente → cores da tela de login (aba Branding).
 *
 * Pipeline: fetch do site (com guarda anti-SSRF) → extração de cores
 * candidatas (meta theme-color, manifest, CSS inline/linkado, style="")
 * → ranking determinístico → IA mapeia pros 7 slots do login → CONTRASTE
 * GARANTIDO EM CÓDIGO (a IA sugere; a legibilidade é imposta aqui — mesmo
 * padrão do "nota derivada em código" do auditor de Módulos-Base).
 *
 * Núcleo headless (fora de 'use server') — a action em
 * app/admin/.../configuracoes/actions.ts aplica o gate e delega.
 */

import { callAI } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';
import { ehIpPrivado as _ehIpPrivado, validarUrlPublica } from '@/lib/net-guard';
import { fetchTextoPublico } from '@/lib/fetch-texto-publico';

export interface PaletaLogin {
  font_color: string;
  font_color_secondary: string;
  primary_color: string;
  primary_color_end: string;
  accent_color: string;
  bg_gradient_start: string;
  bg_gradient_end: string;
}

export interface CandidatoCor {
  hex: string;
  count: number;
  neutra: boolean;
  luminancia: number;
}

const MAX_HTML_BYTES = 2_000_000;
const MAX_CSS_BYTES = 600_000;
const MAX_CSS_FILES = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (compatible; VerthoBrandBot/1.0; +https://vertho.ai)';

// ── URL + anti-SSRF ─────────────────────────────────────────────────────────
// A guarda mora em lib/net-guard.ts (compartilhada: gemini-video, extracao-video).
// Aqui ficam só os aliases pra não quebrar os imports/testes existentes.

/** Faixas privadas/reservadas — request pra cá é SSRF, nunca site de cliente. */
export const ehIpPrivado = _ehIpPrivado;

/** Sintaxe + esquema + hosts obviamente internos. NÃO faz DNS (síncrona, testável). */
export function validarUrlSite(raw: string): { ok: true; url: URL } | { ok: false; erro: string } {
  return validarUrlPublica(raw);
}

/** GET com timeout, teto de bytes e redirects validados hop a hop (lib/fetch-texto-publico). */
function fetchTexto(rawUrl: string, maxBytes: number, accept: string): Promise<{ texto: string; urlFinal: string } | null> {
  return fetchTextoPublico(rawUrl, {
    maxBytes, accept, timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS, userAgent: UA,
  });
}

// ── Extração pura (testável) ────────────────────────────────────────────────

export interface SinaisHtml {
  themeColor: string | null;
  cssLinks: string[];
  inlineCss: string;
  manifestHref: string | null;
  titulo: string | null;
}

/** Sinais de cor/branding no HTML cru (sem executar JS). */
export function extrairSinaisDoHtml(html: string, baseUrl: string): SinaisHtml {
  const abs = (href: string): string | null => {
    try { return new URL(href, baseUrl).toString(); } catch { return null; }
  };
  const themeColor = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i)?.[1] || null;

  const cssLinks: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["'][^"']*stylesheet[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const u = abs(href);
    if (u) cssLinks.push(u);
  }

  const blocosStyle = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const stylesAttr = [...html.matchAll(/style=["']([^"']{4,400})["']/gi)].map((m) => m[1]);

  const manifestHref = (() => {
    const tag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
      .find((t) => /rel=["']manifest["']/i.test(t));
    const href = tag?.match(/href=["']([^"']+)["']/i)?.[1];
    return href ? abs(href) : null;
  })();

  const titulo = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() || null;

  return { themeColor, cssLinks: cssLinks.slice(0, MAX_CSS_FILES), inlineCss: [...blocosStyle, ...stylesAttr].join('\n'), manifestHref, titulo };
}

/** Normaliza #abc/#aabbcc/#aabbccdd → #AABBCC (alpha descartada). Null = inválida. */
export function normalizarHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) return ('#' + s.split('').map((c) => c + c).join('')).toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(s) || /^[0-9a-f]{8}$/i.test(s)) return ('#' + s.slice(0, 6)).toUpperCase();
  return null;
}

/**
 * Tira do CSS o que é cor do FRAMEWORK, não da marca: presets do core do
 * WordPress (vivid-red, cyan-bluish-gray…, que vêm em TODO site WP e entravam
 * no ranking como se fossem marca), classes `.has-*`/`.wp-block-*` e variáveis
 * do admin/editor. Os presets do construtor (`awb-color-N`, Avada) ficam: são
 * a paleta que o dono do site escolheu.
 */
export function limparRuidoCss(css: string): string {
  return css
    .replace(/--wp--preset--(?:color--(?!awb)|gradient--|duotone--)[\w-]*\s*:[^;}]*;?/gi, '')
    .replace(/--wp-(?:admin|block|editor)[\w-]*\s*:[^;}]*;?/gi, '')
    .replace(/--dominant-color\s*:[^;}]*;?/gi, '')
    .replace(/\.(?:has-|wp-block-|wp-element-|wp-duotone)[^{}]*\{[^}]*\}/gi, '');
}

/**
 * Cores declaradas em variáveis CSS com nome de MARCA (primary, brand, accent,
 * awb-color-N, title/button-color): é onde o construtor do site guarda a
 * paleta de verdade, e pesa mais que a contagem bruta de ocorrências.
 */
export function extrairCoresDeMarca(css: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of css.matchAll(/--([\w-]*(?:primary|brand|accent|awb-color-?\d|title-color|button)[\w-]*)\s*:\s*([^;}]+)/gi)) {
    for (const [hex] of extrairCoresDeCss(m[2])) out.set(hex, (out.get(hex) || 0) + 1);
  }
  return out;
}

/** Todas as cores literais de um texto CSS-like, contadas (hex + rgb/rgba). */
export function extrairCoresDeCss(css: string): Map<string, number> {
  const contagem = new Map<string, number>();
  const add = (hex: string | null) => {
    if (!hex) return;
    contagem.set(hex, (contagem.get(hex) || 0) + 1);
  };
  for (const m of css.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(normalizarHex(m[1]));
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/gi)) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (r > 255 || g > 255 || b > 255 || a < 0.4) continue; // quase-transparente não é cor de marca
    add('#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase());
  }
  return contagem;
}

function rgbDe(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Luminância relativa WCAG (0=preto, 1=branco). */
export function luminancia(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgbDe(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão de contraste WCAG (1..21). */
export function contrasteWCAG(hexA: string, hexB: string): number {
  const [la, lb] = [luminancia(hexA), luminancia(hexB)];
  const [maior, menor] = la >= lb ? [la, lb] : [lb, la];
  return (maior + 0.05) / (menor + 0.05);
}

/** Neutra = saturação baixa (cinzas/pretos/brancos) — enche o CSS mas não é marca. */
export function ehNeutra(hex: string): boolean {
  const [r, g, b] = rgbDe(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === 0) return true;
  const sat = (max - min) / max;
  return sat < 0.12;
}

/** Ranking: mais frequentes primeiro, neutras sinalizadas, teto de 40. */
export function ranquearCores(contagem: Map<string, number>): CandidatoCor[] {
  return [...contagem.entries()]
    .map(([hex, count]) => ({ hex, count, neutra: ehNeutra(hex), luminancia: luminancia(hex) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

const HEX_CAMPO = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

/** Valida o shape devolvido pela IA — 7 campos, todos hex. */
export function validarPaletaIA(raw: any): PaletaLogin | null {
  if (!raw || typeof raw !== 'object') return null;
  const campos: (keyof PaletaLogin)[] = [
    'font_color', 'font_color_secondary', 'primary_color', 'primary_color_end',
    'accent_color', 'bg_gradient_start', 'bg_gradient_end',
  ];
  const out: any = {};
  for (const c of campos) {
    const v = String(raw[c] || '').trim();
    if (!HEX_CAMPO.test(v)) return null;
    out[c] = v.toUpperCase();
  }
  return out as PaletaLogin;
}

function distanciaRgb(a: string, b: string): number {
  const [ra, rb] = [rgbDe(a), rgbDe(b)];
  return Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
}

function matiz(hex: string): number {
  const [r, g, b] = rgbDe(hex).map((n) => n / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * A IA propõe, o código ancora: cor de MARCA (primary/accent) tem que ser uma
 * das que o site realmente usa. Medido em amazonbowling.com.br: o site tinha
 * #C97E19 e #FF6600 e a IA devolveu #F26100 — cor que não existe lá. Se a
 * proposta está a mais de 40 (distância RGB) de qualquer candidata de marca,
 * troca pela candidata mais próxima. O fim do gradiente do botão herda o
 * matiz da primária (±20°) ou vira a primária escurecida.
 */
export function ancorarNasCandidatas(paleta: PaletaLogin, candidatos: CandidatoCor[]): { paleta: PaletaLogin; ajustes: string[] } {
  const marca = candidatos.filter((c) => !c.neutra);
  const out = { ...paleta };
  const ajustes: string[] = [];
  if (!marca.length) return { paleta: out, ajustes };

  for (const campo of ['primary_color', 'accent_color'] as const) {
    const atual = out[campo].slice(0, 7);
    const maisProxima = marca.reduce((a, b) => (distanciaRgb(atual, a.hex) <= distanciaRgb(atual, b.hex) ? a : b));
    if (distanciaRgb(atual, maisProxima.hex) > 40) {
      ajustes.push(`${campo} ${atual} não existe no site → ${maisProxima.hex}`);
      out[campo] = maisProxima.hex;
    }
  }

  const dif = Math.abs(matiz(out.primary_color) - matiz(out.primary_color_end.slice(0, 7)));
  if (Math.min(dif, 360 - dif) > 20) {
    const p = out.primary_color;
    out.primary_color_end = '#' + rgbDe(p).map((n) => Math.round(n * 0.85).toString(16).padStart(2, '0').toUpperCase()).join('');
    ajustes.push('fim do gradiente do botão refeito (matiz diferente da primária)');
  }
  return { paleta: out, ajustes };
}

/**
 * Legibilidade imposta EM CÓDIGO (a IA propõe, o guard decide):
 *  - fonte × fundo (topo E base) ≥ 4.5 → senão vira branco ou grafite, o que
 *    contrastar mais com os DOIS fundos; secundária = mesma cor com alpha 99.
 *  - texto do botão usa font_color → as DUAS pontas do gradiente precisam
 *    ≥ 3.0 contra essa fonte; senão clareia/escurece no mesmo matiz.
 */
export function garantirContraste(paleta: PaletaLogin): { paleta: PaletaLogin; ajustes: string[] } {
  const out = { ...paleta };
  const ajustes: string[] = [];
  const solid = (h: string) => h.slice(0, 7);

  const contraFundos = (hex: string) =>
    Math.min(contrasteWCAG(hex, solid(out.bg_gradient_start)), contrasteWCAG(hex, solid(out.bg_gradient_end)));

  const MIN = 4.5; // texto corrido
  const MIN_BOTAO = 3.0; // texto grande/negrito do botão (WCAG 1.4.3, texto grande)
  const misturar = (hex: string, alvo: number, proporcao: number) =>
    '#' + rgbDe(hex).map((n) => Math.round(n + (alvo - n) * proporcao).toString(16).padStart(2, '0').toUpperCase()).join('');
  /** Cor do texto sobre o fundo com opacidade `a` (o que o olho realmente vê). */
  const sobreFundo = (hex: string, a: number, fundo: string) => '#' + rgbDe(hex).map((n, i) => Math.round(n * a + rgbDe(fundo)[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
  const contraFundosA = (hex: string, a: number) =>
    Math.min(...[out.bg_gradient_start, out.bg_gradient_end].map((f) => contrasteWCAG(sobreFundo(hex, a, solid(f)), solid(f))));
  const botaoOk = (fonte: string) =>
    ['primary_color', 'primary_color_end'].every((c) => contrasteWCAG(solid((out as any)[c]), fonte) >= MIN_BOTAO);

  // 1) fonte × fundos (topo E base) ≥ 4.5. Se falhar, tenta branco/grafite e prefere o que
  //    também serve ao texto do botão (preserva a cor da marca no botão).
  if (contraFundos(solid(out.font_color)) < MIN) {
    const opcoes = ['#FFFFFF', '#111827'].filter((f) => contraFundos(f) >= MIN);
    const escolhida = opcoes.find(botaoOk) || opcoes[0]
      || (contraFundos('#FFFFFF') >= contraFundos('#111827') ? '#FFFFFF' : '#111827');
    out.font_color = escolhida;
    ajustes.push(`fonte ajustada pra ${out.font_color} (contraste com o fundo era < ${MIN})`);
  } else if (!botaoOk(solid(out.font_color))) {
    // fonte legível no fundo, mas ruim no botão: troca só se a alternativa também lê no fundo
    const alt = ['#FFFFFF', '#111827'].find((f) => contraFundos(f) >= MIN && botaoOk(f));
    if (alt) { out.font_color = alt; ajustes.push(`fonte ajustada pra ${alt} (lê no fundo ≥ ${MIN} e no botão ≥ ${MIN_BOTAO})`); }
  }

  // 2) secundária (placeholders/legendas): mesma cor com a MENOR opacidade que ainda dá ≥ 4.5 EFETIVO
  const fonteSolida = solid(out.font_color);
  const secAtual = out.font_color_secondary;
  const alfaAtual = secAtual.length === 9 ? parseInt(secAtual.slice(7), 16) / 255 : 1;
  const secLe = solid(secAtual).toUpperCase() === fonteSolida.toUpperCase() && contraFundosA(fonteSolida, alfaAtual) >= MIN;
  if (!secLe) {
    const alfa = ['99', 'B3', 'CC', 'E6'].find((h) => contraFundosA(fonteSolida, parseInt(h, 16) / 255) >= MIN);
    out.font_color_secondary = fonteSolida + (alfa || '');
    ajustes.push(`fonte secundária refeita (${alfa ? 'opacidade ' + alfa : 'sólida'}): a original não lia ≥ ${MIN} sobre o fundo`);
  }

  // 3) texto do botão: as DUAS pontas do gradiente ≥ 3.0 contra a fonte; senão clareia/escurece o MESMO matiz
  const fonteBotao = solid(out.font_color);
  let botaoAjustado = false;
  for (const campo of ['primary_color', 'primary_color_end'] as const) {
    const original = solid(out[campo]);
    if (contrasteWCAG(original, fonteBotao) >= MIN_BOTAO) continue;
    for (let passo = 1; passo <= 20; passo++) {
      const candidatos = [misturar(original, 0, passo / 20), misturar(original, 255, passo / 20)]
        .sort((a, b) => contrasteWCAG(b, fonteBotao) - contrasteWCAG(a, fonteBotao));
      if (contrasteWCAG(candidatos[0], fonteBotao) >= MIN_BOTAO) { out[campo] = candidatos[0]; botaoAjustado = true; break; }
    }
  }
  if (botaoAjustado) ajustes.push(`botão ajustado (fonte ${out.font_color} precisa de contraste ≥ ${MIN_BOTAO})`);

  // 4) accent (links/detalhes são TEXTO): ≥ 4.5 contra os dois fundos, mesmo matiz
  const original = solid(out.accent_color);
  if (contraFundos(original) < MIN) {
    for (let passo = 1; passo <= 20; passo++) {
      const c = [misturar(original, 0, passo / 20), misturar(original, 255, passo / 20)]
        .sort((a, b) => contraFundos(b) - contraFundos(a))[0];
      if (contraFundos(c) >= MIN) { out.accent_color = c; ajustes.push(`accent ajustado pra ${c} (contraste com o fundo era < ${MIN})`); break; }
    }
  }
  return { paleta: out, ajustes };
}

// ── IA: candidatos → 7 slots ────────────────────────────────────────────────

const SYSTEM_PALETA = `Você é um designer de marca da Vertho. Recebe as cores encontradas no site de um cliente e monta a paleta da TELA DE LOGIN do tenant dele na plataforma.

Anatomia da tela: fundo em gradiente vertical (bg_gradient_start no topo → bg_gradient_end na base), título/textos/campos (font_color; font_color_secondary é a mesma com transparência, usada também nos placeholders), botão principal em gradiente (primary_color → primary_color_end) com texto em font_color, e detalhes/links (accent_color).

REGRAS:
1. Use as cores DE MARCA do site (as saturadas/reconhecíveis) — cinzas, pretos e brancos puros são estrutura, não marca.
2. O fundo segue a identidade do site, sem estética própria: se a linha "FUNDO DO SITE" diz CLARO, use fundo claro (branco/off-white, podendo terminar numa cor de marca suave) com font_color ESCURA (um azul-marinho/grafite da própria marca, se houver); se diz ESCURO, use um tom escuro da marca, ou derive um bem escuro da primária (sem inventar matiz alheio).
3. primary_color = a cor mais forte da marca; primary_color_end = versão levemente mais escura do MESMO matiz. As duas precisam contrastar com a cor do texto do botão (font_color).
4. accent_color = segunda cor de marca do site (a de maior frequência depois da primária, com matiz diferente); sem segunda cor, use uma variação da primária.
5. font_color deve ler bem sobre os dois fundos; font_color_secondary = font_color + "99".
6. primary_color e accent_color DEVEM ser hex copiados da lista de CORES ENCONTRADAS, sem alterar um dígito. Só os fundos, primary_color_end e a fonte podem ser derivados. Fidelidade à marca vence estética própria: não "melhore" nem "aproxime" a cor do cliente.
7. As cores vêm de CSS de site inteiro: ignore as que são claramente de componente genérico (vermelho de erro, azul de link padrão, cores de redes sociais) quando houver outras de marca com frequência parecida.

Responda APENAS JSON válido:
{"font_color":"#RRGGBB","font_color_secondary":"#RRGGBB99","primary_color":"#RRGGBB","primary_color_end":"#RRGGBB","accent_color":"#RRGGBB","bg_gradient_start":"#RRGGBB","bg_gradient_end":"#RRGGBB","racional":"1 frase"}`;

async function mapearComIA(args: {
  site: string; titulo: string | null; themeColor: string | null;
  manifestTheme: string | null; candidatos: CandidatoCor[]; aiConfig?: any;
}): Promise<{ paleta: PaletaLogin; racional: string | null }> {
  const linhas = args.candidatos.map((c) =>
    `${c.hex} ×${c.count}${c.neutra ? ' (neutra)' : ''} lum=${c.luminancia.toFixed(2)}`).join('\n');
  const peso = (claras: boolean) => args.candidatos
    .filter((c) => c.neutra && (c.luminancia > 0.5) === claras).reduce((s, c) => s + c.count, 0);
  const fundoClaro = peso(true) >= peso(false);
  const user = `SITE: ${args.site}${args.titulo ? `\nTÍTULO: ${args.titulo}` : ''}
FUNDO DO SITE: ${fundoClaro ? 'CLARO' : 'ESCURO'} (neutras claras ${peso(true)} × escuras ${peso(false)})
${args.themeColor ? `META theme-color: ${args.themeColor}` : ''}${args.manifestTheme ? `\nMANIFEST theme_color: ${args.manifestTheme}` : ''}

CORES ENCONTRADAS (hex ×frequência):
${linhas}`;

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const raw = await callAI(SYSTEM_PALETA, user, args.aiConfig || {}, 500);
    let parsed: any = null;
    try { parsed = parseJsonIA(raw); } catch { parsed = null; }
    const paleta = validarPaletaIA(parsed);
    if (paleta) return { paleta, racional: typeof parsed?.racional === 'string' ? parsed.racional.slice(0, 300) : null };
  }
  throw new Error('A IA não devolveu uma paleta válida (2 tentativas)');
}

// ── Orquestração ────────────────────────────────────────────────────────────

export interface ResultadoPaleta {
  paleta: PaletaLogin;
  racional: string | null;
  ajustes: string[];
  candidatos: CandidatoCor[];
  fontes: { html: boolean; cssArquivos: number; themeColor: string | null; manifest: boolean };
}

export async function extrairPaletaDoSiteCore(rawUrl: string, aiConfig?: any): Promise<ResultadoPaleta> {
  const v = validarUrlSite(rawUrl);
  if (!('url' in v)) throw new Error(v.erro);

  const pagina = await fetchTexto(v.url.toString(), MAX_HTML_BYTES, 'text/html,application/xhtml+xml');
  if (!pagina) throw new Error('Não consegui carregar o site (timeout, bloqueio ou página muito grande)');

  const sinais = extrairSinaisDoHtml(pagina.texto, pagina.urlFinal);

  // CSS linkado (cada URL passa pela MESMA validação anti-SSRF do fetch)
  let cssTotal = sinais.inlineCss;
  let cssArquivos = 0;
  for (const link of sinais.cssLinks) {
    if (/\/wp-content\/plugins\//i.test(link)) continue; // CSS de plugin (slider, compartilhar) não é a marca
    const css = await fetchTexto(link, MAX_CSS_BYTES, 'text/css,*/*;q=0.1');
    if (css) { cssTotal += '\n' + css.texto; cssArquivos++; }
  }

  // Manifest (theme_color / background_color)
  let manifestTheme: string | null = null;
  if (sinais.manifestHref) {
    const man = await fetchTexto(sinais.manifestHref, 50_000, 'application/json,*/*;q=0.1');
    if (man) {
      try {
        const j = JSON.parse(man.texto);
        manifestTheme = [j.theme_color, j.background_color].filter(Boolean).join(' / ') || null;
      } catch { /* manifest inválido — segue */ }
    }
  }

  cssTotal = limparRuidoCss(cssTotal);
  const contagem = extrairCoresDeCss(cssTotal);
  // paleta declarada pelo construtor do site: peso ×5 por declaração
  for (const [hex, n] of extrairCoresDeMarca(cssTotal)) contagem.set(hex, (contagem.get(hex) || 0) + n * 5);
  if (sinais.themeColor) {
    const t = normalizarHex(sinais.themeColor);
    if (t) contagem.set(t, (contagem.get(t) || 0) + 50); // sinal forte e intencional
  }
  const candidatos = ranquearCores(contagem);
  if (candidatos.filter((c) => !c.neutra).length < 2) {
    throw new Error('O site não expôs cores de marca no HTML/CSS (página muito dinâmica?) — informe as cores manualmente');
  }

  const { paleta: bruta, racional } = await mapearComIA({
    site: pagina.urlFinal, titulo: sinais.titulo, themeColor: sinais.themeColor,
    manifestTheme, candidatos, aiConfig,
  });
  const ancorada = ancorarNasCandidatas(bruta, candidatos);
  const { paleta, ajustes: ajustesContraste } = garantirContraste(ancorada.paleta);
  const ajustes = [...ancorada.ajustes, ...ajustesContraste];

  return {
    paleta, racional, ajustes, candidatos,
    fontes: { html: true, cssArquivos, themeColor: sinais.themeColor, manifest: !!manifestTheme },
  };
}
