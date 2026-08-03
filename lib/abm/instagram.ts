import 'server-only';

import { extrairSinais, dedupPorTipo, sanitizarLegenda, type SinalInstagram } from './instagram-sinais';

export type { SinalInstagram, TipoSinal } from './instagram-sinais';

/**
 * ABM — camada 4b: sinais de momento a partir do Instagram da conta.
 *
 * Rota OFICIAL: endpoint `business_discovery` da Instagram Graph API, que
 * devolve dados públicos de contas Business/Creator de terceiros. Não é
 * scraping — mesma disciplina que o plano já aplica ao LinkedIn.
 *
 * Este arquivo tem só a chamada de rede; a extração de sinal (a parte com
 * regra de negócio e com risco de LGPD) vive em `instagram-sinais.ts`, que é
 * puro e testado — `server-only` não carrega sob vitest.
 *
 * ⚠️ ESTE MÓDULO NUNCA FOI EXERCITADO CONTRA A API REAL. Falta a habilitação
 * (Página do FB + conta IG Business + app review). A forma da resposta segue a
 * doc oficial; o primeiro uso real pode exigir ajuste de campo.
 *
 * Requisitos fora do código:
 *   - Página do Facebook + conta Instagram Business da Vertho;
 *   - Facebook Login (business_discovery NÃO funciona com o Instagram Login novo);
 *   - permissões instagram_basic, instagram_manage_insights, pages_read_engagement
 *     (+ ads_management OU ads_read se o papel na Página vier do Business Manager);
 *   - app review aprovado.
 *
 * Envs:
 *   - META_GRAPH_TOKEN              — token de página, longa duração
 *   - INSTAGRAM_BUSINESS_ACCOUNT_ID — id da conta IG Business DA VERTHO
 *     (business_discovery é aresta da NOSSA conta, consultando a de terceiro)
 *   - META_GRAPH_VERSION            — opcional, default 'v21.0'
 *
 * ⚠️ LGPD: `media_url` NUNCA é pedido. Só `caption`, e ela passa por
 * `sanitizarLegenda` antes de virar evidência. Ver `instagram-sinais.ts`.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export interface PerfilInstagram {
  handle: string;
  seguidores: number | null;
  totalPosts: number | null;
  /** Link da bio — realimenta a camada 3 (resolução de domínio). */
  website: string | null;
  biografia: string | null;
}

export interface ResultadoInstagram {
  perfil: PerfilInstagram;
  sinais: SinalInstagram[];
  postsAnalisados: number;
}

/**
 * Consulta o Instagram de uma conta-alvo e devolve perfil + sinais.
 *
 * Fail-loud: sem env configurada, LANÇA. É caminho de CONSTRUÇÃO de ficha (há
 * humano para consertar), não de entrega ao usuário final — a régua da casa
 * manda falhar alto aqui, não degradar em silêncio.
 */
export async function buscarSinaisInstagram(
  handle: string,
  opts: { maxPosts?: number } = {},
): Promise<ResultadoInstagram> {
  const token = process.env.META_GRAPH_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igUserId) {
    throw new Error(
      '[abm/instagram] META_GRAPH_TOKEN e INSTAGRAM_BUSINESS_ACCOUNT_ID são obrigatórios. ' +
      'business_discovery é aresta da NOSSA conta IG Business (Facebook Login + app review).',
    );
  }

  const limpo = handle.trim().replace(/^@/, '');
  // O handle entra na URL: valida em allowlist, não confia no chamador.
  if (!/^[\w.]{1,30}$/.test(limpo)) {
    throw new Error(`[abm/instagram] handle inválido: ${handle}`);
  }

  const maxPosts = Math.min(opts.maxPosts ?? 25, 50);
  const campos =
    `business_discovery.username(${limpo})` +
    `{username,followers_count,media_count,biography,website,` +
    `media.limit(${maxPosts}){caption,timestamp,permalink}}`;

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}` +
    `?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json: any = await res.json().catch(() => null);

  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    // Conta pessoal (não Business/Creator) é o erro mais comum e não é falha nossa.
    throw new Error(`[abm/instagram] business_discovery falhou para @${limpo}: ${msg}`);
  }

  const bd = json?.business_discovery;
  if (!bd) {
    throw new Error(`[abm/instagram] sem business_discovery para @${limpo} (conta pessoal ou inexistente?)`);
  }

  const posts: any[] = bd.media?.data ?? [];
  const sinais: SinalInstagram[] = [];
  for (const p of posts) {
    // p.caption é o ÚNICO campo de post que sai daqui.
    sinais.push(...extrairSinais(p?.caption, { data: p?.timestamp ?? null, permalink: p?.permalink ?? null }));
  }

  return {
    perfil: {
      handle: bd.username ?? limpo,
      seguidores: typeof bd.followers_count === 'number' ? bd.followers_count : null,
      totalPosts: typeof bd.media_count === 'number' ? bd.media_count : null,
      website: bd.website ?? null,
      biografia: typeof bd.biography === 'string' ? sanitizarLegenda(bd.biography) : null,
    },
    sinais: dedupPorTipo(sinais),
    postsAnalisados: posts.length,
  };
}
