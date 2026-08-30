/**
 * FONTE ÚNICA dos templates de WhatsApp — o corpo aqui é BYTE-IGUAL ao que foi
 * submetido à Meta (`scripts/_sync-templates-whatsapp.ts`).
 *
 * POR QUE ISTO EXISTE
 * ───────────────────
 * A Cloud API oficial só entrega mensagem iniciada pela empresa através de
 * TEMPLATE APROVADO — um objeto que vive no servidor da Meta, com o texto fixo e
 * variáveis posicionais `{{1}}`, `{{2}}`. O caminho legado (Z-API por QR) manda
 * texto livre montado em TypeScript.
 *
 * São dois consumidores da MESMA copy. Se cada um tiver a sua cópia, elas
 * divergem — e a divergência é invisível, porque nenhuma tela mostra o que foi
 * entregue. Esta base já pagou por isso três vezes num único dia (29/07): a
 * correção estava sempre no gêmeo que não roda. Aqui o texto livre é gerado
 * SUBSTITUINDO as variáveis do corpo do template, então não há segunda cópia
 * para divergir: se o template mudar, o texto do legado muda junto.
 *
 * ⚠️ MUDOU O `body`? O template da Meta precisa ser REENVIADO e reaprovado. Rode
 * o script de sync — editar só este arquivo faz o legado mandar um texto que o
 * template aprovado não conhece, e aí os dois caminhos voltam a divergir.
 *
 * CATEGORIA É DINHEIRO (medido em 14/08/2026)
 * ───────────────────────────────────────────
 * UTILITY custa R$ 0,06–0,09 no Brasil; MARKETING custa R$ 0,40–0,55 — 6×. E a
 * categoria NÃO é o que você declara: a Meta reclassifica na revisão. Três dos
 * sete primeiros templates foram submetidos como UTILITY e voltaram MARKETING.
 *
 * RESULTADO MEDIDO: das 6 copies com a VOZ ORIGINAL do produto (emoji,
 * exclamação, "Bons estudos!", "— Equipe Vertho", tom de conversa), **6 caíram
 * em MARKETING**. Nenhuma resistiu. As reescritas em tom factual seguiram
 * UTILITY.
 *
 * ⚠️ O VEREDITO INICIAL ENGANA. A categoria devolvida na criação é provisória e
 * muda durante a revisão: `pilula_semanal` ficou UTILITY por vinte minutos e
 * depois virou MARKETING; `missao_aplicacao` e `nudge_inatividade`, idem. Uma
 * versão anterior deste comentário afirmava, com base nessa leitura precoce, que
 * a assinatura "— Equipe Vertho" era tolerada — e estava errada. **Só conte a
 * categoria depois de APPROVED.**
 *
 * Sinais que se correlacionaram com a queda:
 *   - nome do produto no corpo ("plataforma Vertho Mentor IA")
 *   - urgência ("Acesse agora", "dá tempo até o fim da semana")
 *   - pergunta engajadora ("Você já fez seu desafio?")
 *   - convite de reengajamento ("Que tal retomar hoje?")
 *   - entusiasmo: exclamação, "Bons estudos!", "Boa prática!"
 * O que passou: afirmar um FATO sobre o estado da conta e explicar para que serve.
 *
 * A amostra é de nove templates, não noventa: heurística observada, não regra
 * publicada pela Meta. O guard em
 * `tests/unit/integrations/whatsapp-templates.test.ts` congela esses sinais para
 * que copy nova não reintroduza um deles sem alguém decidir isso de propósito.
 */

export type TemplateCategoria = 'UTILITY' | 'AUTHENTICATION' | 'MARKETING';

export interface BotaoUrl {
  texto: string;
  /** URL com `{{1}}` NO FIM. Domínio e caminho base fixos — ver `payloadDaMeta`. */
  url: string;
  /** URL completa de exemplo, com esquema. */
  exemplo: string;
}

export interface TemplateDef {
  /** Nome na Meta (minúsculas e underscore — é a chave da API). */
  name: string;
  category: TemplateCategoria;
  /** Código de idioma da Meta (pt_BR, en_US...). */
  language: string;
  /** Corpo com variáveis posicionais `{{1}}`, `{{2}}`, … */
  body: string;
  /** Exemplo por variável, na ordem — a Meta EXIGE para aprovar. */
  example: string[];
  /**
   * Botão de URL, quando o template leva link.
   *
   * O link vai AQUI e não no corpo: link no corpo é o sinal mais associado a
   * reprovação e a reclassificação para MARKETING (que custa ~6× mais).
   */
  botao?: BotaoUrl;
}

/**
 * Ordem das variáveis é contrato: `{{1}}` é sempre o primeiro item de `params`.
 * Trocar a ordem sem reenviar o template entrega os valores nos lugares errados
 * — e isso o typecheck não pega, porque tudo é string.
 */
/**
 * ⚠️ NEM TODO TEMPLATE AQUI JÁ ESTÁ LIGADO AO CÓDIGO QUE ENVIA (14/08/2026).
 *
 *  - LIGADOS (o texto do legado já vem daqui): `evidencia_semanal`,
 *    `nudge_desafio`, `perfil_disponivel`.
 *  - DEFINIDOS, AINDA NÃO CONSUMIDOS: `conteudo_semana`, `missao_semana`,
 *    `retomada_trilha`. As funções correspondentes (`textoPilulaWhatsapp`,
 *    `templateWhatsAppMissao` e o nudge de inatividade embutido em
 *    `trigger-diario-empresa`) seguem com a copy ANTIGA.
 *
 * A distinção é proposital e é decisão de produto pendente: ligar esses três
 * troca a copy que sai HOJE pela Z-API — inclusive a da pílula, que é a de maior
 * volume — pela versão factual, mais seca. Enquanto não forem ligados, a copy
 * daqui e a do call-site DIVERGEM, que é exatamente o que este arquivo existe
 * para impedir. É dívida declarada, não descuido: ou liga, ou remove daqui.
 */
export const TEMPLATES = {
  /** Quinta da semana de aplicação (4/8/12): cobra o registro de evidência. */
  evidencia_semanal: {
    name: 'registro_evidencia',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Você está na semana {{2}} da sua trilha de desenvolvimento.\n\nO registro de evidências desta semana está pendente. Você pode registrar em:\n{{3}}\n\nAs evidências registradas são usadas para ajustar as próximas semanas da sua trilha.',
    example: ['Maria', '5', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5'],
  },

  /** Quinta das semanas de conteúdo: cobra a prática do desafio da semana. */
  nudge_desafio: {
    name: 'registro_desafio',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O desafio da semana {{2}} da sua trilha ainda não foi registrado.\n\nVocê pode rever o desafio e relatar como foi em:\n{{3}}\n\nO relato é usado para acompanhar sua evolução na trilha.',
    example: ['Maria', '5', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5'],
  },

  /** Segunda/terça: conteúdo (pílula) da semana disponível. */
  conteudo_semana: {
    name: 'conteudo_semana',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O conteúdo da semana {{2}} da sua trilha já está disponível: {{3}}.\n\nVocê pode acessar em:\n{{4}}\n\nO conteúdo é selecionado a partir do seu perfil e da competência desta semana.',
    example: ['Maria', '5', 'Escuta ativa na sala de aula', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5'],
  },

  /**
   * Conteúdo da semana, v2 — a versão que a cadência vai usar.
   *
   * POR QUE UM `_v2` E NÃO EDITAR O ANTERIOR
   * ────────────────────────────────────────
   * Template aprovado não se edita sem nova revisão, e o nome APAGADO fica
   * queimado enquanto a exclusão processa (mordeu em 14/08). Nome novo entra na
   * fila em paralelo; o antigo só sai depois que este aprovar.
   *
   * O QUE MUDOU EM RELAÇÃO AO `conteudo_semana`:
   *   1. O link saiu do CORPO e virou BOTÃO. Link no corpo é o sinal que mais se
   *      correlacionou com reprovação e com reclassificação para MARKETING.
   *   2. O link agora é `app.vertho.ai/ir/…` — domínio FIXO, porque a variável
   *      de botão da Meta só pode ir no fim de uma URL fixa e aqui o domínio é
   *      o tenant.
   *   3. A variável carrega semana, formato e pílula: sem isso a pessoa recebe
   *      "seu vídeo de hoje" e cai numa tela genérica — perda silenciosa que a
   *      R1 do health existe para pegar.
   *
   * ⚠️ **Só existe UM.** A proposta original trazia `pilula_semanal_v2` idêntico
   * a este; dois templates byte-iguais recebem DUAS classificações independentes
   * da Meta (4 de 8 mudaram de categoria em 14/08), e aí qual deles o código
   * escolhe passa a decidir se o envio custa 1× ou 6×.
   */
  conteudo_semana_v2: {
    name: 'conteudo_semana_v2',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O conteúdo da semana {{2}} da sua trilha está disponível.\n\nTema: {{3}}\n\nO conteúdo é selecionado a partir do seu perfil e da competência desta semana.',
    example: ['Maria', '5', 'Escuta ativa na sala de aula'],
    botao: {
      // Rótulo funcional. "Acesse agora" é chamada de ação e puxa para MARKETING.
      texto: 'Ver conteúdo',
      url: 'https://app.vertho.ai/ir/{{1}}',
      exemplo: 'https://app.vertho.ai/ir/ibipeba/5/video/2',
    },
  },

  /**
   * TRILHA LIBERADA — o aviso que hoje não existe.
   *
   * Sem ele, a primeira coisa que a pessoa recebe da trilha é uma PÍLULA, sem
   * nunca ter sido avisada de que entrou numa jornada de várias semanas. Duas
   * consequências: ela não sabe o que esperar, e a mensagem seguinte chega sem
   * contexto.
   *
   * 🔑 DIZER O RITMO NÃO É ENFEITE, É PROTEÇÃO DO CANAL: "um conteúdo novo e um
   * registro de prática por semana" transforma as mensagens seguintes em algo
   * anunciado. Mensagem semanal que a pessoa não esperava é candidata a bloqueio
   * — e bloqueio derruba o `quality_rating` do número, que é compartilhado por
   * todos os tenants.
   *
   * ⚠️ O texto NÃO crava o dia da semana: a cadência é configurável por empresa
   * (`sys_config.cadencia`), e um tenant que mude o dia faria a mensagem mentir.
   */
  trilha_liberada: {
    name: 'trilha_liberada',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Sua trilha de desenvolvimento em {{2}} foi liberada: são {{3}} semanas, com um conteúdo novo e um registro de prática por semana.\n\nVocê pode começar em:\n{{4}}\n\nO conteúdo é selecionado a partir do seu perfil e das competências do seu cargo.',
    example: ['Maria', 'Gestão Escolar', '7', 'https://ibipeba.vertho.ai/dashboard/temporada'],
  },

  /**
   * Trilha liberada, v2 — tentativa de trazer o `trilha_liberada` para UTILITY.
   *
   * 🔴 O QUE DERRUBOU A v1, e a lição vale para toda copy nova: eu escrevi a
   * heurística ("os UTILITY afirmam ESTADO da conta; os que descrevem o PROGRAMA
   * caem em MARKETING") ao analisar o `missao_semana` — e caí nela no mesmo dia.
   * A v1 dizia: "…foi liberada: são {{3}} semanas, **com um conteúdo novo e um
   * registro de prática por semana**". A segunda metade explica COMO O PROGRAMA
   * FUNCIONA, e voltou MARKETING.
   *
   * A v2 muda UMA coisa só, de propósito: sai a descrição do funcionamento,
   * fica o número de semanas — que é fato sobre a trilha DELA, não propaganda.
   * Mudar duas coisas de uma vez aprovaria (ou não) sem ensinar qual delas
   * pesava; com uma, o veredito da Meta vira informação.
   *
   * ⚠️ O QUE SE PERDE: o aviso de ritmo protegia o canal — quem sabe que vai
   * receber uma mensagem por semana bloqueia menos. Se esta v2 aprovar como
   * UTILITY, esse aviso precisa achar outro lugar (a tela do primeiro acesso, ou
   * o corpo do primeiro conteúdo), e não some da experiência por descuido.
   */
  trilha_liberada_v2: {
    name: 'trilha_liberada_v2',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Sua trilha de desenvolvimento em {{2}} está disponível: são {{3}} semanas.\n\nVocê pode começar em:\n{{4}}\n\nO conteúdo é selecionado a partir do seu perfil e das competências do seu cargo.',
    example: ['Maria', 'Gestão Escolar', '7', 'https://ibipeba.vertho.ai/dashboard/temporada'],
  },

  /**
   * TRILHA CONCLUÍDA — o fim da jornada de 7 semanas (uma competência).
   *
   * Hoje o programa termina em SILÊNCIO: `actions/temporada-concluida.ts` e
   * `actions/certificado.ts` não enviam nada. É o momento de maior valor
   * percebido do produto inteiro, e o único que não tinha comunicação.
   *
   * 🔴 POR QUE NÃO PROMETE CERTIFICADO. A emissão tem DUAS condições que a
   * mensagem não pode ignorar (`actions/certificado.ts`): participação ≥ 75% e
   * trilha que não seja piloto — piloto (degustação) não emite, por decisão de
   * produto. Uma copy dizendo "seu certificado está disponível" chegaria a quem
   * não tem direito a ele, e a frustração voltaria como resposta na caixa da
   * equipe. O texto afirma o que vale para todos (as semanas foram concluídas e
   * o resultado está lá) e deixa o certificado para quem o encontra na tela.
   *
   * `{{3}}` é o número de semanas, não a constante 7: a jornada de uma
   * competência tem 7, mas "14 semanas" existe como 7×2 em sequência (mig 199),
   * e o piloto tem 2. Cravar o número faria a mensagem mentir em dois dos três
   * modos.
   */
  trilha_concluida: {
    name: 'trilha_concluida',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Você concluiu a sua trilha de desenvolvimento em {{2}}: as {{3}} semanas do programa foram registradas.\n\nSeu resultado final está disponível em:\n{{4}}\n\nOs materiais da trilha continuam acessíveis na sua conta.',
    example: ['Maria', 'Gestão Escolar', '7', 'https://ibipeba.vertho.ai/dashboard/temporada'],
  },

  /**
   * Avaliação NUNCA INICIADA — o maior grupo parado do produto.
   *
   * Medido em 15/08/2026: **187 pessoas** cadastradas sem nenhum passo dado
   * (sem DISC e sem cenário), 159 delas em Macaé. Não existia comunicação
   * nenhuma para esse estado: cadastro sem retorno é indistinguível, do lado de
   * dentro, de "a pessoa não quis" — e do lado de fora, de "nunca soube".
   *
   * A copy afirma o ESTADO DA CONTA ("ainda não foi iniciada"), que é o padrão
   * dos templates que a Meta manteve em UTILITY, e diz o custo em minutos:
   * o atrito de começar é o que trava, e ele se resolve com informação.
   */
  avaliacao_pendente: {
    name: 'avaliacao_pendente',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Sua avaliação de perfil no programa da {{2}} ainda não foi iniciada.\n\nVocê pode começar em:\n{{3}}\n\nA avaliação leva cerca de 15 minutos e é ela que define a sua trilha de desenvolvimento.',
    example: ['Maria', 'Secretaria Municipal de Ibipeba/BA', 'https://ibipeba.vertho.ai/dashboard'],
  },

  /**
   * Avaliação parada DEPOIS do mapeamento comportamental — o `avaliacao_pendente`
   * escrito para quem já deu o primeiro passo.
   *
   * 🔑 POR QUE UM SEGUNDO TEMPLATE PARA O MESMO MOMENTO. O corpo do
   * `avaliacao_pendente` diz "sua avaliação **de perfil** ainda não foi
   * iniciada", e no vocabulário do produto "perfil comportamental" é justamente
   * o que essa pessoa ACABOU de concluir (as telas dizem "SEU PERFIL
   * COMPORTAMENTAL"; o assessment aparece como "avaliação"). Para quem se mapeou
   * há dias, a frase se lê como mensagem desatualizada.
   *
   * Medido em 19-20/08/2026, nos 19 professores de Macaé nesse estado exato:
   * 19/19 entregues, **11 abriram** e apenas **2 responderam** — e nenhuma nova
   * nas 18h seguintes. Não foi alcance nem canal: a mensagem chegou, foi lida e
   * não moveu.
   *
   * Duas diferenças deliberadas: RECONHECE o passo já dado ("Você concluiu o
   * mapeamento comportamental") e NOMEIA a competência em `{{2}}` — o que também
   * empurra para UTILITY, já que corpo vago é MARKETING por definição.
   */
  avaliacao_competencias: {
    name: 'avaliacao_competencias',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Você concluiu o mapeamento comportamental, mas sua avaliação de {{2}} ainda não foi iniciada.\n\nVocê pode começar em:\n{{3}}\n\nSão 4 cenários, cerca de 10 minutos, e é ela que define a sua trilha de desenvolvimento.',
    example: ['Maria', 'Autocuidado e bem-estar profissional', 'https://macae.vertho.ai/dashboard/assessment'],
  },

  /**
   * Avaliação COMEÇADA E PARADA — com o denominador na mensagem.
   *
   * Medido: **39 pessoas** com cenários parcialmente respondidos (29 só em
   * Ibipeba). "Você respondeu 4 de 12" é factual e mostra o quanto falta; um
   * "continue sua avaliação" genérico não diz se falta um passo ou dez.
   *
   * "As respostas já enviadas foram salvas" existe por um motivo específico:
   * quem parou no meio costuma achar que vai recomeçar do zero, e esse medo é o
   * que mantém a pessoa parada.
   */
  avaliacao_parcial: {
    name: 'avaliacao_parcial',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Sua avaliação está parcialmente respondida: {{2}} de {{3}} cenários registrados.\n\nVocê pode continuar de onde parou em:\n{{4}}\n\nAs respostas já enviadas foram salvas.',
    example: ['Maria', '4', '12', 'https://ibipeba.vertho.ai/dashboard'],
  },

  /**
   * Plano de desenvolvimento (PDI) disponível.
   *
   * ⚠️ A tabela `pdis` está VAZIA em todos os tenants (medido 15/08/2026). O que
   * existe hoje é `relatorios` do tipo `individual` — 84 registros, 82 pessoas.
   * Este template anuncia o artefato que a pessoa realmente recebe; se o PDI
   * virar entidade própria, o texto continua valendo, mas o gatilho muda.
   */
  plano_desenvolvimento: {
    name: 'plano_desenvolvimento',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Seu plano de desenvolvimento individual está disponível.\n\nVocê pode acessar em:\n{{2}}\n\nO plano é gerado a partir da sua avaliação de perfil e das competências do seu cargo.',
    example: ['Maria', 'https://ibipeba.vertho.ai/dashboard/perfil'],
  },

  /**
   * PRIMEIRO CONTATO — e é a mensagem mais arriscada do programa inteiro.
   *
   * 🔴 O RISCO AQUI NÃO É A CATEGORIA, É O BLOQUEIO. Ela chega de um número que
   * a pessoa não conhece, e o `boas_vindas` original tinha a FORMA EXATA de um
   * golpe: saudação genérica + link + "clique para entrar direto, **sem senha**"
   * + urgência de expiração. É literalmente o que se ensina a não clicar.
   *
   * Quem desconfia bloqueia ou marca como spam, e isso não cai sobre a mensagem
   * — cai sobre o NÚMERO: `quality_rating` desce, o tier de envio encolhe e o
   * canal morre para todos os tenants de uma vez. Este projeto já perdeu um
   * número assim em 11/08/2026.
   *
   * As três mudanças, todas de copy:
   *   1. Abre pela INSTITUIÇÃO, não pela Vertho — a pessoa conhece a prefeitura
   *      ou a escola; a Vertho ela nunca ouviu falar.
   *   2. Diz POR QUE ela está recebendo ("você foi inscrito pela X"), que é o
   *      que faz o número desconhecido deixar de ser estranho.
   *   3. Sai o "sem senha" e a ênfase na expiração — os dois gatilhos de
   *      desconfiança.
   *
   * ⚠️ "É só responder a esta mensagem" só é honesto porque existe a caixa da
   * equipe (`/admin-v2/inbox`) desde 15/08: alguém LÊ. Antes disso seria
   * promessa vazia — e promessa vazia no primeiro contato é pior que nenhuma.
   *
   * ⚠️ AO LIGAR: mandar em lote pequeno e conferir o `quality_rating` do número
   * depois (a R12 do health lê isso). Turma inteira de uma vez é a forma de
   * descobrir tarde que a copy não convenceu.
   */
  boas_vindas_v2: {
    name: 'boas_vindas_v2',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Você foi inscrito(a) pela {{2}} no programa de desenvolvimento de competências.\n\nEste é o canal oficial do programa. Seu acesso está em:\n{{3}}\n\nSe não reconhece este convite, é só responder a esta mensagem.',
    example: ['Maria', 'Secretaria Municipal de Ibipeba/BA', 'https://ibipeba.vertho.ai/entrar'],
  },

  /**
   * Missão da semana de aplicação, v2 — tentativa de sair de MARKETING.
   *
   * O `missao_semana` (abaixo) JÁ era factual — sem emoji, sem exclamação, sem
   * assinatura — e mesmo assim voltou MARKETING. Ou seja, a heurística "tom
   * factual = UTILITY" não explica sozinha: `boas_vindas` tem emoji E
   * exclamação e ficou UTILITY.
   *
   * Comparando os aprovados, o que separa os UTILITY é AFIRMAR UM ESTADO DA
   * CONTA ("o conteúdo está disponível", "o registro está pendente", "está sem
   * atividade há duas semanas"). O `missao_semana` descreve o PROGRAMA ("a
   * semana é de aplicação: não há conteúdo novo, e sim uma missão prática") — e
   * é o único UTILITY-candidato com DOIS links no corpo.
   *
   * Esta versão muda as duas coisas: afirma o estado e leva UM link. O vídeo
   * explicativo continua existindo — na própria página da semana, que é onde a
   * pessoa cai. Hipótese registrada; só o veredito APPROVED confirma.
   */
  missao_semana_v2: {
    name: 'missao_semana_v2',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. A missão da semana {{2}} da sua trilha está disponível.\n\nVocê pode acessar em:\n{{3}}\n\nNesta semana não há conteúdo novo. O registro da prática é solicitado na quinta-feira.',
    example: ['Maria', '4', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/4'],
  },

  /** Semana de aplicação (4/8/12): missão prática, sem conteúdo novo. */
  missao_semana: {
    name: 'missao_semana',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. A semana {{2}} da sua trilha é de aplicação: não há conteúdo novo, e sim uma missão prática.\n\nSua missão está em:\n{{3}}\n\nO vídeo com a explicação da semana está em:\n{{4}}\n\nNa quinta será solicitado o registro do que você praticou.',
    example: ['Maria', '4', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/4', 'https://ibipeba.vertho.ai/v/missao-aplicacao'],
  },

  /**
   * Nudge de inatividade (2+ semanas sem envio).
   *
   * ⚠️ É o de maior risco de virar MARKETING mesmo em tom factual: reengajar
   * quem parou é, pela definição da Meta, um caso de marketing. Aqui a aposta é
   * afirmar o ESTADO da conta ("sem registro de atividade há mais de duas
   * semanas") em vez de convidar ("Que tal retomar hoje?"). Se cair, cai — e
   * fica sendo o único template caro da cadência, o que é aceitável dado que ele
   * dispara para pouca gente.
   */
  retomada_trilha: {
    name: 'retomada_trilha',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Sua trilha de desenvolvimento está sem registro de atividade há mais de duas semanas.\n\nVocê pode retomar de onde parou em:\n{{2}}\n\nA trilha permanece disponível na sua conta.',
    example: ['Maria', 'https://ibipeba.vertho.ai/dashboard/temporada'],
  },

  /**
   * T+0 do CONARH: entrega o recorte da demonstração ao lead que pediu no estande.
   *
   * 🔑 POR QUE UTILITY, e não MARKETING (submetido 17/08/2026)
   * ─────────────────────────────────────────────────────────
   * Mensagem comercial para contato frio normalmente é **retargeting**, que a
   * régua da Meta classifica como MARKETING *"mesmo quando solicitado pelo
   * usuário"*. O enquadramento que sustenta UTILITY aqui é outro caso da mesma
   * régua: **"Continue a Conversation on WhatsApp"** — iniciar no WhatsApp uma
   * interação começada em outro canal, **a pedido da pessoa**. É literalmente o
   * que acontece: ela esteve no estande e autorizou receber o recorte por aqui.
   *
   * Para isso valer, a mensagem ENTREGA o que foi pedido e **não vende nada**. O
   * convite dos 20 minutos, "circular com o time" e a confirmação de reunião —
   * que o texto livre do `mensagemT0` tem — ficam de fora e vivem na PÁGINA.
   *
   * ⚠️ Se voltar MARKETING, é uma classificação legítima e não vale insistir:
   * re-submeter copy limítrofe como UTILITY é o gatilho da escada de punição
   * (aviso → rate limit → TODOS os UTILITY da WABA viram MARKETING).
   *
   * Texto do dono. O detalhe variável (porta, competência crítica, reunião) não
   * cabe em template — todo `{{n}}` precisa de valor sempre, e template não tem
   * bloco condicional.
   */
  recorte_demonstracao: {
    name: 'recorte_demonstracao',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Segue o recorte da demonstração que você pediu no estande da Vertho, no CONARH.\n\nEle está em:\n{{2}}\n\nUma página com o que você descreveu, o ciclo das 5 etapas e 3 perguntas para revisar seu processo. Se precisar de algo, é só responder por aqui.',
    example: ['Maria', 'https://app.vertho.ai/conarh/mapa/a1b2c3d4'],
  },

  /**
   * SEMANA PENDENTE — a pessoa é convidada para uma semana que a trilha não abre.
   *
   * 🔴 O ESTADO QUE ISTO ENDEREÇA (medido 23/08/2026). A cadência manda o link da
   * semana do CALENDÁRIO (`fase4_envios.semana_atual`), mas a tela exige a
   * anterior CONCLUÍDA — e quem conclui é a conversa de evidências, não abrir o
   * conteúdo. Na segunda-feira 24/08: **32 das 36 pessoas de Ibipeba** (25 sem
   * ter começado a semana 5) e **34 das 38 de Macaé** recebem a pílula de uma
   * semana que vai aparecer trancada. A tela já explica e oferece o caminho de
   * volta (correção de 20/08), mas ela só fala com quem CLICA — quem lê a
   * mensagem e não clica nunca descobre o que falta.
   *
   * 🔑 POR QUE NÃO É O `retomada_trilha`. Aquele afirma outro estado — "sem
   * registro de atividade há mais de duas semanas" — e dispara por inatividade.
   * Aqui a pessoa pode estar ATIVA e ainda assim travada: abriu conteúdo, não
   * fechou a conversa. Mandar a copy de inatividade para quem acabou de abrir a
   * semana é a classe do "cobrança errada para a pessoa certa" (nºs 2 e 3 do
   * `docs/TEMPLATES-WHATSAPP.md`).
   *
   * ⚠️ O QUE ESTA COPY NÃO DIZ, e é de propósito: COMO a conversa conclui (quantos
   * turnos, o que responder). Foi exatamente esse tipo de frase — descrever o
   * funcionamento do programa — que derrubou `trilha_liberada` v1 e
   * `missao_semana` para MARKETING. A explicação vive na TELA, junto do vídeo
   * (mesma decisão do `missao_semana_v2`: "o vídeo explicativo continua
   * existindo — na própria página").
   *
   * Link em BOTÃO, não no corpo: é o sinal que mais se correlacionou com
   * reclassificação (ver `conteudo_semana_v2`). A variável do botão carrega
   * `<slug>/<semana PENDENTE>` — a semana que destrava, NUNCA a atual: mandar
   * para a semana trancada repetiria o erro que a mensagem existe para corrigir.
   */
  semana_pendente: {
    /**
     * ⚠️ `_v2` PORQUE O v1 JÁ ESTAVA NA FILA (23/08). A 1ª submissão
     * (`semana_pendente`, id=28457950447135990) saiu com "com a Mentora"; a Meta
     * recusa edição de template em revisão — `error_subcode 2388003`: *"só podem
     * ser editados se tiverem sido rejeitados"*. Apagar para recriar deixaria o
     * nome QUEIMADO enquanto a exclusão processa (mordeu em 14/08), então o nome
     * novo entra em paralelo e o v1 só sai depois que este aprovar.
     *
     * Chave estável e `name` divergente é o precedente da casa
     * (`perfil_disponivel` → `resultado_perfil`), e o teste `RENOMEADOS` congela
     * o par: mandar a CHAVE para a API daria "template not found" na hora do
     * envio, em produção, para gente real.
     *
     * ✅ 25/08/2026 — o v1 foi APAGADO na Meta (`hsm_id=28457950447135990`,
     * `{"success":true}`), depois de o v2 aprovar E de ele ter entregue o
     * primeiro lote real: 31 pessoas em Ibipeba e 30 em Macaé, 0 falhas. Esta é
     * a ordem que a regra da casa pede — o v1 só sai quando o substituto está
     * aprovado e PROVADO, nunca antes, porque apagar primeiro deixa você sem os
     * dois enquanto a exclusão processa (mordeu em 14/08).
     *
     * ⚠️ A chave continua `semana_pendente` de propósito: o nome apagado fica
     * queimado por um tempo indeterminado, e renomear a chave para casar com o
     * `name` só trocaria esta divergência documentada por um churn sem ganho.
     */
    name: 'semana_pendente_v2',
    category: 'UTILITY',
    language: 'pt_BR',
    // `{{3}}` aparece UMA vez ("Ela" retoma a referência): nenhum dos 17
    // aprovados repete variável, então repetir seria estrear um formato não
    // testado numa submissão em que o nome recusado fica QUEIMADO.
    //
    // 🔴 NÃO DIZ "MENTORA" (corrigido 23/08, apontado pelo dono). A 1ª versão
    // dizia "a conversa de evidências com a Mentora", copiado de `locked.rule` —
    // e essa é a ÚNICA ocorrência da palavra em todo o `pt-BR.json`. Não é
    // vocabulário do produto: a tela chama o card de "Evidências" e o botão de
    // "Levantar evidências". Pior, o que a pessoa reconhece como mentor é o
    // **Beto**, um assistente conversacional que vive noutro lugar e NÃO conclui
    // semana nenhuma — a copy empurraria justamente para o componente errado.
    // O nome na mensagem tem que ser o nome do botão que ela vai apertar.
    // "SOMENTE" é o miolo da mensagem, não ênfase: a crença que trava essas
    // pessoas é que abrir o conteúdo já conclui. Dizer apenas ONDE se conclui
    // deixaria essa crença de pé.
    body: 'Olá, {{1}}. Sua trilha está na semana {{2}}, e a semana {{3}} continua pendente.\n\nEla somente é concluída na conversa de evidências. A explicação em vídeo está na página da semana.',
    example: ['Maria', '6', '5'],
    botao: {
      // Rótulo funcional: "Continuar agora" seria chamada de ação (→ MARKETING).
      texto: 'Abrir a semana',
      url: 'https://app.vertho.ai/ir/{{1}}',
      exemplo: 'https://app.vertho.ai/ir/ibipeba/5',
    },
  },

  /**
   * SEGUNDA de quem está TRAVADO: o conteúdo da semana E a pendência dela, numa
   * mensagem só.
   *
   * 🔴 O QUE ISTO CORRIGE (medido 30/08/2026). Desde 25/08 a pendência sai na
   * TERÇA e a segunda segue entregando `conteudo_semana_v2`, que diz apenas
   * *"o conteúdo da semana X está disponível"*. Para quem está travado, essa
   * segunda-feira não entrega nada de novo: a semana acessível dele não mudou,
   * então é a MESMA pílula da semana anterior, mesmo tema e mesmo link. Medido
   * na coorte real: **46 das 74 pessoas** de Ibipeba e Macaé não concluíram nada
   * desde 24/08 (37 nunca concluíram nada em toda a trilha), e a informação que
   * as destrava só chegava 24h depois.
   *
   * 🔑 POR QUE UM TEMPLATE E NÃO DUAS MENSAGENS. Somar a pendência à segunda
   * seria uma 2ª mensagem no mesmo dia para a mesma pessoa — volume que o número
   * aguenta hoje (Cloud API, 80 msg/s de teto técnico; medido 20/08: 36 em
   * 24,1s), mas que a Meta lê como pressão. Uma mensagem que afirma os DOIS
   * fatos custa uma conversa, não duas.
   *
   * ⚠️ NÃO REPETE VARIÁVEL. "Esta semana" retoma `{{2}}`, o mesmo recurso do
   * "Ela" no `semana_pendente_v2`: nenhum dos 17 aprovados repete variável, e
   * estrear esse formato numa submissão irreversível seria risco sem ganho.
   *
   * O botão diz "Abrir a semana", NÃO "Ver conteúdo": a crença que trava essas
   * pessoas é justamente que abrir o conteúdo conclui a semana (24 delas tinham
   * evento de abertura registrado na semana em que estavam paradas, 25/08). Um
   * rótulo que promete conteúdo reforçaria o defeito que a copy existe para
   * desfazer. O caminho do botão carrega formato e pílula, como no
   * `conteudo_semana_v2`, para o link não cair numa tela genérica.
   */
  conteudo_semana_pendente: {
    name: 'conteudo_semana_pendente',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O conteúdo da semana {{2}} da sua trilha está disponível.\n\nTema: {{3}}\n\nEsta semana continua pendente: ela somente é concluída na conversa de evidências.',
    example: ['Maria', '1', 'Escuta ativa na sala de aula'],
    botao: {
      texto: 'Abrir a semana',
      url: 'https://app.vertho.ai/ir/{{1}}',
      exemplo: 'https://app.vertho.ai/ir/ibipeba/1/video/1',
    },
  },

  /**
   * MESMO momento do `conteudo_semana_pendente`, com a ordem INVERTIDA.
   *
   * 🔴 POR QUE EXISTE (30/08/2026, minutos depois do v1). O v1 voltou
   * `PENDING/MARKETING` na consulta feita 5 min após a criação, que devolvera
   * UTILITY. Em vez de esperar o veredito e perder um ciclo de revisão, os dois
   * correm em paralelo — o precedente é o `semana_pendente` v1/v2 (23/08), e o
   * perdedor só é apagado depois que o vencedor aprova E entrega, nunca antes.
   *
   * O QUE MUDOU, e a evidência por trás:
   *   · O v1 abre ANUNCIANDO disponibilidade e fecha COBRANDO. Nenhum dos 17
   *     aprovados faz as duas coisas nessa ordem: `conteudo_semana_v2` abre
   *     anunciando e fecha justificando o serviço; `registro_evidencia` e
   *     `registro_desafio` cobram, mas abrem pelo ESTADO da conta.
   *   · Aqui a abertura é a do `semana_pendente_v2` — aprovado UTILITY, o mais
   *     próximo que existe deste momento — e o conteúdo entra como
   *     CONTINUIDADE ("segue disponível"), não como novidade ("está
   *     disponível"). Muda-se o mínimo em relação a uma copy que passou.
   *
   * ⚠️ Anunciar disponibilidade NÃO é o sinal, e vale registrar para a próxima
   * pessoa não "corrigir" o lado errado: `conteudo_semana_v2` diz "o conteúdo da
   * semana X está disponível. Tema: Y" e é UTILITY. A hipótese aqui é a
   * COMBINAÇÃO de anúncio com cobrança, não o anúncio.
   *
   * ✅ Contrato IDÊNTICO ao do v1 (`{{1}}`=nome, `{{2}}`=semana acessível,
   * `{{3}}`=tema), de propósito: os dois compartilham o montador em `CONTRATOS`,
   * e escolher entre eles é trocar o valor da env — sem tocar em código.
   */
  conteudo_semana_pendente_v2: {
    name: 'conteudo_semana_pendente_v2',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. A semana {{2}} da sua trilha continua pendente: ela somente é concluída na conversa de evidências.\n\nO conteúdo desta semana, {{3}}, segue disponível na página da semana.',
    example: ['Maria', '1', 'Escuta ativa na sala de aula'],
    botao: {
      texto: 'Abrir a semana',
      url: 'https://app.vertho.ai/ir/{{1}}',
      exemplo: 'https://app.vertho.ai/ir/ibipeba/1/video/1',
    },
  },

  /** Resultado do assessment comportamental liberado. */
  perfil_disponivel: {
    name: 'resultado_perfil',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O resultado do seu perfil comportamental já está disponível na sua conta.\n\nVocê pode consultar em:\n{{2}}\n\nO resultado é usado para personalizar as próximas etapas da sua trilha.',
    example: ['Maria', 'https://ibipeba.vertho.ai/dashboard/perfil-comportamental'],
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateNome = keyof typeof TEMPLATES;

/**
 * ⚠️ A CHAVE do objeto acima é interna; `name` é o que existe na Meta, e os dois
 * DIVERGEM de propósito em três casos (`evidencia_semanal` → `registro_evidencia`
 * etc.).
 *
 * Por quê, medido em 14/08/2026: os nomes originais foram submetidos, voltaram
 * reclassificados como MARKETING, e foram apagados para recriar com copy factual
 * — mas a Meta **bloqueia recriar um nome com categoria diferente enquanto a
 * exclusão processa**, e esse bloqueio dura muito mais que o "menos de 1 minuto"
 * que a mensagem de erro promete. Os três nomes ficaram inutilizáveis.
 *
 * A lição, que vale para qualquer template futuro: **crie a versão corrigida com
 * um nome NOVO e só então apague a antiga.** Apagar primeiro deixa você sem os
 * dois.
 */

/** Quantas variáveis `{{n}}` o corpo declara (o MAIOR índice, não a contagem). */
export function contarVariaveis(body: string): number {
  const indices = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return indices.length ? Math.max(...indices) : 0;
}

/**
 * Renderiza o corpo substituindo `{{n}}` pelos parâmetros — é assim que o
 * caminho legado (texto livre) reaproveita a copy do template aprovado.
 *
 * LANÇA se a quantidade não bater. Deixar passar produziria uma mensagem com
 * `{{3}}` cru no meio do texto, entregue a uma pessoa real — e essa falha é
 * exatamente a que ninguém observa, porque nenhuma tela mostra o que saiu. Aqui
 * é construção de mensagem, não entrega: falhar alto é o lado certo da régua de
 * `lib/degradacao.ts`.
 */
export function renderTemplate(def: TemplateDef, params: string[]): string {
  const esperadas = contarVariaveis(def.body);
  if (params.length !== esperadas) {
    throw new Error(
      `template ${def.name}: esperava ${esperadas} variáveis, recebeu ${params.length}`,
    );
  }
  return def.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
}

/**
 * O corpo JÁ RENDERIZADO de um template, achado pelo nome que existe na Meta.
 *
 * Serve à caixa de entrada: sem isto, a thread mostraria "enviado: conteudo_semana"
 * no lugar da mensagem que a pessoa recebeu — e quem atende teria que adivinhar a
 * que ela está respondendo. O corpo aqui é byte-igual ao aprovado, então o que
 * aparece na tela é o que saiu.
 *
 * `null` (e nunca exceção) quando o nome é desconhecido ou os parâmetros não
 * batem: isto roda DEPOIS de a mensagem ter saído, e uma exceção aqui derrubaria
 * o registro de um envio que já aconteceu. O rótulo do template ainda é gravado —
 * menos que o corpo, muito mais que um buraco.
 *
 * ⚠️ Não substitui o botão: o parâmetro dele costuma ser credencial (o
 * `<slug>~<token>` do magic link), e credencial não entra em caixa de entrada.
 */
export function corpoDoTemplatePorNome(nome: string, params: string[]): string | null {
  const def = Object.values(TEMPLATES).find((t) => t.name === nome) as TemplateDef | undefined;
  if (!def) return null;
  try {
    return renderTemplate(def, params);
  } catch {
    return null;
  }
}

/**
 * Botão de URL com variável — o jeito de mandar link sem link no corpo.
 *
 * ⚠️ A META ACEITA **UMA** VARIÁVEL, E ELA VAI NO FIM DE UMA URL FIXA:
 * "Supports 1 variable, appended to the end of the URL string"
 * (`https://www.exemplo.com/loja?promo={{1}}`).
 *
 * 🔴 Isso colide com o multi-tenant por subdomínio: aqui o DOMÍNIO é o cliente
 * (`ibipeba.vertho.ai`), então `https://{{1}}` — variável cobrindo o domínio —
 * é recusado na revisão. Por isso o link sai por `app.vertho.ai/ir/<slug>/…`
 * (ver `app/ir/[...caminho]/route.ts`), que é domínio fixo e resolve o tenant.
 *
 * `exemplo` é a URL COMPLETA que a Meta usa para validar — sem o `https://` ela
 * reprova por exemplo inválido.
 */
/** Payload de criação na Graph API (`POST /{waba-id}/message_templates`). */
export function payloadDaMeta(def: TemplateDef) {
  const components: Record<string, unknown>[] = [
    { type: 'BODY', text: def.body, example: { body_text: [def.example] } },
  ];

  if (def.botao) {
    components.push({
      type: 'BUTTONS',
      buttons: [{
        type: 'URL',
        text: def.botao.texto,
        url: def.botao.url,
        example: [def.botao.exemplo],
      }],
    });
  }

  return {
    name: def.name,
    language: def.language,
    category: def.category,
    components,
  };
}
