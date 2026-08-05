/**
 * Storyboard do vídeo canônico do Mapeamento (DISC), natural-only.
 *
 * UMA captura/narração (voz Achird/Beto) é a fonte; os CORTES selecionam beats:
 *   - 'app'   → corte enxuto (~75-90s), foco em "como responder" (tela de abertura do /mapeamento)
 *   - 'ajuda' → corte completo (~2-2.5min), contexto + como responder + resultado (central de ajuda)
 *
 * Ambiente: acme-demo local (http://acme-demo.localhost:3000), persona ana.demo.
 * Frames: o capture-disc.mts dirige o SPA do /mapeamento (onboarding → intro →
 * ranking → pares → aprendizagem) e o /perfil-comportamental; cada beat referencia
 * um `captureId`. Beats `kind:'cartela'` não têm frame (só texto + narração).
 */

export type Cut = 'app' | 'ajuda' | 'full';

/** Setas de direção sobre a tela de ranking (mecânica de arrastar). */
export type DragHint = { topLabel: string; bottomLabel: string };

export type Highlight = {
  text?: string;
  css?: string;
  label?: string;
};

export type Step = {
  id: string;
  title: string;              // eyebrow/rótulo da etapa
  narration: string;          // texto do TTS (pt-BR)
  cuts: Cut[];                // em quais cortes o beat entra
  kind?: 'screen' | 'cartela';// default 'screen'
  captureId?: string;         // qual frame capturado usar (screens)
  cartela?: { eyebrow?: string; title: string }; // para kind 'cartela'
  dragHint?: DragHint;        // setas na tela de ranking
  highlight?: Highlight;      // callout opcional
};

export type Flow = {
  id: string;
  persona: string;
  title: string;    // cartela de abertura
  subtitle: string;
  steps: Step[];
};

const BOTH: Cut[] = ['app', 'ajuda'];

export const DISC: Flow = {
  id: 'disc',
  persona: 'ana.demo@vertho.ai',
  title: 'Mapeamento comportamental',
  subtitle: 'Como o Vertho lê o seu perfil',
  steps: [
    {
      id: 'abertura',
      title: 'Boas-vindas',
      cuts: BOTH,
      kind: 'cartela',
      cartela: { eyebrow: 'Bem-vindo ao Vertho', title: 'Mapeamento Comportamental' },
      narration:
        'Que bom ter você por aqui! Este é o seu Mapeamento Comportamental — o primeiro passo da sua jornada no Vertho. Vem comigo que eu te mostro como funciona.',
    },
    {
      id: 'oque-e',
      title: 'O que é',
      cuts: ['ajuda'],
      captureId: 'onboarding-top',
      narration:
        'O mapeamento comportamental é o ponto de partida da sua jornada no Vertho. Em poucos minutos, ele desenha o seu perfil — o seu jeito natural de agir.',
    },
    {
      id: 'o-que-fara',
      title: 'O que você vai fazer',
      cuts: BOTH,
      captureId: 'onboarding-cards',
      narration:
        'São perguntas rápidas: primeiro sobre o seu comportamento, depois sobre como você prefere aprender. No total, cerca de cinco minutos.',
      highlight: { text: 'Como funcionam as perguntas', label: 'Dois tipos de pergunta' },
    },
    {
      id: 'espontaneo',
      title: 'A regra de ouro',
      cuts: BOTH,
      captureId: 'intro',
      narration:
        'A chave é uma só: responda pensando no seu jeito mais espontâneo — como você age quando não precisa se policiar. Aqui não existe resposta certa ou errada.',
    },
    {
      id: 'rankings',
      title: 'Como responder — rankings',
      cuts: BOTH,
      captureId: 'rank',
      dragHint: { topLabel: 'MAIS parecido', bottomLabel: 'MENOS parecido' },
      narration:
        'O primeiro tipo traz quatro palavras. Arraste para o topo a que mais tem a ver com você, e para a base a que menos tem. O primeiro impulso costuma ser o mais verdadeiro.',
    },
    {
      id: 'pares',
      title: 'Como responder — pares',
      cuts: BOTH,
      captureId: 'pairs',
      narration:
        'No segundo tipo, aparecem duas frases. Toque na que descreve melhor você — de forma instintiva.',
    },
    {
      id: 'aprendizagem',
      title: 'Preferências de aprendizagem',
      cuts: BOTH,
      captureId: 'learning',
      narration:
        'Para fechar, marque os formatos que você curte para aprender — vídeo, texto, áudio. É o que personaliza a sua trilha.',
    },
    {
      id: 'resultado-perfil',
      title: 'O resultado — seu perfil',
      cuts: ['ajuda'],
      captureId: 'perfil',
      narration:
        'Assim que você termina, o seu perfil aparece na hora: o seu arquétipo e como o comportamento se distribui entre as quatro dimensões.',
      highlight: { text: 'Influência dominante', label: 'Seu arquétipo' },
    },
    {
      id: 'acoes',
      title: 'O que fazer com o perfil',
      cuts: ['ajuda'],
      captureId: 'acoes',
      narration:
        'E o seu perfil não fica preso na tela. Lá em cima, três atalhos: ouvir a devolutiva na voz do mentor, enviar um resumo no seu WhatsApp, ou baixar tudo em PDF para guardar e consultar quando quiser.',
      highlight: { label: 'Ações do perfil' },
    },
    {
      id: 'resultado-comp',
      title: 'O resultado — competências',
      cuts: ['ajuda'],
      captureId: 'competencias',
      narration:
        'E vai além: a partir do perfil, ele revela dezesseis competências — onde você já é forte e onde tem espaço para crescer.',
      highlight: { text: 'Ousadia', label: 'Mapa de 16 competências' },
    },
    {
      id: 'fecho-app',
      title: 'Fecho',
      cuts: ['app'],
      kind: 'cartela',
      cartela: { eyebrow: 'Mapeamento comportamental', title: 'Bora começar?' },
      narration:
        'Pronto para começar? Responda com sinceridade — cinco minutos que orientam toda a sua jornada.',
    },
    {
      id: 'fecho-ajuda',
      title: 'Fecho',
      cuts: ['ajuda'],
      kind: 'cartela',
      cartela: { eyebrow: 'Mapeamento comportamental', title: 'O começo de tudo.' },
      narration:
        'Esse retrato é o começo de tudo: é dele que nasce a sua trilha de desenvolvimento, feita para você.',
    },
  ],
};

const FULL: Cut[] = ['full'];

// ── FLOW: Jornada semanal (bruna.demo — trilha/kit seedados) ─────────────────
export const JORNADA: Flow = {
  id: 'jornada',
  persona: 'bruna.demo@vertho.ai',
  title: 'Sua jornada semanal',
  subtitle: 'Onde o seu desenvolvimento acontece',
  steps: [
    {
      id: 'abertura', title: 'Boas-vindas', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Bem-vindo ao Vertho', title: 'Sua jornada semanal' },
      narration: 'Boas-vindas à sua jornada semanal! É aqui que o seu desenvolvimento acontece, semana a semana. Deixa eu te mostrar como aproveitar.',
    },
    {
      id: 'sua-trilha', title: 'Sua trilha', cuts: FULL, captureId: 'temporada',
      narration: 'Esta é a sua trilha. Cada semana traz um tema ligado à sua competência de foco — e elas se abrem no seu ritmo, uma de cada vez.',
      highlight: { label: 'Sua trilha' },
    },
    {
      id: 'abrir-semana', title: 'A semana', cuts: FULL, captureId: 'semana',
      narration: 'Ao abrir a semana, você encontra o conteúdo daquela etapa, com um desafio prático pra aplicar no dia a dia.',
      highlight: { label: 'Tema da semana' },
    },
    {
      id: 'conteudo', title: 'O conteúdo', cuts: FULL, captureId: 'conteudo',
      narration: 'O conteúdo vem em vários formatos: texto, case, áudio e vídeo. Toque no que combina mais com você e comece por ele.',
      highlight: { label: 'Escolha o formato' },
    },
    {
      id: 'marcar', title: 'Marcar como realizado', cuts: FULL, captureId: 'marcar',
      narration: 'Depois de consumir, marque como realizado. É esse passo que destrava o resto da semana.',
      highlight: { label: 'Marque quando terminar' },
    },
    {
      id: 'tira-duvidas', title: 'Tira-dúvidas', cuts: FULL, captureId: 'tiraduvidas',
      narration: 'Ficou com dúvida? O Beto, seu mentor, está ali no Tira-Dúvidas pra explicar, dar exemplos e ajudar você a aplicar.',
      highlight: { label: 'Pergunte ao mentor' },
    },
    {
      id: 'evidencias', title: 'Evidências', cuts: FULL, captureId: 'evidencias',
      narration: 'E o passo mais importante: as Evidências. É uma conversa. Você conta como colocou o aprendizado em prática, sem precisar anexar nenhum arquivo. É isso que comprova a sua evolução e libera a próxima semana.',
      highlight: { label: 'É uma conversa' },
    },
    {
      id: 'fecho', title: 'Fecho', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Sua jornada semanal', title: 'Bom desenvolvimento!' },
      narration: 'Semana após semana, é assim que você cresce de verdade. Bom desenvolvimento!',
    },
  ],
};

// ── FLOW: PDI (bruna.demo — relatorio individual seedado) ────────────────────
export const PDI: Flow = {
  id: 'pdi',
  persona: 'bruna.demo@vertho.ai',
  title: 'Seu PDI',
  subtitle: 'Plano de Desenvolvimento Individual',
  steps: [
    {
      id: 'abertura', title: 'Boas-vindas', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Bem-vindo ao Vertho', title: 'Seu Plano de Desenvolvimento' },
      narration: 'Este é o seu P D I — o seu Plano de Desenvolvimento Individual. É o seu mapa personalizado de evolução. Vem que eu te explico.',
    },
    {
      id: 'o-que-e', title: 'O que é', cuts: FULL, captureId: 'pdi',
      narration: 'O PDI é montado a partir do seu perfil comportamental e dos seus mapeamentos de competências. Ele começa com uma leitura de quem você é: suas forças e seus pontos de atenção.',
      highlight: { label: 'Seu plano personalizado' },
    },
    {
      id: 'suas-competencias', title: 'Suas competências', cuts: FULL, captureId: 'competencias',
      narration: 'Depois, cada competência aparece no seu nível atual, de N1 a N4. O N4 é o melhor nível, a referência na competência. Assim você vê onde já é forte e onde há espaço pra crescer.',
      highlight: { label: 'Nível por competência' },
    },
    {
      id: 'plano-acao', title: 'Plano de ação', cuts: FULL, captureId: 'plano',
      narration: 'E pra cada competência, um plano prático de 30 dias, com ações, dicas e estudos. Os conteúdos e as tarefas das suas jornadas semanais seguem esse plano, sempre em linha com o seu desenvolvimento.',
      highlight: { label: 'Plano de 30 dias' },
    },
    {
      id: 'baixar', title: 'Leve com você', cuts: FULL, captureId: 'baixar',
      narration: 'Quer levar com você? É só baixar tudo em PDF, pra consultar quando quiser.',
      highlight: { label: 'Baixar em PDF' },
    },
    {
      id: 'fecho', title: 'Fecho', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Seu PDI', title: 'A bússola da sua jornada.' },
      narration: 'O seu PDI é vivo: ele evolui com você a cada temporada. Use como a bússola da sua jornada.',
    },
  ],
};

// ── FLOW: Semana de missão / aplicação (paulo.demo — semanas 4, 8 e 12) ──────
//
// GENÉRICO de propósito: as três semanas de aplicação usam a MESMA tela e a mesma
// mecânica, então a narração nunca cita um número — o mesmo vídeo abre na 4, na 8 e
// na 12. Persona `paulo.demo` (e não bruna) para não mexer no progresso que os
// flows jornada/pdi capturam: a captura de aplicação precisa das semanas 1-3
// concluídas para destravar a 4, e isso mudaria o estúdio daqueles dois.
export const APLICACAO: Flow = {
  id: 'aplicacao',
  persona: 'paulo.demo@vertho.ai',
  title: 'Semana de missão',
  subtitle: 'Quando é hora de colocar em prática',
  steps: [
    {
      id: 'abertura', title: 'Boas-vindas', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Sua jornada', title: 'Semana de missão' },
      narration: 'De tempos em tempos, a sua jornada muda de ritmo. Chega uma semana de missão — e ela funciona diferente das outras. Deixa eu te mostrar.',
    },
    {
      id: 'o-que-muda', title: 'O que muda', cuts: FULL, captureId: 'temporada',
      narration: 'Repare que esta semana está marcada de um jeito diferente na sua trilha. Aqui não tem conteúdo novo pra estudar. É a semana de colocar em prática o que você viu nas anteriores.',
      highlight: { label: 'Uma semana diferente' },
    },
    {
      id: 'missao', title: 'A missão', cuts: FULL, captureId: 'missao',
      narration: 'Ao abrir, você encontra a sua missão. Ela não é um exercício de teoria: é uma tarefa pra fazer de verdade, no seu trabalho, durante a semana.',
      highlight: { label: 'Sua missão da semana' },
    },
    {
      id: 'compromisso', title: 'Seu compromisso', cuts: FULL, captureId: 'compromisso',
      narration: 'Antes de começar, você escolhe onde vai aplicar. Em uma ou duas frases, diga qual situação da sua rotina você vai usar. Esse é o seu compromisso — e é ele que transforma a missão em algo concreto.',
      highlight: { label: 'Escolha a situação real' },
    },
    {
      id: 'aceitar', title: 'Aceitar a missão', cuts: FULL, captureId: 'aceitar',
      narration: 'Clique em "Aceito a missão" e siga a sua semana normalmente. Agora é com você, na prática.',
      highlight: { label: 'Aceite e vá em frente' },
    },
    {
      id: 'executou', title: 'No fim da semana', cuts: FULL, captureId: 'executou',
      narration: 'No fim da semana, volte aqui. A pergunta é simples: você conseguiu executar a missão?',
      highlight: { label: 'Volte e responda' },
    },
    {
      id: 'relato', title: 'Se conseguiu', cuts: FULL, captureId: 'relato',
      narration: 'Se conseguiu, clique em Sim e conte como foi. É uma conversa, não um formulário: o que você fez, o que funcionou, o que te surpreendeu. Sem anexar nada.',
      highlight: { label: 'Conte como foi' },
    },
    {
      id: 'nao-consegui', title: 'Se não deu', cuts: FULL, captureId: 'executou',
      narration: 'E se a semana não colaborou? Sem problema: clique em Não. Aí você recebe uma situação escrita pra analisar, e a sua semana segue em frente do mesmo jeito. Você não fica travado.',
      highlight: { label: 'Não deu? Segue assim' },
    },
    {
      id: 'fecho', title: 'Fecho', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Semana de missão', title: 'É aqui que o aprendizado vira prática.' },
      narration: 'É nessas semanas que o aprendizado sai do papel e vira prática. Bora aplicar!',
    },
  ],
};

// ── FLOW: Boas-vindas (UniAnchieta — entrar + mapeamento + cenários) ─────────
//
// Vídeo único de abertura do programa: como ENTRAR no app, como fazer o
// MAPEAMENTO comportamental e como responder os CENÁRIOS. Teto de 2 minutos —
// a narração é curta de propósito; cada bloco tem ~30s.
//
// Estúdio: tenant `unianchieta` LOCAL, com uma persona FICTÍCIA (Marina Prado)
// que o capture-boasvindas.mts cria e apaga na mesma execução — as 3 diretoras
// reais nunca aparecem em tela. A marca (logo/subtítulo do login) é a do tenant.
//
// ⚠️ O passo de entrada é LINK MÁGICO, não código de 6 dígitos: o estado
// `awaitingCode` do login-form é código morto (nada faz setAwaitingCode(true)).
// Quem informa e-mail/telefone recebe um LINK por e-mail e WhatsApp.
export const BOASVINDAS: Flow = {
  id: 'boasvindas',
  persona: 'marina.demo@vertho.ai',
  title: 'Boas-vindas',
  subtitle: 'Como entrar, se mapear e responder os cenários',
  steps: [
    {
      id: 'abertura', title: 'Boas-vindas', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'UniAnchieta · Vertho', title: 'Sua jornada começa aqui' },
      narration: 'Boas-vindas ao seu programa de desenvolvimento na UniAnchieta! Em dois minutos, eu te mostro como começar.',
    },
    {
      id: 'entrar', title: 'Como entrar', cuts: FULL, captureId: 'login',
      narration: 'Nesta tela, informe o seu e-mail ou o seu número de WhatsApp e toque em Entrar.',
      highlight: { label: 'E-mail ou WhatsApp' },
    },
    {
      id: 'link', title: 'O link de acesso', cuts: FULL, captureId: 'link',
      narration: 'Na hora chega um link de acesso, no e-mail e no WhatsApp. Toque nele: sem senha pra decorar.',
    },
    {
      id: 'home', title: 'Sua página inicial', cuts: FULL, captureId: 'home',
      narration: 'Esta é a sua página inicial. O botão principal mostra sempre o seu próximo passo.',
      highlight: { label: 'Seu próximo passo' },
    },
    {
      id: 'map-inicio', title: 'O mapeamento', cuts: FULL, captureId: 'map-inicio',
      narration: 'O mapeamento é o retrato do seu jeito de agir: cinco minutos, respondendo pelo primeiro impulso. Não existe certo nem errado.',
    },
    {
      id: 'map-rank', title: 'Como responder', cuts: FULL, captureId: 'map-rank',
      dragHint: { topLabel: 'MAIS parecido', bottomLabel: 'MENOS parecido' },
      narration: 'Arraste pro topo a palavra que mais tem a ver com você, e pra base a que menos tem.',
    },
    {
      id: 'map-aprender', title: 'Como você aprende', cuts: FULL, captureId: 'map-aprender',
      narration: 'Pra fechar, marque como prefere aprender: vídeo, texto ou áudio. O conteúdo chega no seu formato.',
    },
    {
      id: 'aval-inicio', title: 'Os cenários', cuts: FULL, captureId: 'aval-inicio',
      narration: 'Depois vêm os cenários: situações reais da direção universitária. Quatro perguntas cada, cerca de dez minutos.',
    },
    {
      id: 'aval-contexto', title: 'Leia o contexto', cuts: FULL, captureId: 'aval-contexto',
      narration: 'Leia o contexto com calma: o que se pede é o que você faria de verdade.',
    },
    {
      id: 'aval-responder', title: 'Responda', cuts: FULL, captureId: 'aval-responder',
      narration: 'Responda com detalhe: situação, ação, raciocínio e análise. E se preferir falar, use o gravador por voz.',
      highlight: { label: 'Prefere falar? Grave por voz' },
    },
    {
      id: 'aval-enviar', title: 'Enviar', cuts: FULL, captureId: 'aval-enviar',
      narration: 'Por fim, diga o quanto essa situação é frequente na sua rotina, e envie.',
    },
    {
      id: 'fecho', title: 'Fecho', cuts: FULL, kind: 'cartela',
      cartela: { eyebrow: 'Boas-vindas', title: 'É daqui que nasce o seu plano.' },
      narration: 'Do cruzamento entre os cenários e o seu perfil nasce o seu plano, no formato em que você aprende melhor. Bom começo!',
    },
  ],
};

export const FLOWS: Record<string, Flow> = { disc: DISC, jornada: JORNADA, pdi: PDI, aplicacao: APLICACAO, boasvindas: BOASVINDAS };
