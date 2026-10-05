/**
 * Guarda anti-SSRF compartilhada (auditoria 23/07, grupo D).
 *
 * Três camadas, do mais barato ao mais forte:
 *
 *  1. `validarUrlPublica` — SINTAXE: esquema http(s), sem host interno óbvio
 *     (localhost/.local/.internal), sem IP literal privado, sem host começando
 *     com '-' (defesa contra injeção de flag quando a URL vira argumento de
 *     subprocesso, ex.: yt-dlp). Síncrona, sem DNS.
 *  2. `assertDestinoPublico` — DNS PRÉ-CHECK: resolve e rejeita se QUALQUER
 *     registro for privado. Usar na BORDA (submit), pra falhar cedo e barato.
 *  3. `dispatcherPublico` — ENFORCEMENT NO CONNECT (anti-TOCTOU/rebinding):
 *     Agent undici cujo `connect` valida os IPs na hora da conexão. Hostname:
 *     o `lookup` resolve e devolve um endereço JÁ validado — o DNS-check prévio
 *     sozinho deixava janela pro atacante responder IP público no check e IP
 *     privado no connect (rebinding). IP literal: o `lookup` NÃO roda, então o
 *     connector rejeita IP privado literal direto. Como TODA conexão (inclusive
 *     cada hop de redirect automático) passa por aqui, a janela fecha — mesmo
 *     que o chamador não tenha validado a URL antes.
 *
 * Uso: `fetchPublico(url, init)` (fetch do undici com o dispatcher já aplicado).
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, buildConnector, fetch as undiciFetch } from 'undici';

/**
 * Expande um IPv6 textual em 8 hextets (0..65535); `null` se malformado.
 * Existe porque a checagem por PREFIXO DE TEXTO não vê a forma normalizada: o
 * `URL` do Node reescreve `[::ffff:127.0.0.1]` como `[::ffff:7f00:1]`, e o
 * regex que só reconhecia o mapeado com pontos deixava esse endereço passar como
 * público (análise de 05/10/2026, confirmado rodando o `URL`).
 */
function hextetsIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const q = v4[2].split('.').map(Number);
    if (q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${v4[1]}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const partes = s.split('::');
  if (partes.length > 2) return null;
  const cabeca = partes[0] ? partes[0].split(':') : [];
  const cauda = partes.length === 2 && partes[1] ? partes[1].split(':') : [];
  const faltam = 8 - cabeca.length - cauda.length;
  if (partes.length === 1 ? faltam !== 0 : faltam < 1) return null;
  const todos = [...cabeca, ...Array(partes.length === 2 ? faltam : 0).fill('0'), ...cauda];
  const h = todos.map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return h.length === 8 && !h.some(Number.isNaN) ? h : null;
}

/** Faixas privadas/reservadas — request pra cá é SSRF, nunca destino legítimo. */
export function ehIpPrivado(ip: string): boolean {
  if (ip.includes(':')) {
    const h = hextetsIPv6(ip);
    if (!h) return true; // malformado = rejeita, a mesma política do IPv4
    const [a, b, c, d, e, f, g, i] = h;
    const v4 = (x: number, y: number) => `${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`;
    const zeros = (n: number) => h.slice(0, n).every((x) => x === 0);
    if (zeros(6)) return ehIpPrivado(v4(g, i));                              // ::, ::1 e ::a.b.c.d (compatível)
    if (zeros(5) && f === 0xffff) return ehIpPrivado(v4(g, i));             // ::ffff:0:0/96 mapeado
    if (zeros(4) && e === 0xffff && f === 0) return ehIpPrivado(v4(g, i));  // ::ffff:0:0:0/96 traduzido
    if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return ehIpPrivado(v4(g, i)); // NAT64
    if (a === 0x64 && b === 0xff9b && c === 1) return true;                  // 64:ff9b:1::/48 uso local
    if (a === 0x2002) return ehIpPrivado(v4(b, c));                          // 6to4 embute o IPv4 nos bits 16..47
    if (a === 0x2001 && b === 0) return true;                                // Teredo
    if (a === 0x2001 && b === 0xdb8) return true;                            // documentação
    if (a === 0x100 && b === 0 && c === 0 && d === 0) return true;           // 100::/64 descarte
    if ((a & 0xfe00) === 0xfc00) return true;                                // fc00::/7 ULA
    if ((a & 0xffc0) === 0xfe80) return true;                                // fe80::/10 link-local
    if ((a & 0xffc0) === 0xfec0) return true;                                // fec0::/10 site-local (obsoleto)
    if ((a & 0xff00) === 0xff00) return true;                                // ff00::/8 multicast
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformado = rejeita
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;      // link-local / metadata (169.254.169.254)
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  if (p[0] >= 224) return true;                                              // multicast, reservado e broadcast
  if (p[0] === 192 && p[1] === 0 && (p[2] === 0 || p[2] === 2)) return true; // 192.0.0.0/24 e TEST-NET-1
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;             // 198.18.0.0/15 benchmarking
  if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;              // TEST-NET-2
  if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;               // TEST-NET-3
  return false;
}

/** Sintaxe + esquema + hosts obviamente internos. NÃO faz DNS (síncrona, testável). */
export function validarUrlPublica(raw: string): { ok: true; url: URL } | { ok: false; erro: string } {
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
  // Host começando com '-' vira FLAG quando a URL é passada como argumento de
  // subprocesso (yt-dlp --exec=...). Nunca é hostname legítimo.
  if (host.startsWith('-')) return { ok: false, erro: 'Host inválido' };
  if (isIP(host.replace(/^\[|\]$/g, '')) && ehIpPrivado(host.replace(/^\[|\]$/g, ''))) {
    return { ok: false, erro: 'IP privado não permitido' };
  }
  return { ok: true, url };
}

/** Resolve o DNS e rejeita destino privado (pré-check de borda, async). */
export async function assertDestinoPublico(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (ehIpPrivado(host)) throw new Error('Destino privado bloqueado');
    return;
  }
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new Error(`DNS não resolveu ${host}`);
  if (addrs.some((a) => ehIpPrivado(a.address))) throw new Error('Destino privado bloqueado');
}

/**
 * Lookup customizado do Agent: valida os registros no CONNECT e devolve um
 * endereço já validado — sem janela de rebinding entre check e conexão.
 */
// Exportado p/ teste do contrato do callback (Happy Eyeballs) — não usar fora do Agent.
export function lookupPublico(hostname: string, opts: any, cb: (err: any, address?: any, family?: number) => void): void {
  lookup(hostname, { all: true, verbatim: true }).then((addrs) => {
    if (!addrs.length) return cb(new Error(`DNS não resolveu ${hostname}`));
    if (addrs.some((a) => ehIpPrivado(a.address))) return cb(new Error('Destino privado bloqueado'));
    // Happy Eyeballs (`autoSelectFamily`, default no Node ≥20): o net chama o
    // lookup com `{ all: true }` e espera o callback no formato ARRAY
    // `[{address, family}]`. Devolver a forma single `(err, address, family)`
    // fazia o net ler a STRING do address como array → `addresses[0].address`
    // = undefined → ERR_INVALID_IP_ADDRESS (quebrava TODO fetchPublico).
    if (opts && opts.all) return cb(null, addrs as any);
    cb(null, addrs[0].address, addrs[0].family);
  }, (e) => cb(e));
}

/**
 * Connector do Agent. O `lookupPublico` NÃO roda pra IP literal (o Node conecta
 * direto, sem resolver), então um redirect automático pra `http://10.0.0.1/` ou
 * `http://169.254.169.254/` escaparia da validação de lookup. Aqui rejeitamos IP
 * privado LITERAL antes de delegar — e como TODA conexão (a inicial E cada hop de
 * redirect) passa por este connector, a janela do literal também fecha, sem
 * depender do chamador ter validado a URL antes.
 */
const baseConnect = buildConnector({ lookup: lookupPublico });
function connectPublico(opts: { hostname: string; [k: string]: any }, cb: (err: Error | null, socket: any) => void): void {
  const host = String(opts.hostname || '').replace(/^\[|\]$/g, '');
  if (isIP(host) && ehIpPrivado(host)) return cb(new Error('Destino privado bloqueado'), null);
  baseConnect(opts as any, cb);
}

let agent: Agent | null = null;

/** Agent singleton com guarda anti-SSRF no connect (lookup p/ hostname + IP literal). */
export function dispatcherPublico(): Agent {
  if (!agent) agent = new Agent({ connect: connectPublico });
  return agent;
}

/**
 * Fetch com a guarda anti-SSRF já aplicada. Usa o fetch do PRÓPRIO undici
 * externo: o fetch global do Node (undici embutido) rejeita Agent de versão
 * externa ("invalid onRequestStart method").
 *
 * Duas camadas contra IP privado LITERAL (o undici NÃO chama o lookup do Agent
 * pra literal — conecta direto): (1) reject explícito da URL inicial aqui, falha
 * cedo e barato; (2) o guard no `connect` (connectPublico) é o backstop que pega
 * QUALQUER conexão — inclusive o hop de redirect automático, que não passa por aqui.
 */
export function fetchPublico(url: string, init?: Record<string, any>): Promise<Response> {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && ehIpPrivado(host)) return Promise.reject(new Error('Destino privado bloqueado'));
  } catch { /* URL malformada: o fetch abaixo reporta */ }
  return undiciFetch(url, { ...init, dispatcher: dispatcherPublico() } as any) as unknown as Promise<Response>;
}
