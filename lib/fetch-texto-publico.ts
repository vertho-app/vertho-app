/**
 * GET de texto em host público, com timeout, teto de bytes e redirects
 * validados hop a hop.
 *
 * Nasceu privado em `lib/site-palette.ts` (paleta do site do cliente) e foi
 * extraído quando o Copiloto passou a ler o site para descobrir as redes
 * oficiais: os dois casos precisam da MESMA guarda anti-SSRF em todo hop.
 *
 * A guarda em si mora em `lib/net-guard.ts` — aqui só orquestramos o loop de
 * redirect revalidando a URL de cada hop (o `redirect: 'manual'` impede o
 * undici de seguir sozinho para um destino que a sintaxe já rejeitaria).
 */

import { fetchPublico, validarUrlPublica } from '@/lib/net-guard';

export interface OpcoesFetchTexto {
  maxBytes: number;
  accept: string;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
}

const UA_PADRAO = 'Mozilla/5.0 (compatible; VerthoBot/1.0; +https://vertho.ai)';

export async function fetchTextoPublico(
  rawUrl: string,
  { maxBytes, accept, timeoutMs = 10_000, maxRedirects = 3, userAgent = UA_PADRAO }: OpcoesFetchTexto,
): Promise<{ texto: string; urlFinal: string } | null> {
  let atual = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const v = validarUrlPublica(atual);
    if (!v.ok) return null;
    let res: Response;
    try {
      // fetchPublico: o lookup do Agent valida o IP NO CONNECT (anti-TOCTOU/
      // rebinding) — o DNS-check prévio sozinho deixava janela entre check e fetch.
      res = await fetchPublico(v.url.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': userAgent, Accept: accept, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' },
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
