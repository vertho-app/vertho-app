/**
 * Vídeos que a rota `/v/{guid|slug}` mostra SEM login — e o apelido curto de
 * cada um.
 *
 * A regra padrão do `/v/` é o contrário: quem não tem sessão vai pro /login (os
 * tutoriais de PDI, jornada e semana de missão falam de dentro do produto e não
 * fazem sentido fora dele). A exceção existe para UM caso: vídeo de
 * convite/boas-vindas, enviado por WhatsApp para quem **ainda não tem acesso** —
 * exigir login ali é pedir que a pessoa faça primeiro justamente o que o vídeo
 * está explicando.
 *
 * Allowlist explícita e por GUID, com o motivo ao lado, porque isto é abertura
 * de um gate de autenticação: tem que dar pra auditar lendo o arquivo. Não
 * generalizar (nada de "todo vídeo com título X é público") — cada entrada é
 * uma decisão consciente sobre um vídeo que alguém já assistiu inteiro e sabe
 * que não expõe dado de ninguém.
 *
 * ⚠️ O slug é POR TENANT, não global. "boas-vindas" é o nome óbvio e o segundo
 * cliente vai querer o mesmo: um mapa global faria
 * `outrocliente.vertho.ai/v/boas-vindas` servir o vídeo da UniAnchieta, com a
 * logo certa e o conteúdo errado — e ninguém veria, porque a página carrega
 * normalmente. O GUID continua valendo em qualquer host.
 */
export type VideoPublico = {
  /** GUID no Bunny Stream (library BUNNY_LIBRARY_ID). */
  guid: string;
  /** Slug da empresa (`empresas.slug`) que pode usar o apelido curto. */
  tenant: string;
  /** Apelido curto: /v/{slug}. */
  slug: string;
  /** Por que este vídeo é público — obrigatório, é a justificativa da exceção. */
  motivo: string;
};

export const VIDEOS_PUBLICOS: VideoPublico[] = [
  {
    guid: '3bb52aa2-1d63-4507-9bb1-028e9e7565e1',
    tenant: 'unianchieta',
    slug: 'boas-vindas',
    // Enviado por WhatsApp no convite, antes do primeiro acesso. Gravado com
    // persona FICTÍCIA em telas do app: nenhum dado de participante real aparece.
    motivo: 'Convite de boas-vindas — assistido antes de existir login',
  },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** O vídeo pode ser assistido sem sessão? (recebe SEMPRE um GUID) */
export function isVideoPublico(guid: string): boolean {
  const alvo = (guid || '').toLowerCase();
  return VIDEOS_PUBLICOS.some((v) => v.guid === alvo);
}

/**
 * Traduz o apelido curto em GUID, dentro do tenant. Devolve null quando o
 * parâmetro não é um slug conhecido DAQUELE tenant — inclusive quando o slug
 * existe para outro (não cair no vídeo do vizinho é o ponto).
 */
export function resolverSlugPublico(param: string, tenantSlug: string | null | undefined): string | null {
  const s = (param || '').toLowerCase();
  if (!tenantSlug || !SLUG_RE.test(s)) return null;
  const achado = VIDEOS_PUBLICOS.find((v) => v.slug === s && v.tenant === tenantSlug.toLowerCase());
  return achado?.guid || null;
}
