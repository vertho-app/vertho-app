import type { DemoPresentationRoleKey, DemoPresentationTenantSlug } from '@/lib/demo/presentation';

/**
 * A primeira ação dentro de cada visão da degustação.
 *
 * 🔴 POR QUE EXISTE. O convite entrega três visões prontas e a pessoa cai numa
 * tela de produto real, com menu inteiro, sem saber o que olhar primeiro.
 * `Medido 18/09/2026`: a única convidada que atravessou a experiência abriu as
 * três visões em quatro minutos e não abriu nada dentro delas.
 *
 * É UMA FRASE E ATÉ QUATRO PERGUNTAS, no topo da tela inicial daquele papel, que a
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

const PERGUNTAS_DO_PARTICIPANTE: readonly DestinoDaOrientacao[] = [
  { rotulo: 'Como aplico o aprendizado no dia a dia?', path: '/dashboard/temporada' },
  { rotulo: 'O que eu preciso desenvolver?', path: '/dashboard/pdi' },
  { rotulo: 'Como meu jeito de agir influencia meu trabalho?', path: '/dashboard/perfil-comportamental' },
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
    texto: 'O que você quer descobrir sobre o seu time? Escolha uma pergunta para explorar.',
    destinos: [
      { rotulo: 'Como eu sei que o time está engajado?', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'Como acompanho o desenvolvimento da Bruna?', path: '/dashboard/temporada', pessoa: 'bruna.demo@vertho.ai' },
      { rotulo: 'Como vejo a evolução de cada pessoa?', path: '/dashboard/gestor/equipe-evolucao' },
    ],
  },
  rh: {
    casa: '/dashboard',
    texto: 'O que você precisa entender para desenvolver as pessoas? Explore os dados por trás de cada pergunta.',
    destinos: [
      { rotulo: 'Como eu sei que o time está engajado?', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'O desenvolvimento está gerando evolução?', path: '/dashboard/gestor/equipe-evolucao' },
      { rotulo: 'Quem tem mais aderência a cada cargo?', path: '/dashboard/gestor/ranking' },
      { rotulo: 'Como a cultura da empresa influencia o time?', path: '/dashboard/relatorios?document=organization-dna' },
    ],
  },
  usuario: {
    casa: '/dashboard',
    texto: 'Como transformar uma avaliação em desenvolvimento no dia a dia? Explore a sua jornada: conteúdo em vários formatos, prática e espaço para tirar dúvidas.',
    destinos: PERGUNTAS_DO_PARTICIPANTE,
  },
};

const ESCOLAS: Record<DemoPresentationRoleKey, OrientacaoDaDegustacao> = {
  gestor: {
    casa: '/dashboard/gestor',
    texto: 'O que você quer descobrir sobre a sua escola? Escolha uma pergunta para explorar.',
    destinos: [
      { rotulo: 'Como eu sei que os professores estão engajados?', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'Como acompanho o desenvolvimento da Marina?', path: '/dashboard/temporada', pessoa: 'marina.demo@vertho.ai' },
      { rotulo: 'Como vejo a evolução de cada professor?', path: '/dashboard/gestor/equipe-evolucao' },
    ],
  },
  rh: {
    casa: '/dashboard',
    texto: 'O que você precisa entender para desenvolver a rede? Explore os dados por trás de cada pergunta.',
    destinos: [
      { rotulo: 'Como eu sei que os professores estão engajados?', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'O desenvolvimento está gerando evolução?', path: '/dashboard/gestor/equipe-evolucao' },
      { rotulo: 'Quem tem mais aderência a cada função?', path: '/dashboard/gestor/ranking' },
      { rotulo: 'Como a cultura da rede influencia as escolas?', path: '/dashboard/relatorios?document=organization-dna' },
    ],
  },
  usuario: {
    casa: '/dashboard',
    texto: 'Como transformar uma avaliação em desenvolvimento no dia a dia? Explore a sua jornada: conteúdo em vários formatos, prática e espaço para tirar dúvidas.',
    destinos: PERGUNTAS_DO_PARTICIPANTE,
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
 * 🔴 O código de convidado tem DUAS fontes, e a ordem importa.
 *
 * Quem grava o código na sessão do navegador é a barra da sala, num efeito que
 * roda DEPOIS dos efeitos dos filhos (React executa de baixo para cima). No
 * primeiro carregamento da sala, portanto, a dica olharia para uma sessão ainda
 * vazia e não apareceria justamente na visita que ela existe para orientar. Na
 * primeira tela o código ainda está na URL (a barra o remove logo em seguida),
 * então vale o primeiro candidato bem formado.
 */
export function primeiroCodigoDeConvidado(candidatos: readonly unknown[], padrao: RegExp): string | null {
  for (const candidato of candidatos) {
    if (typeof candidato !== 'string') continue;
    const limpo = candidato.trim();
    if (limpo && padrao.test(limpo)) return limpo;
  }
  return null;
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
