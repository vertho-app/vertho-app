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

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { callAI } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';

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

/** Faixas privadas/reservadas — request pra cá é SSRF, nunca site de cliente. */
export function ehIpPrivado(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    // ::1 loopback · fc00::/7 ULA · fe80::/10 link-local · ::ffff:x.x.x.x mapeado
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true;
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? ehIpPrivado(mapped[1]) : false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformado = rejeita
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;      // link-local / metadata (169.254.169.254)
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  return false;
}

/** Sintaxe + esquema + hosts obviamente internos. NÃO faz DNS (síncrona, testável). */
export function validarUrlSite(raw: string): { ok: true; url: URL } | { ok: false; erro: string } {
  const limpo = raw.trim();
  // Esquema explícito ≠ http(s) → rejeita ANTES de completar (senão "ftp://x"
  // viraria "https://ftp://x", que parseia com host lixo e passaria).
  const temEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(limpo);
  if (temEsquema && !/^https?:\/\//i.test(limpo)) return { ok: false, erro: 'Só http(s)' };
  let url: URL;
  try {
    url = new URL(temEsquema ? limpo : `https://${limpo}`);
  } catch {
    return { ok: false, erro: 'URL inválida' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, erro: 'Só http(s)' };
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, erro: 'Host interno não permitido' };
  }
  if (isIP(host.replace(/^\[|\]$/g, '')) && ehIpPrivado(host.replace(/^\[|\]$/g, ''))) {
    return { ok: false, erro: 'IP privado não permitido' };
  }
  return { ok: true, url };
}

/** Resolve o DNS e rejeita destino privado (async; roda a CADA hop de redirect). */
async function assertDestinoPublico(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (ehIpPrivado(host)) throw new Error('Destino privado bloqueado');
    return;
  }
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new Error(`DNS não resolveu ${host}`);
  if (addrs.some((a) => ehIpPrivado(a.address))) throw new Error('Destino privado bloqueado');
}

/** GET com timeout, teto de bytes e redirects validados hop a hop. */
async function fetchTexto(rawUrl: string, maxBytes: number, accept: string): Promise<{ texto: string; urlFinal: string } | null> {
  let atual = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const v = validarUrlSite(atual);
    if (!v.ok) return null;
    await assertDestinoPublico(v.url);
    let res: Response;
    try {
      res = await fetch(v.url.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' },
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      atual = new URL(loc, v.url).toString();
      continue;
    }
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > maxBytes) return null;
    const texto = await res.text();
    if (texto.length > maxBytes) return { texto: texto.slice(0, maxBytes), urlFinal: v.url.toString() };
    return { texto, urlFinal: v.url.toString() };
  }
  return null;
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

/**
 * Legibilidade imposta EM CÓDIGO (a IA propõe, o guard decide):
 *  - fonte × fundo (topo E base) ≥ 4.5 → senão vira branco ou grafite, o que
 *    contrastar mais com os DOIS fundos; secundária = mesma cor com alpha 99.
 *  - texto do botão é sempre branco no login → botão precisa ≥ 3.0 contra
 *    branco; senão escurece pro tom mais próximo que passa.
 */
export function garantirContraste(paleta: PaletaLogin): { paleta: PaletaLogin; ajustes: string[] } {
  const out = { ...paleta };
  const ajustes: string[] = [];
  const solid = (h: string) => h.slice(0, 7);

  const contraFundos = (hex: string) =>
    Math.min(contrasteWCAG(hex, solid(out.bg_gradient_start)), contrasteWCAG(hex, solid(out.bg_gradient_end)));

  if (contraFundos(solid(out.font_color)) < 4.5) {
    const branco = contraFundos('#FFFFFF');
    const grafite = contraFundos('#111827');
    out.font_color = branco >= grafite ? '#FFFFFF' : '#111827';
    out.font_color_secondary = out.font_color + '99';
    ajustes.push(`fonte ajustada pra ${out.font_color} (contraste com o fundo era < 4.5)`);
  }

  const escurecer = (hex: string, fator: number) => {
    const [r, g, b] = rgbDe(hex);
    return '#' + [r, g, b].map((n) => Math.round(n * fator).toString(16).padStart(2, '0').toUpperCase()).join('');
  };
  if (contrasteWCAG(solid(out.primary_color), '#FFFFFF') < 3.0) {
    let ajustado = solid(out.primary_color);
    for (let f = 0.85; f >= 0.35; f -= 0.1) {
      ajustado = escurecer(solid(out.primary_color), f);
      if (contrasteWCAG(ajustado, '#FFFFFF') >= 3.0) break;
    }
    out.primary_color = ajustado;
    if (contrasteWCAG(solid(out.primary_color_end), '#FFFFFF') < 3.0) out.primary_color_end = escurecer(ajustado, 0.85);
    ajustes.push('botão escurecido (texto branco precisa de contraste ≥ 3.0)');
  }
  return { paleta: out, ajustes };
}

// ── IA: candidatos → 7 slots ────────────────────────────────────────────────

const SYSTEM_PALETA = `Você é um designer de marca da Vertho. Recebe as cores encontradas no site de um cliente e monta a paleta da TELA DE LOGIN do tenant dele na plataforma.

Anatomia da tela: fundo em gradiente vertical (bg_gradient_start no topo → bg_gradient_end na base), título/textos (font_color; font_color_secondary é a mesma com transparência), botão principal em gradiente (primary_color → primary_color_end) com TEXTO BRANCO, e detalhes/links (accent_color).

REGRAS:
1. Use as cores DE MARCA do site (as saturadas/reconhecíveis) — cinzas, pretos e brancos puros são estrutura, não marca.
2. O fundo deve ser ESCURO e sóbrio: se a marca tem um tom escuro próprio, use-o; senão derive um tom bem escuro da cor primária (não invente matiz alheio à marca).
3. primary_color = a cor mais forte da marca; primary_color_end = versão levemente mais escura do MESMO matiz.
4. accent_color = cor secundária vibrante da marca; sem segunda cor, use uma variação clara da primária.
5. font_color deve ler bem sobre os dois fundos (quase sempre #FFFFFF); font_color_secondary = font_color + "99".
6. Fidelidade à marca vence estética própria: não "melhore" a cor do cliente.

Responda APENAS JSON válido:
{"font_color":"#RRGGBB","font_color_secondary":"#RRGGBB99","primary_color":"#RRGGBB","primary_color_end":"#RRGGBB","accent_color":"#RRGGBB","bg_gradient_start":"#RRGGBB","bg_gradient_end":"#RRGGBB","racional":"1 frase"}`;

async function mapearComIA(args: {
  site: string; titulo: string | null; themeColor: string | null;
  manifestTheme: string | null; candidatos: CandidatoCor[]; aiConfig?: any;
}): Promise<{ paleta: PaletaLogin; racional: string | null }> {
  const linhas = args.candidatos.map((c) =>
    `${c.hex} ×${c.count}${c.neutra ? ' (neutra)' : ''} lum=${c.luminancia.toFixed(2)}`).join('\n');
  const user = `SITE: ${args.site}${args.titulo ? `\nTÍTULO: ${args.titulo}` : ''}
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

  const contagem = extrairCoresDeCss(cssTotal);
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
  const { paleta, ajustes } = garantirContraste(bruta);

  return {
    paleta, racional, ajustes, candidatos,
    fontes: { html: true, cssArquivos, themeColor: sinais.themeColor, manifest: !!manifestTheme },
  };
}
