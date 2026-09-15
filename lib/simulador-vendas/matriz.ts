// Matriz PACE aprovada pelo responsável em 15/09/2026. Fonte única das rubricas N1–N4.
export const MATRIZ_VERSION = 'pace-competencias-1';
export type CodigoCompetencia = 'PL' | 'P' | 'A' | 'C' | 'E';
export type DescritorPace = {
  codigo: string;
  nome: string;
  descricao: string;
  niveis: { n1: string; n2: string; n3: string; n4: string };
};
export type CompetenciaPace = {
  codigo: CodigoCompetencia;
  nome: string;
  descricao: string;
  descritores: DescritorPace[];
};
export const COMPETENCIAS_PACE: CompetenciaPace[] = [
  {
    codigo: 'PL',
    nome: 'Planejamento comercial',
    descricao:
      'Preparar a interação comercial com informações, objetivos, perguntas e alternativas coerentes com o contexto do cliente e a oportunidade de negócio.',
    descritores: [
      {
        codigo: 'PL1',
        nome: 'Conhecimento prévio do cliente',
        descricao:
          'Seleciona e organiza informações relevantes sobre o cliente, seu negócio e o histórico da relação.',
        niveis: {
          n1: 'Planeja uma abordagem genérica e desconsidera informações relevantes disponíveis sobre o cliente.',
          n2: 'Reúne dados básicos, mas pouco os relaciona aos desafios do cliente e ao histórico da relação.',
          n3: 'Seleciona informações relevantes, distingue fatos de suposições e identifica o que precisa confirmar na reunião.',
          n4: 'Cruza informações do negócio, dos envolvidos e de interações anteriores; identifica mudanças e contradições que podem alterar a oportunidade.',
        },
      },
      {
        codigo: 'PL2',
        nome: 'Objetivos da interação',
        descricao:
          'Define o avanço pretendido e uma alternativa de continuidade adequada ao momento da oportunidade.',
        niveis: {
          n1: 'Define apenas uma intenção genérica, como apresentar o produto ou vender, sem considerar o momento do cliente.',
          n2: 'Define um objetivo, mas não esclarece como reconhecer o avanço ou o que fazer se ele não for viável.',
          n3: 'Define um avanço concreto e compatível com o momento do cliente, critérios para reconhecê-lo e uma alternativa de continuidade.',
          n4: 'Antecipa diferentes respostas do cliente e define caminhos de avanço, revisão ou encerramento coerentes com o valor e a viabilidade da oportunidade.',
        },
      },
      {
        codigo: 'PL3',
        nome: 'Hipóteses e perguntas',
        descricao:
          'Prepara hipóteses de necessidades e perguntas capazes de confirmá-las, aprofundá-las ou descartá-las.',
        niveis: {
          n1: 'Parte de uma solução pronta e prepara perguntas que apenas induzem sua aceitação.',
          n2: 'Prepara perguntas sobre necessidades, mas pouco explora causas, consequências ou explicações alternativas.',
          n3: 'Formula hipóteses provisórias e perguntas abertas que permitam investigar causas, impactos e prioridades, inclusive descartar suas suposições.',
          n4: 'Prepara perguntas que diferenciam hipóteses concorrentes e identifica quais respostas exigiriam rever o diagnóstico ou a direção da conversa.',
        },
      },
      {
        codigo: 'PL4',
        nome: 'Adequação da abordagem',
        descricao:
          'Planeja a profundidade e a condução da interação conforme o conhecimento do cliente, a complexidade da solução e o tempo disponível.',
        niveis: {
          n1: 'Planeja a mesma apresentação para todos os clientes, ignorando diferenças de conhecimento, complexidade e tempo.',
          n2: 'Ajusta o tempo ou a linguagem, mas mantém uma profundidade de abordagem pouco adequada à situação.',
          n3: 'Planeja a profundidade do diagnóstico, os materiais e o uso do tempo conforme as informações disponíveis, prevendo validar essa escolha com o cliente.',
          n4: 'Prepara formas de condução para diferentes interlocutores e sinais que indiquem quando aprofundar, simplificar ou reorganizar a conversa.',
        },
      },
      {
        codigo: 'PL5',
        nome: 'Preparação de soluções e evidências',
        descricao:
          'Organiza alternativas preliminares e materiais que permitam discutir viabilidade, benefícios e impacto.',
        niveis: {
          n1: 'Seleciona material genérico ou faz previsões de benefício sem base nas informações disponíveis.',
          n2: 'Separa uma alternativa e exemplos, mas deixa pouco claras sua pertinência, suas limitações ou suas premissas.',
          n3: 'Prepara alternativas pertinentes, exemplos verificáveis e estimativas com premissas explícitas, indicando o que depende de validação com o cliente.',
          n4: 'Compara alternativas e identifica quais dados ou condições podem alterar seu valor e sua viabilidade, preparando formas de verificar essas incertezas.',
        },
      },
      {
        codigo: 'PL6',
        nome: 'Antecipação de restrições e objeções',
        descricao:
          'Antecipa barreiras relevantes e prepara alternativas compatíveis com os limites da oferta e da negociação.',
        niveis: {
          n1: 'Ignora restrições previsíveis de prazo, recursos, aprovação ou condições comerciais.',
          n2: 'Lista objeções prováveis, mas prepara respostas padronizadas e sem considerar os limites da negociação.',
          n3: 'Antecipa restrições e objeções relevantes, conhece os limites da oferta e prepara alternativas ou consultas internas necessárias.',
          n4: 'Relaciona barreiras entre si, prioriza as que podem inviabilizar a oportunidade e prepara alternativas considerando impactos para cliente, entrega e negociação.',
        },
      },
    ],
  },
  {
    codigo: 'P',
    nome: 'Preparar',
    descricao:
      'Criar um ambiente de conforto, respeito e confiança que favoreça o diálogo, a expressão de necessidades e o alinhamento da interação.',
    descritores: [
      {
        codigo: 'P1',
        nome: 'Abertura contextualizada',
        descricao:
          'Inicia a interação com respeito ao contexto, à disponibilidade e ao momento do cliente.',
        niveis: {
          n1: 'Inicia com apresentação ou pressão comercial, ignorando sinais de indisponibilidade e o contexto do cliente.',
          n2: 'Cumprimenta e tenta criar proximidade, mas usa uma abertura genérica, prolongada ou pouco pertinente.',
          n3: 'Inicia com cordialidade, verifica a disponibilidade e conecta a abertura a um aspecto relevante do contexto do cliente.',
          n4: 'Percebe mudanças no contexto ou no estado da conversa e reorganiza a abertura com naturalidade, respeitando o tempo e a disposição do cliente.',
        },
      },
      {
        codigo: 'P2',
        nome: 'Alinhamento de agenda e expectativas',
        descricao: 'Combina propósito, prioridades e uso do tempo com o cliente.',
        niveis: {
          n1: 'Impõe uma sequência de assuntos sem esclarecer o propósito ou consultar as prioridades do cliente.',
          n2: 'Apresenta uma agenda, mas não confirma prioridades, tempo disponível ou concordância do cliente.',
          n3: 'Combina propósito, prioridades e tempo disponível, confirma a concordância e ajusta a agenda quando necessário.',
          n4: 'Concilia expectativas distintas entre participantes e renegocia a agenda diante de novas informações, preservando os assuntos decisivos.',
        },
      },
      {
        codigo: 'P3',
        nome: 'Escuta ativa',
        descricao: 'Acompanha a fala do cliente e utiliza o que ouviu para conduzir a interação.',
        niveis: {
          n1: 'Interrompe, ignora respostas ou retorna ao roteiro sem considerar o que o cliente trouxe.',
          n2: 'Permite a fala, mas responde de forma genérica ou repete perguntas já respondidas.',
          n3: 'Escuta sem interrupções indevidas, retoma pontos relevantes e verifica o entendimento antes de responder ou avançar.',
          n4: 'Percebe ambiguidades ou mudanças de posição, pede esclarecimento sem pressupor motivos e integra as correções à condução da conversa.',
        },
      },
      {
        codigo: 'P4',
        nome: 'Adaptação da comunicação',
        descricao:
          'Ajusta linguagem, ritmo e detalhamento às necessidades observadas na interação.',
        niveis: {
          n1: 'Mantém linguagem, ritmo ou detalhamento que dificultam a compreensão, mesmo diante de sinais de inadequação.',
          n2: 'Ajusta alguns termos ou o ritmo, mas alterna entre excesso e falta de informação.',
          n3: 'Usa linguagem acessível e ajusta ritmo e detalhes ao conhecimento e às preferências que o cliente demonstra ou informa.',
          n4: 'Atende necessidades de comunicação distintas entre interlocutores e muda a forma de explicar quando percebe que a compreensão ainda não ocorreu.',
        },
      },
      {
        codigo: 'P5',
        nome: 'Empatia e acolhimento',
        descricao:
          'Reconhece preocupações e reações do cliente com respeito e sem minimizar sua experiência.',
        niveis: {
          n1: 'Minimiza preocupações, reage de forma defensiva ou desqualifica a experiência do cliente.',
          n2: 'Demonstra cordialidade, mas acolhe de forma genérica e passa à solução antes de compreender a preocupação.',
          n3: 'Reconhece a preocupação concreta e seu impacto, permite esclarecimentos e mantém uma postura respeitosa diante de críticas.',
          n4: 'Sustenta o acolhimento em situações de tensão, esclarece divergências e combina uma forma de prosseguir sem promessas ou concessões indevidas.',
        },
      },
      {
        codigo: 'P6',
        nome: 'Construção de confiança',
        descricao:
          'Comunica suas intenções com honestidade e permite que o cliente questione, discorde e estabeleça limites.',
        niveis: {
          n1: 'Exagera sua capacidade de ajudar, força intimidade ou desencoraja dúvidas e discordâncias.',
          n2: 'Declara disposição para ajudar, mas reage com justificativas ou pressão quando o cliente questiona a abordagem.',
          n3: 'Explica sua intenção, reconhece o que ainda não sabe e acolhe dúvidas, discordâncias e limites do cliente.',
          n4: 'Identifica e corrige ambiguidades ou erros de sua própria comunicação e explicita conflitos de interesse relevantes para a decisão do cliente.',
        },
      },
    ],
  },
  {
    codigo: 'A',
    nome: 'Analisar',
    descricao:
      'Investigar e validar a situação do cliente, suas necessidades, causas, impactos e prioridades para orientar uma solução pertinente.',
    descritores: [
      {
        codigo: 'A1',
        nome: 'Situação atual e objetivos',
        descricao: 'Compreende como o cliente atua hoje e quais resultados deseja alcançar.',
        niveis: {
          n1: 'Recomenda uma solução sem investigar como o cliente atua ou o que deseja alcançar.',
          n2: 'Levanta informações básicas, mas deixa pouco clara a diferença entre a situação atual e a desejada.',
          n3: 'Explora o funcionamento atual, os objetivos e as dificuldades relevantes, identificando o que o cliente pretende mudar.',
          n4: 'Relaciona objetivos de diferentes envolvidos e identifica divergências entre a demanda inicial e os resultados pretendidos, validando-as com o cliente.',
        },
      },
      {
        codigo: 'A2',
        nome: 'Aprofundamento de causas',
        descricao: 'Investiga o que origina ou mantém as dificuldades relatadas.',
        niveis: {
          n1: 'Assume a primeira queixa como causa e direciona a conversa para seu produto.',
          n2: 'Faz perguntas adicionais, mas permanece na descrição dos sintomas ou aceita explicações sem aprofundamento.',
          n3: 'Investiga exemplos, frequência e condições do problema, distingue sintomas de possíveis causas e verifica sua interpretação.',
          n4: 'Confronta explicações alternativas com exemplos e dados disponíveis e identifica como causas se relacionam ou dependem de fatores fora da solução ofertada.',
        },
      },
      {
        codigo: 'A3',
        nome: 'Análise de impactos',
        descricao: 'Explora as consequências do problema e sua relevância para o cliente.',
        niveis: {
          n1: 'Ignora as consequências do problema ou atribui impactos sem confirmação do cliente.',
          n2: 'Pergunta sobre consequências, mas fica em afirmações genéricas, como perda de tempo ou aumento de custos.',
          n3: 'Explora consequências operacionais, financeiras ou relacionais pertinentes e dimensiona sua relevância com dados ou exemplos confirmados pelo cliente.',
          n4: 'Relaciona efeitos imediatos e futuros, explicita incertezas e ajuda o cliente a comparar as consequências de agir, adiar ou manter a situação.',
        },
      },
      {
        codigo: 'A4',
        nome: 'Necessidades latentes',
        descricao:
          'Investiga necessidades relevantes que ainda não foram explicitadas pelo cliente.',
        niveis: {
          n1: 'Limita-se ao pedido inicial ou induz uma necessidade que favorece sua oferta sem verificar sua relevância.',
          n2: 'Sugere outras necessidades, mas pouco investiga sua relação com o contexto do cliente.',
          n3: 'Usa informações da conversa para explorar necessidades ainda não expressas e confirma sua existência e relevância sem forçar concordância.',
          n4: 'Conecta informações de processos ou envolvidos distintos, identifica necessidades que afetam o resultado pretendido e testa hipóteses antes de incorporá-las ao diagnóstico.',
        },
      },
      {
        codigo: 'A5',
        nome: 'Prioridades e critérios de decisão',
        descricao: 'Identifica o que orienta a escolha e o avanço da decisão do cliente.',
        niveis: {
          n1: 'Assume que preço ou sua preferência de solução orientam a decisão, sem verificar o que importa ao cliente.',
          n2: 'Identifica necessidades e algumas restrições, mas não esclarece sua prioridade ou os critérios para decidir.',
          n3: 'Confirma prioridades, critérios de escolha, restrições e participantes da decisão, na profundidade necessária ao caso.',
          n4: 'Explora conflitos entre critérios e envolvidos e verifica com o cliente quais concessões, dependências ou mudanças podem alterar a prioridade.',
        },
      },
      {
        codigo: 'A6',
        nome: 'Validação do diagnóstico',
        descricao:
          'Confirma com o cliente a compreensão das necessidades e das prioridades antes de orientar a solução.',
        niveis: {
          n1: 'Apresenta sua interpretação como fato e avança para a proposta sem permitir correções.',
          n2: 'Resume parte do que ouviu e obtém uma concordância genérica, deixando prioridades ou dúvidas relevantes abertas.',
          n3: 'Sintetiza necessidades, causas e impactos relevantes, confirma prioridades e corrige sua compreensão a partir do retorno do cliente.',
          n4: 'Explicita divergências e lacunas ainda abertas, verifica o que pode mudar a solução e combina como esclarecer pontos decisivos antes de recomendar.',
        },
      },
    ],
  },
  {
    codigo: 'C',
    nome: 'Co-criar',
    descricao:
      'Construir e validar com o cliente uma solução viável, alinhada ao diagnóstico e capaz de gerar valor relevante para suas prioridades.',
    descritores: [
      {
        codigo: 'C1',
        nome: 'Alinhamento entre necessidade e solução',
        descricao: 'Relaciona os componentes da proposta às necessidades e prioridades validadas.',
        niveis: {
          n1: 'Apresenta uma oferta genérica ou desconectada das necessidades identificadas.',
          n2: 'Relaciona parte da oferta a uma necessidade, mas não esclarece como atende às prioridades do cliente.',
          n3: 'Explica como os componentes relevantes da solução atendem às prioridades validadas e reconhece as necessidades que permanecem sem cobertura.',
          n4: 'Integra necessidades de diferentes envolvidos e ajusta o escopo para preservar os resultados prioritários, explicitando efeitos das escolhas e lacunas remanescentes.',
        },
      },
      {
        codigo: 'C2',
        nome: 'Participação do cliente',
        descricao: 'Envolve o cliente nas escolhas que definem a solução.',
        niveis: {
          n1: 'Apresenta a solução como pronta e ignora sugestões ou ressalvas do cliente.',
          n2: 'Pede opinião, mas faz poucas escolhas com o cliente ou não incorpora seu retorno.',
          n3: 'Solicita contribuições sobre escolhas relevantes, incorpora sugestões viáveis e explica quando uma solicitação não pode ser atendida.',
          n4: 'Facilita a construção conjunta diante de preferências divergentes, torna as consequências das escolhas compreensíveis e confirma a posição dos envolvidos pertinentes.',
        },
      },
      {
        codigo: 'C3',
        nome: 'Construção de alternativas',
        descricao:
          'Compara e ajusta alternativas a partir do retorno do cliente e dos objetivos pretendidos.',
        niveis: {
          n1: 'Insiste na mesma proposta apesar de sinais de inadequação ou oferece concessões sem relação com a necessidade.',
          n2: 'Faz ajustes pontuais, mas pouco compara os benefícios e as limitações das opções.',
          n3: 'Apresenta e compara alternativas viáveis quando necessário, ajustando a proposta ao retorno do cliente e às prioridades acordadas.',
          n4: 'Combina alternativas ou etapas de implementação para resolver restrições concorrentes e verifica com o cliente o que se ganha e se perde em cada caminho.',
        },
      },
      {
        codigo: 'C4',
        nome: 'Viabilidade da solução',
        descricao: 'Considera recursos, prazos, orçamento e condições necessárias à implementação.',
        niveis: {
          n1: 'Propõe condições incompatíveis com orçamento, prazo, recursos ou capacidade de entrega conhecidos.',
          n2: 'Considera parte das restrições, mas deixa dependências relevantes sem esclarecimento.',
          n3: 'Verifica orçamento, prazo, recursos e responsabilidades pertinentes e explicita as condições necessárias para implementar a solução.',
          n4: 'Antecipa dependências e riscos de implementação, envolve responsáveis quando necessário e constrói contingências ou etapas para preservar os resultados prioritários.',
        },
      },
      {
        codigo: 'C5',
        nome: 'Demonstração de valor',
        descricao:
          'Traduz características em benefícios e impactos com base no contexto do cliente.',
        niveis: {
          n1: 'Lista características ou promete resultados sem relacioná-los ao contexto e às condições do cliente.',
          n2: 'Aponta benefícios pertinentes, mas demonstra seu impacto de forma genérica ou com premissas pouco claras.',
          n3: 'Relaciona características, benefícios e impactos; usa dados, exemplos ou estimativas pertinentes e valida com o cliente as premissas relevantes.',
          n4: 'Compara o valor das alternativas, considera custos e condições de adoção e mostra como mudanças nas premissas podem alterar o resultado esperado.',
        },
      },
      {
        codigo: 'C6',
        nome: 'Validação da solução',
        descricao:
          'Confirma a adequação da solução, suas condições e os critérios para reconhecer seu sucesso.',
        niveis: {
          n1: 'Trata a apresentação ou o silêncio do cliente como aceitação da solução.',
          n2: 'Pergunta se a proposta faz sentido, mas deixa dúvidas relevantes sobre escopo, condições ou resultados esperados.',
          n3: 'Confirma escopo, adequação e condições com o cliente e combina critérios observáveis para verificar os resultados pretendidos.',
          n4: 'Testa a solução diante de situações críticas relevantes, esclarece divergências entre envolvidos e ajusta escopo ou critérios de sucesso antes do compromisso.',
        },
      },
    ],
  },
  {
    codigo: 'E',
    nome: 'Engajar',
    descricao:
      'Apoiar uma decisão informada, tratar preocupações com transparência e conduzir os compromissos e o acompanhamento necessários aos resultados acordados.',
    descritores: [
      {
        codigo: 'E1',
        nome: 'Clareza de condições e limites',
        descricao:
          'Explica custos, prazos, escopo, responsabilidades e limitações relevantes para a decisão.',
        niveis: {
          n1: 'Omite condições relevantes, faz promessas indevidas ou apresenta possibilidades como garantias.',
          n2: 'Comunica as condições principais, mas deixa ambiguidades sobre custos, prazos, escopo ou responsabilidades.',
          n3: 'Explica as condições e limitações pertinentes, distingue compromissos de estimativas e confirma o entendimento do cliente.',
          n4: 'Antecipa interpretações que podem gerar expectativas indevidas e esclarece dependências e consequências de mudanças antes que afetem a decisão.',
        },
      },
      {
        codigo: 'E2',
        nome: 'Tratamento de objeções',
        descricao:
          'Esclarece preocupações, responde com informações pertinentes e verifica se a questão foi resolvida.',
        niveis: {
          n1: 'Ignora, confronta ou responde à objeção sem compreender a preocupação do cliente.',
          n2: 'Acolhe a objeção, mas usa uma resposta padronizada ou não verifica se esclareceu a questão.',
          n3: 'Investiga a preocupação, reconhece sua relevância, responde com informações ou alternativas pertinentes e confirma o que foi resolvido.',
          n4: 'Distingue objeções aparentes de barreiras decisivas, relaciona preocupações entre envolvidos e verifica se a resposta exige rever a solução ou o compromisso.',
        },
      },
      {
        codigo: 'E3',
        nome: 'Decisão e próximos passos',
        descricao:
          'Apoia a decisão do cliente e combina uma continuidade concreta quando houver concordância.',
        niveis: {
          n1: 'Pressiona por uma decisão ou encerra a interação sem esclarecer a posição do cliente e a continuidade pertinente.',
          n2: 'Propõe continuidade, mas deixa indefinidos o aceite, a ação, o responsável ou o prazo necessário.',
          n3: 'Verifica a decisão e combina ação, responsável e prazo quando houver avanço; diante de recusa ou adiamento, esclarece a pendência e respeita a posição do cliente.',
          n4: 'Coordena próximos passos que dependem de diferentes envolvidos e explicita condições para avançar, revisar ou encerrar a oportunidade sem manter compromissos artificiais.',
        },
      },
      {
        codigo: 'E4',
        nome: 'Registro e coordenação de acordos',
        descricao: 'Registra os compromissos e alinha o que deve ser realizado pelos envolvidos.',
        niveis: {
          n1: 'Mantém versões contraditórias dos acordos ou deixa compromissos assumidos sem registro e encaminhamento.',
          n2: 'Registra parte do combinado, mas deixa alterações, responsabilidades ou destinatários relevantes indefinidos.',
          n3: 'Registra escopo, condições e compromissos, confirma o combinado com o cliente e encaminha aos responsáveis pertinentes.',
          n4: 'Resolve divergências entre proposta, negociação e entrega, coordena dependências e mantém as alterações alinhadas entre os envolvidos antes de sua execução.',
        },
      },
      {
        codigo: 'E5',
        nome: 'Acompanhamento da implementação',
        descricao:
          'Acompanha compromissos, comunica desvios e articula encaminhamentos dentro de sua responsabilidade.',
        niveis: {
          n1: 'Deixa de acompanhar compromissos sob sua responsabilidade ou omite desvios conhecidos que afetam o cliente.',
          n2: 'Faz contatos pontuais, mas pouco verifica a execução dos acordos ou o encaminhamento dos problemas.',
          n3: 'Acompanha os marcos combinados, comunica desvios e articula soluções ou encaminhamentos, mantendo o cliente informado até a resolução pertinente.',
          n4: 'Identifica sinais de risco antes do descumprimento, coordena alternativas entre responsáveis e revê o plano com o cliente para reduzir impactos nos resultados.',
        },
      },
      {
        codigo: 'E6',
        nome: 'Verificação de resultados e continuidade',
        descricao:
          'Revisa resultados com o cliente e orienta ajustes e oportunidades pertinentes à evolução de suas necessidades.',
        niveis: {
          n1: 'Não verifica os resultados quando previsto ou retoma o contato apenas para oferecer outra venda.',
          n2: 'Consulta a satisfação de forma genérica, sem relacioná-la aos resultados acordados ou orientar ajustes.',
          n3: 'Revisa resultados pelos critérios combinados, coleta feedback e encaminha ajustes; explora novas necessidades quando forem pertinentes ao cliente.',
          n4: 'Analisa diferenças entre resultados esperados e obtidos, verifica causas com os envolvidos e transforma aprendizados em melhorias e oportunidades sustentadas por evidências.',
        },
      },
    ],
  },
];
