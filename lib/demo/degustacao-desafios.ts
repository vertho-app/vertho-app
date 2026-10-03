import type { DemoPresentationRoleKey } from '@/lib/demo/presentation';

/**
 * Os desafios da degustação versão C: a fonte única do que o lead escolhe, de
 * onde a escolha o leva e do que o painel diz ao lado da tela.
 *
 * 🔴 POR QUE EXISTE. `Medido 03/10/2026` nos 5 convites B reais: 4 de 4 entraram
 * pela sala do RH (o "Comece por aqui"), os 3 com clique registrado foram na
 * primeira pergunta da lista e 0 de 5 clicaram em falar com a Vertho. A B mostra
 * o mapa do produto por papel; a C parte da DOR. O lead escolhe um desafio, vê a
 * resposta na tela real da sala e volta ao início.
 *
 * Puro e sem `server-only`: o início (servidor) e o painel da sala (cliente)
 * leem o mesmo arquivo, e é isso que impede o painel de dizer uma coisa e o
 * início prometer outra.
 *
 * ⚠️ A CHAVE é o que atravessa a rede, nunca um caminho. O destino sai deste
 * mapa, e uma chave desconhecida (ou de outro papel) é ignorada: a sala abre na
 * casa, como sempre abriu. Busca por `hasOwnProperty`, nunca `in`.
 *
 * ⚠️ O texto dos pontos descreve o que a tela REAL mostra. Ao mexer aqui, ou na
 * tela que ele cita, confira os dois lados no ambiente de demonstração: nada no
 * build acusa um ponto que a tela deixou de sustentar.
 */

export const DESAFIOS_CHAVES = ['resultado', 'engajamento', 'personalizacao', 'gestao', 'diagnostico'] as const;
export type DesafioChave = typeof DESAFIOS_CHAVES[number];

export function ehDesafio(valor: unknown): valor is DesafioChave {
  return typeof valor === 'string' && (DESAFIOS_CHAVES as readonly string[]).includes(valor);
}

/** Parâmetro da URL da sala que carrega a chave do desafio. */
export const CENA_PARAM = 'cena';
/** Guarda a chave na sessão do navegador da SALA, para a navegação dentro dela. */
export const CENA_STORAGE_KEY = 'vertho-degustacao-cena';
/** Prefixo do "Visto" no navegador do CONVITE (a escolha nasce no início). */
export const VISTOS_STORAGE_PREFIX = 'vertho-degustacao-c-vistos';

/** O que `relevant_exploration_target` guarda: qual desafio veio primeiro. */
export const DESAFIO_ALVO_PREFIXO = 'dor-';
export function alvoDoDesafio(chave: DesafioChave): `dor-${DesafioChave}` {
  return `${DESAFIO_ALVO_PREFIXO}${chave}`;
}
export function desafioDoAlvo(alvo: unknown): DesafioChave | null {
  if (typeof alvo !== 'string' || !alvo.startsWith(DESAFIO_ALVO_PREFIXO)) return null;
  const chave = alvo.slice(DESAFIO_ALVO_PREFIXO.length);
  return ehDesafio(chave) ? chave : null;
}

export type IconeDoDesafio = 'resultado' | 'engajamento' | 'personalizacao' | 'gestao' | 'diagnostico';

export type DesafioDaDegustacao = {
  chave: DesafioChave;
  icone: IconeDoDesafio;
  /** Rótulo pequeno acima do desafio. */
  tema: string;
  /** Primeira pessoa, nas palavras do lead. */
  titulo: string;
  /** Dentro da frase "Um dos meus desafios hoje é ...", na mensagem do contato. */
  frase: string;
  /** Qual sala abre: o papel que enxerga a resposta. */
  sala: DemoPresentationRoleKey;
  /** Caminho dentro da sala (pode ter query). */
  caminho: string;
  /** O que olhar na tela, em três pontos. */
  pontos: readonly [string, string, string];
  /** "Em geral": como costuma ser sem a Vertho. */
  emGeral: string;
  /** "Com a Vertho". */
  com: string;
};

const EMPRESA: readonly DesafioDaDegustacao[] = [
  {
    chave: 'resultado', icone: 'resultado', tema: 'Resultado do desenvolvimento',
    titulo: 'Invisto em treinamento e não sei se mudou alguma coisa.',
    frase: 'investir em treinamento sem saber se mudou alguma coisa',
    sala: 'rh', caminho: '/dashboard/gestor/equipe-evolucao',
    pontos: [
      'Cada pessoa mostra de que nível saiu e a que nível chegou em cada competência (por exemplo, Nível 2 → Nível 3).',
      'A evolução aparece por competência e por pessoa, não só por presença ou satisfação.',
      'Cada evolução vem classificada como confirmada, parcial ou estável.',
    ],
    emGeral: 'Lista de presença e nota de satisfação do treinamento.',
    com: 'Evolução medida por pessoa e por competência.',
  },
  {
    chave: 'engajamento', icone: 'engajamento', tema: 'Engajamento',
    titulo: 'Meu time não engaja com o que a gente oferece.',
    frase: 'o time não engajar com o que oferecemos',
    sala: 'rh', caminho: '/dashboard/gestor/engajamento',
    pontos: [
      'Quantas pessoas estão em curso e em que etapa da jornada cada uma está.',
      'Quantos acessaram o conteúdo, consumiram e entregaram evidência.',
      'Cada pendência abre a lista de quem parou, para agir sobre as pessoas certas.',
    ],
    emGeral: 'Treinamento que depende de a pessoa lembrar de entrar.',
    com: 'Conteúdo curto que chega até a pessoa, e acompanhamento de quem parou.',
  },
  {
    chave: 'personalizacao', icone: 'personalizacao', tema: 'Personalização',
    titulo: 'Treinamento igual para todo mundo não funciona.',
    frase: 'treinamento igual para todo mundo não funcionar',
    sala: 'usuario', caminho: '/dashboard/temporada',
    pontos: [
      'Esta é a jornada da Bruna, uma pessoa de exemplo: 7 semanas para evoluir uma competência.',
      'Cada semana libera numa data e traz o conteúdo em vários formatos (áudio, texto e vídeo).',
      'O desafio da semana é escolhido pelo perfil comportamental e pelo cargo da pessoa.',
    ],
    emGeral: 'O mesmo vídeo e o mesmo exercício para todos.',
    com: 'Um caminho para cada pessoa, sobre a mesma competência.',
  },
  {
    chave: 'gestao', icone: 'gestao', tema: 'Papel da liderança',
    titulo: 'Os gestores não acompanham o desenvolvimento do time.',
    frase: 'os gestores não acompanharem o desenvolvimento do time',
    sala: 'gestor', caminho: '/dashboard/gestor',
    pontos: [
      'A equipe numa tela só: quantos estão em trilha, quem precisa de apoio e a atividade da semana.',
      'Uma leitura pronta para decidir: o que sustentar, o que acompanhar e a próxima decisão.',
      'O pulso de cada competência e os pontos fortes a reconhecer, com nome e nível.',
    ],
    emGeral: 'O acompanhamento depende de planilha e de conversa avulsa.',
    com: 'O gestor acompanha a equipe semana a semana, com uma leitura pronta para agir.',
  },
  {
    chave: 'diagnostico', icone: 'diagnostico', tema: 'Diagnóstico do grupo',
    titulo: 'Não sei onde o meu time é forte e onde está o gap.',
    frase: 'não saber onde o time é forte e onde está o gap',
    sala: 'rh', caminho: '/dashboard/relatorios?document=organization-dna',
    pontos: [
      'Um retrato do grupo por competência, a partir do que cada pessoa demonstrou.',
      'É um diagnóstico coletivo: olha para o grupo por competência, e não para cada pessoa.',
      'Aponta forças e lacunas por competência, para priorizar o desenvolvimento.',
    ],
    emGeral: 'Diagnóstico pela percepção do gestor.',
    com: 'Retrato do grupo por competência, a partir do que cada pessoa demonstrou.',
  },
];

const ESCOLAS: readonly DesafioDaDegustacao[] = [
  {
    chave: 'resultado', icone: 'resultado', tema: 'Resultado da formação',
    titulo: 'Invisto em formação e não sei se mudou a prática em sala.',
    frase: 'investir em formação sem saber se mudou a prática em sala',
    sala: 'rh', caminho: '/dashboard/gestor/equipe-evolucao',
    pontos: [
      'Cada professor mostra de que nível saiu e a que nível chegou em cada competência (por exemplo, Nível 2 → Nível 3).',
      'A evolução aparece por competência e por professor, não só por presença na formação.',
      'Cada evolução vem classificada como confirmada, parcial ou estável.',
    ],
    emGeral: 'Lista de presença e nota de satisfação da formação.',
    com: 'Evolução medida por professor e por competência.',
  },
  {
    chave: 'engajamento', icone: 'engajamento', tema: 'Engajamento',
    titulo: 'Meus professores não engajam com a formação.',
    frase: 'os professores não engajarem com a formação',
    sala: 'rh', caminho: '/dashboard/gestor/engajamento',
    pontos: [
      'Quantos professores estão em curso e em que etapa da jornada cada um está.',
      'Quantos acessaram o conteúdo, consumiram e entregaram evidência.',
      'Cada pendência abre a lista de quem parou, para agir sobre as pessoas certas.',
    ],
    emGeral: 'Formação que depende de o professor lembrar de entrar.',
    com: 'Conteúdo curto que chega até o professor, e acompanhamento de quem parou.',
  },
  {
    chave: 'personalizacao', icone: 'personalizacao', tema: 'Personalização',
    titulo: 'Formação igual para todos os professores não funciona.',
    frase: 'formação igual para todos os professores não funcionar',
    sala: 'usuario', caminho: '/dashboard/temporada',
    pontos: [
      'Esta é a jornada da Marina, uma professora de exemplo: 7 semanas para evoluir uma competência.',
      'Cada semana libera numa data e traz o conteúdo em vários formatos (áudio, texto e vídeo).',
      'O desafio da semana é escolhido pelo perfil comportamental e pela função do professor.',
    ],
    emGeral: 'O mesmo vídeo e o mesmo exercício para todos.',
    com: 'Um caminho para cada professor, sobre a mesma competência.',
  },
  {
    chave: 'gestao', icone: 'gestao', tema: 'Papel da coordenação',
    titulo: 'A coordenação não acompanha o desenvolvimento dos professores.',
    frase: 'a coordenação não acompanhar o desenvolvimento dos professores',
    sala: 'gestor', caminho: '/dashboard/gestor',
    pontos: [
      'Os professores numa tela só: quantos estão em trilha, quem precisa de apoio e a atividade da semana.',
      'Uma leitura pronta para decidir: o que sustentar, o que acompanhar e a próxima decisão.',
      'O pulso de cada competência e os pontos fortes a reconhecer, com nome e nível.',
    ],
    emGeral: 'O acompanhamento depende de planilha e de conversa avulsa.',
    com: 'A coordenação acompanha os professores semana a semana, com uma leitura pronta para agir.',
  },
  {
    chave: 'diagnostico', icone: 'diagnostico', tema: 'Diagnóstico da rede',
    titulo: 'Não sei onde a minha rede é forte e onde está o gap.',
    frase: 'não saber onde a rede é forte e onde está o gap',
    sala: 'rh', caminho: '/dashboard/relatorios?document=organization-dna',
    pontos: [
      'Um retrato da rede por competência, a partir do que cada professor demonstrou.',
      'É um diagnóstico coletivo: olha para a rede por competência, e não para cada professor.',
      'Aponta forças e lacunas por competência, para priorizar a formação.',
    ],
    emGeral: 'Diagnóstico pela percepção de quem coordena.',
    com: 'Retrato da rede por competência, a partir do que cada professor demonstrou.',
  },
];

const DESAFIOS_POR_AMBIENTE: Record<string, readonly DesafioDaDegustacao[]> = {
  'acme-demo': EMPRESA,
  gruposinal: EMPRESA,
  'escolas-acme': ESCOLAS,
};

/**
 * Texto da página da versão C que muda de um ambiente para outro. Escrito por
 * extenso, sem artigo montado em cima de campo livre (mesma régua da cópia da B).
 */
export type CopiaDaVersaoC = {
  tituloAntes: string;
  tituloDestaque: string;
  perfilTexto: string;
  /** No convite: "... no desenvolvimento ___" */
  convite: string;
};

const COPIA_EMPRESA: CopiaDaVersaoC = {
  tituloAntes: 'O que mais te incomoda hoje no ',
  tituloDestaque: 'desenvolvimento do seu time?',
  perfilTexto: 'Mapeamento completo, o mesmo que cada pessoa do seu time faz. Leva alguns minutos.',
  convite: 'do seu time',
};

const COPIA_ESCOLAS: CopiaDaVersaoC = {
  tituloAntes: 'O que mais te incomoda hoje no ',
  tituloDestaque: 'desenvolvimento dos seus professores?',
  perfilTexto: 'Mapeamento completo, o mesmo que cada professor faz. Leva alguns minutos.',
  convite: 'dos seus professores',
};

const COPIA_POR_AMBIENTE: Record<string, CopiaDaVersaoC> = {
  'acme-demo': COPIA_EMPRESA,
  gruposinal: COPIA_EMPRESA,
  'escolas-acme': COPIA_ESCOLAS,
};

function doAmbiente<T>(mapa: Record<string, T>, slug: unknown): T | null {
  return typeof slug === 'string' && Object.prototype.hasOwnProperty.call(mapa, slug) ? mapa[slug] : null;
}

export function copiaDaVersaoC(slug: unknown): CopiaDaVersaoC {
  return doAmbiente(COPIA_POR_AMBIENTE, slug) ?? COPIA_EMPRESA;
}

/** Os desafios do ambiente, na ordem fixa da lista. */
export function desafiosDoAmbiente(slug: unknown): readonly DesafioDaDegustacao[] {
  return doAmbiente(DESAFIOS_POR_AMBIENTE, slug) ?? EMPRESA;
}

export function desafioDoAmbiente(slug: unknown, chave: unknown): DesafioDaDegustacao | null {
  if (!ehDesafio(chave)) return null;
  return desafiosDoAmbiente(slug).find((desafio) => desafio.chave === chave) ?? null;
}

/**
 * A ordem em que ESTE lead vê os desafios: a lista GIRA por sessão.
 *
 * `Medido 03/10/2026`: os 3 que clicaram foram no primeiro item. Com a ordem
 * fixa, o clique mede posição e não prioridade. A rotação é determinística
 * (a sessão é hex de 20 caracteres), então o servidor e uma segunda visita
 * mostram a MESMA ordem, sem guardar nada.
 */
export function ordemDosDesafios<T>(sessionId: unknown, lista: readonly T[]): T[] {
  if (lista.length === 0) return [];
  const semente = typeof sessionId === 'string' ? parseInt(sessionId.slice(0, 4), 16) : NaN;
  const deslocamento = Number.isFinite(semente) ? semente % lista.length : 0;
  return [...lista.slice(deslocamento), ...lista.slice(0, deslocamento)];
}

/**
 * A cena de uma sala: só vale se o desafio abre ESSA sala. Chave de outro papel
 * é recusada, porque o painel apareceria numa tela que não responde ao desafio.
 */
export function cenaDaSala(slug: unknown, papel: unknown, chave: unknown): DesafioDaDegustacao | null {
  const desafio = desafioDoAmbiente(slug, chave);
  return desafio && desafio.sala === papel ? desafio : null;
}

/** O caminho da cena sem query: é com ele que o painel compara o `pathname`. */
export function caminhoBaseDaCena(desafio: Pick<DesafioDaDegustacao, 'caminho'>): string {
  return desafio.caminho.split('?')[0];
}

/** Aceita só chaves conhecidas, sem repetir, na ordem recebida. */
export function desafiosDaLista(bruto: unknown): DesafioChave[] {
  if (typeof bruto !== 'string') return [];
  const vistos = new Set<DesafioChave>();
  for (const parte of bruto.split(',')) {
    const chave = parte.trim();
    if (ehDesafio(chave)) vistos.add(chave);
  }
  return [...vistos];
}

export const OUTRO_DESAFIO_MAX = 140;

/**
 * O "outro desafio" digitado: o texto do lead vai para a URL do WhatsApp e para
 * mais lugar nenhum. Sem caractere de controle, espaço colapsado, no máximo
 * 140 caracteres. Vazio vira ''.
 */
export function limparOutroDesafio(bruto: unknown): string {
  if (typeof bruto !== 'string') return '';
  const semControle = Array.from(bruto, (c) => { const k = c.charCodeAt(0); return k < 32 || (k >= 127 && k <= 159) || k === 0x2028 || k === 0x2029 ? ' ' : c; }).join('');
  return semControle.replace(/\s+/g, ' ').trim().slice(0, OUTRO_DESAFIO_MAX).trim();
}
