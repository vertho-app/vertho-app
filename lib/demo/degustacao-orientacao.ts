import type { DemoPresentationRoleKey, DemoPresentationTenantSlug } from '@/lib/demo/presentation';

/**
 * A primeira ação dentro de cada visão da degustação.
 *
 * 🔴 POR QUE EXISTE. O convite entrega três visões prontas e a pessoa cai numa
 * tela de produto real, com menu inteiro, sem saber o que olhar primeiro.
 * `Medido 18/09/2026`: a única convidada que atravessou a experiência abriu as
 * três visões em quatro minutos e não abriu nada dentro delas.
 *
 * É UMA FRASE E ATÉ TRÊS LINKS, no topo da tela inicial daquele papel, que a
 * pessoa dispensa quando quiser. Não é tour, não cobre menu e não bloqueia
 * navegação: quem quiser explorar sozinho não é atrapalhado.
 *
 * ⚠️ Pessoa se aponta por E-MAIL DE PERSONA, nunca por id. O reset das 04:00
 * recria os colaboradores, então um UUID escrito aqui morre na madrugada
 * seguinte. Quem resolve o id é o servidor, no momento da visita; se a persona
 * não existir, aquele link some e o resto da linha continua de pé.
 */

export type DestinoDaOrientacao = {
  rotulo: string;
  /** Caminho do produto, igual ao que o menu usaria. */
  path: string;
  /**
   * E-mail da persona que o link abre. O `path` recebe `?colaborador=<id>` e
   * `origem=gestor` (é assim que a tela sabe que é leitura de liderança).
   */
  pessoa?: string;
};

export type OrientacaoDaDegustacao = {
  /** Caminho EXATO da tela inicial do papel: fora dela a linha não aparece. */
  casa: string;
  texto: string;
  destinos: readonly DestinoDaOrientacao[];
};

const PAINEIS_DO_RH: readonly DestinoDaOrientacao[] = [
  { rotulo: 'Evolução', path: '/dashboard/gestor/equipe-evolucao' },
  { rotulo: 'Engajamento', path: '/dashboard/gestor/engajamento' },
  { rotulo: 'DNA da organização', path: '/dashboard/relatorios?document=organization-dna' },
];

/**
 * Empresa (ACME e Grupo Sinal compartilham o elenco comercial).
 *
 * A pessoa apontada ao gestor é a que está NO MEIO da jornada: é nela que a
 * leitura de liderança tem o que fazer. Quem já concluiu vira número no
 * engajamento; quem não começou é outra conversa.
 */
const EMPRESA: Record<DemoPresentationRoleKey, OrientacaoDaDegustacao> = {
  gestor: {
    casa: '/dashboard/gestor',
    texto: 'Comece pelo engajamento do time e depois abra uma pessoa para ver o que fazer com ela.',
    destinos: [
      { rotulo: 'Ver o engajamento', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'Abrir a Bruna', path: '/dashboard/temporada', pessoa: 'bruna.demo@vertho.ai' },
    ],
  },
  rh: {
    casa: '/dashboard',
    texto: 'O panorama resume; os painéis mostram. São estes três que o RH acompanha.',
    destinos: PAINEIS_DO_RH,
  },
  usuario: {
    casa: '/dashboard',
    texto: 'Abra a sua jornada: cada semana traz o conteúdo em todos os formatos, o tira-dúvidas e as evidências para responder.',
    destinos: [{ rotulo: 'Abrir a jornada', path: '/dashboard/temporada' }],
  },
};

const ESCOLAS: Record<DemoPresentationRoleKey, OrientacaoDaDegustacao> = {
  gestor: {
    casa: '/dashboard/gestor',
    texto: 'Comece pelo engajamento da escola e depois abra uma professora para ver o que fazer com ela.',
    destinos: [
      { rotulo: 'Ver o engajamento', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'Abrir a Marina', path: '/dashboard/temporada', pessoa: 'marina.demo@vertho.ai' },
    ],
  },
  rh: {
    casa: '/dashboard',
    texto: 'O panorama resume; os painéis mostram. São estes três que a direção acompanha.',
    destinos: PAINEIS_DO_RH,
  },
  usuario: {
    casa: '/dashboard',
    texto: 'Abra a sua jornada: cada semana traz o conteúdo em todos os formatos, o tira-dúvidas e as evidências para responder.',
    destinos: [{ rotulo: 'Abrir a jornada', path: '/dashboard/temporada' }],
  },
};

export const ORIENTACAO_POR_AMBIENTE: Record<DemoPresentationTenantSlug, Record<DemoPresentationRoleKey, OrientacaoDaDegustacao>> = {
  'acme-demo': EMPRESA,
  gruposinal: EMPRESA,
  'escolas-acme': ESCOLAS,
};

export function orientacaoDaDegustacao(slug: unknown, papel: unknown): OrientacaoDaDegustacao | null {
  if (typeof slug !== 'string' || typeof papel !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(ORIENTACAO_POR_AMBIENTE, slug)) return null;
  const doAmbiente = ORIENTACAO_POR_AMBIENTE[slug as DemoPresentationTenantSlug];
  if (!Object.prototype.hasOwnProperty.call(doAmbiente, papel)) return null;
  return doAmbiente[papel as DemoPresentationRoleKey];
}

/** Os e-mails que o servidor precisa resolver para montar os links deste papel. */
export function personasDaOrientacao(orientacao: OrientacaoDaDegustacao | null): string[] {
  if (!orientacao) return [];
  return [...new Set(orientacao.destinos.map((d) => d.pessoa).filter((e): e is string => Boolean(e)))];
}

export type LinkDaOrientacao = { rotulo: string; href: string };

/**
 * Monta os links finais. Destino de pessoa cujo id não veio é DESCARTADO, nunca
 * vira link sem colaborador: a tela responderia como se fosse a jornada de quem
 * está logado, que é outra pessoa.
 */
export function linksDaOrientacao(
  orientacao: OrientacaoDaDegustacao | null,
  idPorPersona: Record<string, string> = {},
): LinkDaOrientacao[] {
  if (!orientacao) return [];
  const links: LinkDaOrientacao[] = [];
  for (const destino of orientacao.destinos) {
    if (!destino.pessoa) {
      links.push({ rotulo: destino.rotulo, href: destino.path });
      continue;
    }
    const id = Object.prototype.hasOwnProperty.call(idPorPersona, destino.pessoa)
      ? String(idPorPersona[destino.pessoa] || '')
      : '';
    if (!id) continue;
    const separador = destino.path.includes('?') ? '&' : '?';
    links.push({
      rotulo: destino.rotulo,
      href: `${destino.path}${separador}colaborador=${encodeURIComponent(id)}&origem=gestor`,
    });
  }
  return links;
}

/**
 * A linha só aparece na CASA do papel. Depois que a pessoa entrou numa tela, a
 * orientação de "por onde começar" virou ruído no topo do que ela escolheu ver.
 */
export function naCasaDoPapel(pathname: unknown, casa: string): boolean {
  if (typeof pathname !== 'string' || !pathname) return false;
  const semBarraFinal = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return semBarraFinal === casa;
}
