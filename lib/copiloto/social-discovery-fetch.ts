/**
 * Leitura do site do cliente para descobrir as redes oficiais (camada de I/O).
 *
 * O núcleo de extração é puro e vive em `lib/copiloto/social-discovery.ts` —
 * aqui só entra o que fala com a rede, para que a tela possa importar o puro
 * sem arrastar `node:dns` para o bundle.
 *
 * Todo fetch passa por `fetchTextoPublico`, que aplica a guarda anti-SSRF em
 * CADA hop (inclusive redirect).
 */

import { validarUrlPublica } from '@/lib/net-guard';
import { fetchTextoPublico } from '@/lib/fetch-texto-publico';
import { parseOfficialSocialUrls } from '@/lib/copiloto/social-identity';
import { extrairPerfisSociais, paginasCandidatas, MAX_PERFIS } from '@/lib/copiloto/social-discovery';

const MAX_HTML_BYTES = 1_500_000;
const MAX_PAGINAS = 3;
const FETCH_TIMEOUT_MS = 8_000;
const UA = 'Mozilla/5.0 (compatible; VerthoCopilotBot/1.0; +https://vertho.ai)';

export interface DescobertaRedes {
  perfis: string[];
  paginasLidas: string[];
  /** URL efetivamente lida (pode diferir do que o usuário digitou por redirect). */
  siteLido: string | null;
  motivo: 'ok' | 'url_invalida' | 'sem_resposta' | 'nada_encontrado';
}

function baixarPagina(url: string) {
  return fetchTextoPublico(url, {
    maxBytes: MAX_HTML_BYTES,
    accept: 'text/html,application/xhtml+xml',
    timeoutMs: FETCH_TIMEOUT_MS,
    userAgent: UA,
  });
}

/**
 * Lê o site e devolve os perfis oficiais que ele mesmo publica.
 *
 * Sem IA e sem busca externa: é leitura de HTML.
 */
export async function descobrirRedesDoSite(rawSite: string): Promise<DescobertaRedes> {
  const vazio = (motivo: DescobertaRedes['motivo']): DescobertaRedes =>
    ({ perfis: [], paginasLidas: [], siteLido: null, motivo });

  const site = (rawSite || '').trim();
  if (!site) return vazio('url_invalida');
  const validada = validarUrlPublica(site);
  if (!validada.ok) return vazio('url_invalida');

  const home = await baixarPagina(validada.url.toString());
  if (!home) return vazio('sem_resposta');

  const paginasLidas = [home.urlFinal];
  const perfis = new Set(extrairPerfisSociais(home.texto));

  // Rodapé pobre (site de uma página só, ou redes escondidas no "Contato"):
  // vale UMA rodada extra, nunca uma varredura do site inteiro.
  if (perfis.size < 2) {
    for (const pagina of paginasCandidatas(home.texto, home.urlFinal)) {
      if (paginasLidas.length >= MAX_PAGINAS) break;
      const extra = await baixarPagina(pagina);
      if (!extra) continue;
      paginasLidas.push(extra.urlFinal);
      for (const perfil of extrairPerfisSociais(extra.texto)) perfis.add(perfil);
      if (perfis.size >= 2) break;
    }
  }

  const lista = parseOfficialSocialUrls([...perfis]).slice(0, MAX_PERFIS);
  return {
    perfis: lista,
    paginasLidas,
    siteLido: home.urlFinal,
    motivo: lista.length ? 'ok' : 'nada_encontrado',
  };
}
