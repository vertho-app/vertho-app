/**
 * Descoberta das redes oficiais A PARTIR DO PRÓPRIO SITE da empresa.
 *
 * Por que ler o site e não pesquisar: a régua de identidade do Copiloto
 * (lib/copiloto/social-identity.ts) só aceita sinal social vindo de um perfil
 * que o VENDEDOR declarou oficial. Um perfil linkado no rodapé do site
 * institucional é a evidência mais barata e mais forte dessa titularidade —
 * quem publicou o link foi a própria empresa. Busca aberta, não: traria homônimo
 * e perfil de fã com a mesma confiança.
 *
 * O que sai daqui alimenta o campo "Redes sociais oficiais"; o usuário revisa
 * antes de gerar o Play. Nada aqui vira sinal sozinho.
 *
 * Este arquivo é o núcleo PURO — sem rede, sem `node:*`. Fica assim de propósito:
 * a tela do Copiloto (`'use client'`) importa `perfilCanonico` para mesclar o que
 * foi descoberto com o que o vendedor já digitou, e um import de `net-guard`
 * (que usa `node:dns`) quebraria o bundle. O I/O mora em
 * `lib/copiloto/social-discovery-fetch.ts`.
 */

import { parseOfficialSocialUrls } from '@/lib/copiloto/social-identity';

export type RedeSocial = 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'x' | 'tiktok';

/** Ordem de utilidade comercial: o que sobrevive ao teto de 8 é o topo desta lista. */
const ORDEM_REDES: RedeSocial[] = ['linkedin', 'instagram', 'facebook', 'youtube', 'x', 'tiktok'];

export const MAX_PERFIS = 8;

/**
 * Caminhos que existem no domínio da rede mas NÃO são o perfil da empresa:
 * botão de compartilhar, pixel de rastreio, página de conteúdo avulso.
 * Sem isso, todo site com botão "compartilhar no Facebook" viraria um perfil.
 */
const BLOQUEIO: Record<RedeSocial, Set<string>> = {
  linkedin: new Set(),
  instagram: new Set([
    'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'direct',
    's', 'share', 'about', 'developer', 'legal', 'privacy', 'sharer',
  ]),
  facebook: new Set([
    'sharer', 'sharer.php', 'share.php', 'share', 'dialog', 'plugins', 'tr',
    'login', 'login.php', 'l.php', 'profile.php', 'hashtag', 'events', 'groups',
    'people', 'search', 'watch', 'story.php', 'permalink.php', 'photo',
    'photo.php', 'video.php', 'media', 'ajax', 'help', 'policies', 'business',
    'gaming', 'marketplace', 'notes', 'privacy', 'legal', 'settings',
  ]),
  youtube: new Set(),
  x: new Set([
    'intent', 'share', 'home', 'i', 'search', 'hashtag', 'explore', 'login',
    'privacy', 'tos', 'settings', 'messages', 'notifications', 'compose',
    'account', 'about', 'help', 'signup', 'status',
  ]),
  tiktok: new Set(),
};

const HANDLE_VALIDO = /^@?[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;

function redeDoHost(hostname: string): RedeSocial | null {
  const host = hostname.toLowerCase();
  if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)facebook\.com$/.test(host)) return 'facebook';
  if (/(^|\.)youtube\.com$/.test(host)) return 'youtube';
  if (/(^|\.)(twitter|x)\.com$/.test(host)) return 'x';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  return null;
}

/** Host canônico por rede: twitter.com e x.com viram o mesmo perfil, não dois. */
const HOST_CANONICO: Record<RedeSocial, string> = {
  linkedin: 'linkedin.com',
  instagram: 'instagram.com',
  facebook: 'facebook.com',
  youtube: 'youtube.com',
  x: 'x.com',
  tiktok: 'tiktok.com',
};

export interface PerfilSocial {
  rede: RedeSocial;
  url: string;
}

/**
 * URL de rede social → perfil canônico da EMPRESA, ou null quando o link é
 * conteúdo avulso, botão de compartilhar ou perfil de pessoa.
 *
 * LinkedIn: só `/company`, `/school` e `/showcase`. `/in/` fica de fora de
 * propósito — é o perfil de uma PESSOA, e o campo alimenta a pesquisa sobre a
 * empresa: fato do fundador entraria carimbado como fato da organização.
 */
export function perfilCanonico(raw: string): PerfilSocial | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/\//, '')}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const rede = redeDoHost(url.hostname);
  if (!rede) return null;

  const segs = url.pathname.split('/').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  const primeiro = segs[0].toLowerCase();
  if (BLOQUEIO[rede].has(primeiro)) return null;

  let caminho: string | null = null;
  if (rede === 'linkedin') {
    if (['company', 'school', 'showcase'].includes(primeiro) && segs[1] && HANDLE_VALIDO.test(segs[1])) {
      caminho = `${primeiro}/${segs[1]}`;
    }
  } else if (rede === 'youtube') {
    if (primeiro.startsWith('@') && HANDLE_VALIDO.test(segs[0])) caminho = segs[0];
    else if (['c', 'channel', 'user'].includes(primeiro) && segs[1] && HANDLE_VALIDO.test(segs[1])) {
      caminho = `${primeiro}/${segs[1]}`;
    }
  } else if (rede === 'tiktok') {
    if (primeiro.startsWith('@') && HANDLE_VALIDO.test(segs[0])) caminho = segs[0];
  } else if (rede === 'facebook' && primeiro === 'pages') {
    // facebook.com/pages/Nome-Da-Empresa/123456 — o id é o que identifica.
    if (segs[1] && segs[2]) caminho = `pages/${segs[1]}/${segs[2]}`;
  } else if (HANDLE_VALIDO.test(segs[0])) {
    caminho = segs[0];
  }
  if (!caminho) return null;

  return { rede, url: `https://${HOST_CANONICO[rede]}/${caminho}` };
}

/**
 * Todas as URLs de rede social presentes no HTML cru — inclui `href`, JSON-LD
 * `sameAs` e strings dentro de script. Não parseamos DOM de propósito: em site
 * feito por CMS o rodapé costuma vir montado dentro de JSON, e o regex pega os
 * dois formatos com o mesmo custo.
 */
function urlsSociaisBrutas(html: string): string[] {
  // JSON embutido escapa a barra ("https:\/\/instagram.com\/x") — desfazer antes.
  const texto = html.replace(/\\\//g, '/');
  const padrao = /(?:https?:)?\/\/(?:[a-z0-9-]+\.)*(?:linkedin|instagram|facebook|youtube|twitter|x|tiktok)\.com\/[^\s"'<>()\\[\]]*/gi;
  return [...texto.matchAll(padrao)].map((m) => m[0]);
}

/**
 * Perfis oficiais candidatos, já canônicos, deduplicados e ordenados por
 * utilidade (rede primeiro, frequência no HTML como desempate).
 */
export function extrairPerfisSociais(html: string): string[] {
  const encontrados = new Map<string, { rede: RedeSocial; url: string; vezes: number; ordem: number }>();
  let ordem = 0;
  for (const bruta of urlsSociaisBrutas(html)) {
    const perfil = perfilCanonico(bruta.replace(/[.,;:)\]}>]+$/, ''));
    if (!perfil) continue;
    const chave = perfil.url.toLowerCase();
    const atual = encontrados.get(chave);
    if (atual) atual.vezes += 1;
    else encontrados.set(chave, { ...perfil, vezes: 1, ordem: ordem++ });
  }
  const ordenados = [...encontrados.values()].sort((a, b) => {
    const rede = ORDEM_REDES.indexOf(a.rede) - ORDEM_REDES.indexOf(b.rede);
    if (rede !== 0) return rede;
    if (b.vezes !== a.vezes) return b.vezes - a.vezes;
    return a.ordem - b.ordem;
  });
  // O parse oficial é o mesmo que a rota de planejamento aplica na entrada:
  // o que sai daqui já está no formato que aquele gate aceita.
  return parseOfficialSocialUrls(ordenados.map((item) => item.url)).slice(0, MAX_PERFIS);
}

/**
 * Acrescenta ao campo do vendedor os perfis descobertos que ainda não estão lá.
 * NUNCA sobrescreve: a descoberta é sugestão, quem declara oficialidade é ele.
 * A comparação é canônica, então `www.`, barra final e `twitter.com` × `x.com`
 * não viram entrada duplicada.
 */
export function mesclarPerfisSociais(
  atual: string,
  descobertos: string[],
): { texto: string; adicionados: string[] } {
  const chave = (url: string) => perfilCanonico(url)?.url.toLowerCase() || url.trim().toLowerCase();
  const linhas = atual.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  const existentes = new Set(linhas.flatMap((linha) => linha.split(/[\s,;]+/)).filter(Boolean).map(chave));
  const adicionados: string[] = [];
  for (const perfil of descobertos) {
    const canonica = chave(perfil);
    if (existentes.has(canonica)) continue;
    existentes.add(canonica);
    adicionados.push(perfil);
  }
  return { texto: [...linhas, ...adicionados].join('\n'), adicionados };
}

/** Páginas internas com maior chance de listar as redes quando a home não lista. */
export function paginasCandidatas(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const interessa = /contato|contact|fale-conosco|sobre|about|quem-somos|institucional|imprensa/i;
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const m of html.matchAll(/href=["']([^"'<>]{1,300})["']/gi)) {
    const href = m[1];
    if (!interessa.test(href)) continue;
    let alvo: URL;
    try {
      alvo = new URL(href, base);
    } catch {
      continue;
    }
    if (alvo.protocol !== 'https:' && alvo.protocol !== 'http:') continue;
    if (alvo.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    alvo.hash = '';
    const chave = alvo.toString();
    if (chave === base.toString() || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(chave);
    if (saida.length === 2) break;
  }
  return saida;
}
