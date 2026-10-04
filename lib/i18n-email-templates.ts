import type { AppLocale } from '@/i18n/routing';

/**
 * Textos dos e-mails da jornada nos 4 idiomas (R-67, Onda D, 04/10/2026).
 *
 * POR QUE EM TYPESCRIPT, E NÃO EM `messages/*.json`. É o mesmo desenho de
 * `lib/i18n-auth-templates.ts` e do rótulo de `rodape-privacidade.ts`: e-mail
 * sai de cron, de worker e de script, onde não há request nem contexto do
 * next-intl, e carregar os quatro catálogos de tela (270 KB cada) só para
 * montar um assunto pesaria na função que mais roda no produto. O custo de
 * não estar no catálogo é a paridade, e ela vem de graça aqui: o objeto abaixo
 * é `satisfies Record<AppLocale, CopiaEmail>`, então esquecer uma chave num
 * idioma não compila. A paridade dos `{marcadores}` entre idiomas (que o tipo
 * não vê) é o que `tests/unit/emails-4-idiomas.test.ts` confere.
 *
 * O IDIOMA É O DO DESTINATÁRIO: `colaboradores.locale`, senão o da empresa,
 * senão pt-BR (`resolveAppLocale`, a mesma régua de `actions/certificado.ts` e
 * de `app/api/me`). Quem chama resolve; este módulo só recebe o locale.
 *
 * O QUE NÃO SE TRADUZ: nome de competência, descritor, nome da pessoa e da
 * empresa e o resumo do desafio vêm do banco (ou da IA) e entram como valor.
 *
 * O vocabulário é o de `docs/DESIGN-SYSTEM.md` (Jornada/Recorrido/Journey,
 * Desafio/Desafío/Challenge, Evidências/Evidencias/Evidence, Conteúdo/
 * Contenido/Content, Avaliação final/Evaluación final/Final assessment). O
 * pt-BR é o texto que já saía antes, byte a byte: o teste de paridade o compara
 * com uma cópia congelada.
 */

/** Escapa o que vem do banco antes de entrar num trecho de HTML. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Troca `{marcador}` pelo valor. Em `html` o valor é escapado (o modelo é
 * texto nosso e confiável, o valor vem do banco); em `texto` (assunto) não é,
 * porque assunto não é HTML. Marcador sem valor fica como está: o teste de
 * cobertura é quem garante que isso não chega a um e-mail real.
 */
export function preencher(
  modelo: string,
  valores: Record<string, string | number>,
  modo: 'html' | 'texto' = 'html',
): string {
  return modelo.replace(/\{(\w+)\}/g, (inteiro, chave: string) => {
    if (!Object.prototype.hasOwnProperty.call(valores, chave)) return inteiro;
    const valor = String(valores[chave]);
    return modo === 'html' ? escaparHtml(valor) : valor;
  });
}

export interface CopiaEmail {
  /** Quando a pessoa não tem nome cadastrado. */
  nomePadrao: string;
  assinatura: string;
  /** Saudação com exclamação e com ponto: a cadência usa uma ou outra por e-mail. */
  saudacao: string;
  saudacaoPonto: string;
  formatos: { video: string; audio: string; texto: string; case: string; outro: string };
  /** Tema quando o item do dia não traz competência, descritor nem título. */
  temaPadrao: string;
  pilula: { assunto: string; intro: string; formatoDoDia: string; cta: string; nota: string };
  evidencia: { assunto: string; intro: string; pendente: string; cta: string; nota: string };
  avaliacaoFinal: {
    assuntoAbertura: string; assuntoCobranca: string;
    introAbertura: string; introCobranca: string;
    cta: string; nota: string;
  };
  missao: {
    assunto: string; intro: string; semConteudoNovo: string; resumo: string;
    cta: string; videoIntro: string; videoAlt: string; nota: string;
  };
  pilulaPendente: { assunto: string; intro: string; tema: string; explicacao: string; cta: string };
  semanaPendente: { assunto: string; intro: string; explicacao: string; cta: string };
  /** Link do perfil de evolução, disparado pelo admin para o grupo todo. */
  perfil: { assunto: string; saudacao: string; corpo: string; cta: string };
  /** Assunto padrão do disparo manual, quando o operador não escreve um. */
  assuntoPadraoDisparo: string;
}

const COPIA = {
  'pt-BR': {
    nomePadrao: 'Colaborador',
    assinatura: 'Equipe Vertho',
    saudacao: 'Olá, {nome}!',
    saudacaoPonto: 'Olá, {nome}.',
    formatos: { video: 'vídeo', audio: 'áudio', texto: 'texto', case: 'estudo de caso', outro: 'conteúdo' },
    temaPadrao: 'novo conteúdo da semana',
    pilula: {
      assunto: 'Seu conteúdo da semana {semana}: {tema}',
      intro: 'Seu <strong>conteúdo da semana {semana}</strong> já está disponível.',
      formatoDoDia: 'Seu <strong>{formato}</strong> de hoje: <strong>{tema}</strong>.',
      cta: 'Abrir meu conteúdo →',
      nota: 'Os conteúdos e o desafio da semana ficam na plataforma.',
    },
    evidencia: {
      assunto: 'Evidências da semana {semana}: pendente',
      intro: 'Você está na <strong>semana {semana}</strong> da sua jornada.',
      pendente: 'O registro de evidências desta semana está <strong>pendente</strong>.',
      cta: 'Registrar minha evidência →',
      nota: 'As evidências registradas são usadas para ajustar as próximas semanas da sua jornada.',
    },
    avaliacaoFinal: {
      assuntoAbertura: 'Sua avaliação final está aberta',
      assuntoCobranca: 'Avaliação final pendente',
      introAbertura: 'As semanas de conteúdo da sua jornada foram concluídas, e a <strong>avaliação final</strong> já está aberta.',
      introCobranca: 'As semanas de conteúdo da sua jornada foram concluídas, e a <strong>avaliação final</strong> continua <strong>pendente</strong>.',
      cta: 'Abrir a avaliação final',
      nota: 'O Relatório de Evolução é gerado quando a avaliação final é concluída.',
    },
    missao: {
      assunto: 'Semana {semana}: seu desafio de aplicação',
      intro: 'Chegou a <strong>semana {semana}: desafio de aplicação</strong>.',
      semConteudoNovo: 'Esta semana não tem conteúdo novo: é hora de colocar em prática o que você vem aprendendo, com um <strong>desafio</strong> feito para o seu dia a dia.',
      resumo: 'Seu desafio, em resumo: <em>{acao}</em>',
      cta: 'Ver meu desafio →',
      videoIntro: 'E este vídeo explica como a semana funciona:',
      videoAlt: 'Vídeo explicativo da semana',
      nota: 'Na quinta, a conversa de evidências na plataforma vai perguntar como foi. Boa prática!',
    },
    pilulaPendente: {
      assunto: 'Semana {semana}: {tema} (pendente)',
      intro: 'O conteúdo da <strong>semana {semana}</strong> da sua jornada está disponível.',
      tema: 'Tema: <strong>{tema}</strong>.',
      explicacao: 'Esta semana continua <strong>pendente</strong>: ela somente é concluída na <strong>conversa de evidências</strong>: abrir o conteúdo não conclui a semana.',
      cta: 'Abrir a semana {semana} →',
    },
    semanaPendente: {
      assunto: 'Semana {semanaPendente}: pendente na sua jornada',
      intro: 'Sua jornada está na <strong>semana {semana}</strong>, e a <strong>semana {semanaPendente}</strong> continua pendente.',
      explicacao: 'Ela somente é concluída na <strong>conversa de evidências</strong>: abrir o conteúdo não conclui a semana. A explicação em vídeo está na página da semana.',
      cta: 'Abrir a semana {semanaPendente} →',
    },
    perfil: {
      assunto: '[{empresa}] Seu Perfil de Evolução',
      saudacao: 'Olá {nome}!',
      corpo: 'Seu perfil está disponível.',
      cta: 'Acessar Perfil',
    },
    assuntoPadraoDisparo: '[{empresa}] Avaliação',
  },

  'pt-PT': {
    nomePadrao: 'Colaborador',
    assinatura: 'Equipa Vertho',
    saudacao: 'Olá, {nome}!',
    saudacaoPonto: 'Olá, {nome}.',
    formatos: { video: 'vídeo', audio: 'áudio', texto: 'texto', case: 'estudo de caso', outro: 'conteúdo' },
    temaPadrao: 'novo conteúdo da semana',
    pilula: {
      assunto: 'O seu conteúdo da semana {semana}: {tema}',
      intro: 'O seu <strong>conteúdo da semana {semana}</strong> já está disponível.',
      formatoDoDia: 'O seu <strong>{formato}</strong> de hoje: <strong>{tema}</strong>.',
      cta: 'Abrir o meu conteúdo →',
      nota: 'Os conteúdos e o desafio da semana estão na plataforma.',
    },
    evidencia: {
      assunto: 'Evidências da semana {semana}: pendente',
      intro: 'Está na <strong>semana {semana}</strong> da sua jornada.',
      pendente: 'O registo de evidências desta semana está <strong>pendente</strong>.',
      cta: 'Registar a minha evidência →',
      nota: 'As evidências registadas são usadas para ajustar as próximas semanas da sua jornada.',
    },
    avaliacaoFinal: {
      assuntoAbertura: 'A sua avaliação final está aberta',
      assuntoCobranca: 'Avaliação final pendente',
      introAbertura: 'As semanas de conteúdo da sua jornada foram concluídas e a <strong>avaliação final</strong> já está aberta.',
      introCobranca: 'As semanas de conteúdo da sua jornada foram concluídas e a <strong>avaliação final</strong> continua <strong>pendente</strong>.',
      cta: 'Abrir a avaliação final',
      nota: 'O Relatório de Evolução é gerado quando a avaliação final é concluída.',
    },
    missao: {
      assunto: 'Semana {semana}: o seu desafio de aplicação',
      intro: 'Chegou a <strong>semana {semana}: desafio de aplicação</strong>.',
      semConteudoNovo: 'Esta semana não tem conteúdo novo: é altura de pôr em prática o que tem vindo a aprender, com um <strong>desafio</strong> pensado para o seu dia a dia.',
      resumo: 'O seu desafio, em resumo: <em>{acao}</em>',
      cta: 'Ver o meu desafio →',
      videoIntro: 'E este vídeo explica como a semana funciona:',
      videoAlt: 'Vídeo explicativo da semana',
      nota: 'Na quinta-feira, a conversa de evidências na plataforma vai perguntar como correu. Boa prática!',
    },
    pilulaPendente: {
      assunto: 'Semana {semana}: {tema} (pendente)',
      intro: 'O conteúdo da <strong>semana {semana}</strong> da sua jornada está disponível.',
      tema: 'Tema: <strong>{tema}</strong>.',
      explicacao: 'Esta semana continua <strong>pendente</strong>: só é concluída na <strong>conversa de evidências</strong>. Abrir o conteúdo não conclui a semana.',
      cta: 'Abrir a semana {semana} →',
    },
    semanaPendente: {
      assunto: 'Semana {semanaPendente}: pendente na sua jornada',
      intro: 'A sua jornada está na <strong>semana {semana}</strong> e a <strong>semana {semanaPendente}</strong> continua pendente.',
      explicacao: 'Só é concluída na <strong>conversa de evidências</strong>: abrir o conteúdo não conclui a semana. A explicação em vídeo está na página da semana.',
      cta: 'Abrir a semana {semanaPendente} →',
    },
    perfil: {
      assunto: '[{empresa}] O seu Perfil de Evolução',
      saudacao: 'Olá, {nome}!',
      corpo: 'O seu perfil está disponível.',
      cta: 'Aceder ao Perfil',
    },
    assuntoPadraoDisparo: '[{empresa}] Avaliação',
  },

  'es-ES': {
    nomePadrao: 'Colaborador',
    assinatura: 'Equipo Vertho',
    saudacao: '¡Hola, {nome}!',
    saudacaoPonto: 'Hola, {nome}.',
    formatos: { video: 'vídeo', audio: 'audio', texto: 'texto', case: 'estudio de caso', outro: 'contenido' },
    temaPadrao: 'nuevo contenido de la semana',
    pilula: {
      assunto: 'Tu contenido de la semana {semana}: {tema}',
      intro: 'Tu <strong>contenido de la semana {semana}</strong> ya está disponible.',
      formatoDoDia: 'Tu <strong>{formato}</strong> de hoy: <strong>{tema}</strong>.',
      cta: 'Abrir mi contenido →',
      nota: 'Los contenidos y el desafío de la semana están en la plataforma.',
    },
    evidencia: {
      assunto: 'Evidencias de la semana {semana}: pendiente',
      intro: 'Estás en la <strong>semana {semana}</strong> de tu recorrido.',
      pendente: 'El registro de evidencias de esta semana está <strong>pendiente</strong>.',
      cta: 'Registrar mi evidencia →',
      nota: 'Las evidencias registradas se usan para ajustar las próximas semanas de tu recorrido.',
    },
    avaliacaoFinal: {
      assuntoAbertura: 'Tu evaluación final está abierta',
      assuntoCobranca: 'Evaluación final pendiente',
      introAbertura: 'Las semanas de contenido de tu recorrido han concluido y la <strong>evaluación final</strong> ya está abierta.',
      introCobranca: 'Las semanas de contenido de tu recorrido han concluido y la <strong>evaluación final</strong> sigue <strong>pendiente</strong>.',
      cta: 'Abrir la evaluación final',
      nota: 'El Informe de Evolución se genera cuando se concluye la evaluación final.',
    },
    missao: {
      assunto: 'Semana {semana}: tu desafío de aplicación',
      intro: 'Ha llegado la <strong>semana {semana}: desafío de aplicación</strong>.',
      semConteudoNovo: 'Esta semana no tiene contenido nuevo: es el momento de poner en práctica lo que vienes aprendiendo, con un <strong>desafío</strong> pensado para tu día a día.',
      resumo: 'Tu desafío, en resumen: <em>{acao}</em>',
      cta: 'Ver mi desafío →',
      videoIntro: 'Y este vídeo explica cómo funciona la semana:',
      videoAlt: 'Vídeo explicativo de la semana',
      nota: 'El jueves, la conversación de evidencias en la plataforma te preguntará cómo fue. ¡Buena práctica!',
    },
    pilulaPendente: {
      assunto: 'Semana {semana}: {tema} (pendiente)',
      intro: 'El contenido de la <strong>semana {semana}</strong> de tu recorrido está disponible.',
      tema: 'Tema: <strong>{tema}</strong>.',
      explicacao: 'Esta semana sigue <strong>pendiente</strong>: solo se concluye en la <strong>conversación de evidencias</strong>. Abrir el contenido no concluye la semana.',
      cta: 'Abrir la semana {semana} →',
    },
    semanaPendente: {
      assunto: 'Semana {semanaPendente}: pendiente en tu recorrido',
      intro: 'Tu recorrido está en la <strong>semana {semana}</strong>, y la <strong>semana {semanaPendente}</strong> sigue pendiente.',
      explicacao: 'Solo se concluye en la <strong>conversación de evidencias</strong>: abrir el contenido no concluye la semana. La explicación en vídeo está en la página de la semana.',
      cta: 'Abrir la semana {semanaPendente} →',
    },
    perfil: {
      assunto: '[{empresa}] Tu Perfil de Evolución',
      saudacao: '¡Hola, {nome}!',
      corpo: 'Tu perfil está disponible.',
      cta: 'Acceder al Perfil',
    },
    assuntoPadraoDisparo: '[{empresa}] Evaluación',
  },

  'en-US': {
    nomePadrao: 'Employee',
    assinatura: 'Vertho Team',
    saudacao: 'Hi, {nome}!',
    saudacaoPonto: 'Hi, {nome}.',
    formatos: { video: 'video', audio: 'audio', texto: 'text', case: 'case study', outro: 'content' },
    temaPadrao: 'new content for the week',
    pilula: {
      assunto: 'Your week {semana} content: {tema}',
      intro: 'Your <strong>week {semana} content</strong> is now available.',
      formatoDoDia: 'Your <strong>{formato}</strong> for today: <strong>{tema}</strong>.',
      cta: 'Open my content →',
      nota: 'The content and the challenge for the week are on the platform.',
    },
    evidencia: {
      assunto: 'Week {semana} evidence: pending',
      intro: 'You are in <strong>week {semana}</strong> of your journey.',
      pendente: 'The evidence log for this week is <strong>pending</strong>.',
      cta: 'Log my evidence →',
      nota: 'The evidence you log is used to adjust the upcoming weeks of your journey.',
    },
    avaliacaoFinal: {
      assuntoAbertura: 'Your final assessment is open',
      assuntoCobranca: 'Final assessment pending',
      introAbertura: 'The content weeks of your journey are complete, and the <strong>final assessment</strong> is now open.',
      introCobranca: 'The content weeks of your journey are complete, and the <strong>final assessment</strong> is still <strong>pending</strong>.',
      cta: 'Open the final assessment',
      nota: 'The Evolution Report is generated once the final assessment is completed.',
    },
    missao: {
      assunto: 'Week {semana}: your application challenge',
      intro: 'Your <strong>week {semana} application challenge</strong> has arrived.',
      semConteudoNovo: 'There is no new content this week: it is time to put into practice what you have been learning, with a <strong>challenge</strong> built for your day to day.',
      resumo: 'Your challenge, in short: <em>{acao}</em>',
      cta: 'View my challenge →',
      videoIntro: 'And this video explains how the week works:',
      videoAlt: 'Video explaining how the week works',
      nota: 'On Thursday, the evidence conversation on the platform will ask how it went. Happy practicing!',
    },
    pilulaPendente: {
      assunto: 'Week {semana}: {tema} (pending)',
      intro: 'The content for <strong>week {semana}</strong> of your journey is available.',
      tema: 'Topic: <strong>{tema}</strong>.',
      explicacao: 'This week is still <strong>pending</strong>: it is only completed in the <strong>evidence conversation</strong>. Opening the content does not complete the week.',
      cta: 'Open week {semana} →',
    },
    semanaPendente: {
      assunto: 'Week {semanaPendente}: pending in your journey',
      intro: 'Your journey is in <strong>week {semana}</strong>, and <strong>week {semanaPendente}</strong> is still pending.',
      explicacao: 'It is only completed in the <strong>evidence conversation</strong>: opening the content does not complete the week. The video explanation is on the week page.',
      cta: 'Open week {semanaPendente} →',
    },
    perfil: {
      assunto: '[{empresa}] Your Evolution Profile',
      saudacao: 'Hi, {nome}!',
      corpo: 'Your profile is available.',
      cta: 'View Profile',
    },
    assuntoPadraoDisparo: '[{empresa}] Assessment',
  },
} satisfies Record<AppLocale, CopiaEmail>;

/** Exposto para o teste de paridade; quem monta e-mail usa `copiaEmail`. */
export const COPIA_EMAIL: Record<AppLocale, CopiaEmail> = COPIA;

/**
 * Textos do e-mail no idioma do destinatário. Locale desconhecido (um valor
 * velho gravado no banco, um script sem locale) cai no pt-BR, que é o texto
 * que sempre saiu: nunca lança, porque e-mail da cadência não pode derrubar a
 * empresa inteira por um idioma.
 */
export function copiaEmail(locale?: AppLocale | null): CopiaEmail {
  // hasOwnProperty, nunca `in` nem acesso direto: "constructor" e "toString" são
  // chaves de qualquer objeto e passariam como idioma válido.
  return locale && Object.prototype.hasOwnProperty.call(COPIA_EMAIL, locale)
    ? COPIA_EMAIL[locale]
    : COPIA_EMAIL['pt-BR'];
}

/** Primeiro nome para a saudação, com o nome padrão do idioma quando falta. */
export function primeiroNomeEmail(nome: string | null | undefined, c: CopiaEmail): string {
  return (nome || c.nomePadrao).split(' ')[0];
}
