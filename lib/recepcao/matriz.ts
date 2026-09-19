/** Matriz Vertho de Atendimento. As rubricas são congeladas em cada cenário publicado. */
import { dominioAtendimento } from './dominio';
export const MATRIZ_ATENDIMENTO_VERSION = 'atendimento-5x6-1';
export type DescritorAtendimento = {
  codigo: string;
  nome: string;
  descricao: string;
  niveis: { n1: string; n2: string; n3: string; n4: string };
};
export type CompetenciaAtendimento = {
  codigo: string;
  nome: string;
  descricao: string;
  descritores: DescritorAtendimento[];
};
const d = (
  codigo: string,
  nome: string,
  descricao: string,
  n1: string,
  n2: string,
  n3: string,
  n4: string,
): DescritorAtendimento => ({
  codigo,
  nome,
  descricao,
  niveis: { n1, n2, n3, n4 },
});

// Marcador trocado pelo termo do segmento em `competenciasAtendimento`.
const ORIENTACAO_INDEVIDA = '{orientacaoIndevida}';
const COMPETENCIAS_BASE: CompetenciaAtendimento[] = [
  {
    codigo: 'acolhimento',
    nome: 'Acolhimento e condução sob pressão',
    descricao:
      'Reconhece a experiência da pessoa e sustenta uma relação respeitosa, inclusive diante de objeções e pressão.',
    descritores: [
      d(
        'aco1',
        'Reconhecimento da situação',
        'Reconhece a situação e o impacto relatado pela pessoa.',
        'Ignora, minimiza ou contesta o impacto relatado antes de compreender a situação.',
        'Demonstra cordialidade, mas reconhece o problema de forma genérica.',
        'Nomeia a situação e o impacto relatado, sem supor sentimentos ou prometer uma solução.',
        'Além de reconhecer situação e impacto, ajusta sua resposta quando a pessoa esclarece outra preocupação, sem perder o foco do atendimento.',
      ),
      d(
        'aco2',
        'Respeito na interação',
        'Mantém tratamento respeitoso sem julgamento ou culpabilização.',
        'Culpa, constrange, ironiza ou desqualifica a pessoa.',
        'Mantém cordialidade, mas usa expressões defensivas ou impessoais que dificultam o diálogo.',
        'Trata a pessoa com respeito e linguagem adequada, mesmo quando precisa discordar.',
        'Sustenta o respeito diante de contestação e reformula uma fala que gerou desconforto, sem atribuir culpa à pessoa.',
      ),
      d(
        'aco3',
        'Resposta à objeção',
        'Responde ao conteúdo concreto da insatisfação ou objeção apresentada.',
        'Ignora a objeção ou repete tranquilizações sem tratar o problema apresentado.',
        'Reconhece a objeção, mas oferece explicação genérica ou pouco relacionada à preocupação.',
        'Responde à objeção concreta com informação pertinente e verifica o ponto que ainda precisa ser esclarecido.',
        'Distingue a objeção inicial da preocupação subjacente e adapta a resposta a ambas, sem reabrir pontos já compreendidos.',
      ),
      d(
        'aco4',
        'Firmeza diante de pressão',
        'Sustenta os limites autorizados sem confronto ou submissão.',
        'Confronta a pessoa ou cede a uma exigência não autorizada.',
        'Mantém o respeito, mas comunica o limite de forma ambígua ou hesitante.',
        'Comunica o limite de forma clara e respeitosa e apresenta a alternativa autorizada quando existe.',
        'Sustenta o limite mesmo após nova pressão, sem personalizar o conflito nem sugerir exceções inexistentes.',
      ),
      d(
        'aco5',
        'Adaptação da abordagem',
        'Ajusta a forma de conversar aos sinais e necessidades expressos pela pessoa.',
        'Mantém uma abordagem incompatível com a dúvida, urgência ou dificuldade expressa.',
        'Percebe a necessidade de ajuste, mas muda apenas o tom ou repete a mesma explicação.',
        'Ajusta linguagem, ritmo ou sequência das informações à necessidade expressa, preservando a precisão.',
        'Verifica o efeito do ajuste e muda a abordagem novamente quando necessário, sem infantilizar nem fazer suposições sobre a pessoa.',
      ),
      d(
        'aco6',
        'Condução da insistência',
        'Conduz a insistência ou a recusa conforme os limites do atendimento.',
        'Prolonga o confronto, pressiona por aceitação ou abandona a conversa de forma hostil.',
        'Reconhece a recusa, mas repete propostas rejeitadas ou deixa a continuidade indefinida.',
        'Respeita a recusa e indica a continuidade, o escalonamento ou o encerramento previsto para o caso.',
        'Diante de insistência após esclarecimento, encerra ou encaminha com firmeza e respeito, deixando explícita a via legítima de retorno.',
      ),
    ],
  },
  {
    codigo: 'compreensao',
    nome: 'Compreensão da demanda',
    descricao:
      'Investiga o pedido, confirma as restrições relevantes e constrói uma compreensão compartilhada antes de propor.',
    descritores: [
      d(
        'com1',
        'Identificação do pedido',
        'Identifica o motivo do contato e o resultado buscado.',
        'Responde a outro problema ou impõe uma interpretação sem verificar o pedido.',
        'Identifica o tema geral, mas não esclarece o que a pessoa deseja resolver.',
        'Identifica o pedido e confirma o resultado esperado quando houver ambiguidade.',
        'Distingue pedidos simultâneos e confirma qual deve ser tratado primeiro, sem perder os demais.',
      ),
      d(
        'com2',
        'Perguntas pertinentes',
        'Faz perguntas que acrescentam informação útil à decisão.',
        'Propõe sem investigar uma informação necessária ou faz perguntas invasivas e irrelevantes.',
        'Pergunta sobre o caso, mas deixa lacunas relevantes ou repete informações já fornecidas.',
        'Faz perguntas objetivas e pertinentes para preencher as lacunas necessárias ao atendimento.',
        'Escolhe a próxima pergunta a partir da resposta recebida e reduz perguntas desnecessárias sem perder informação decisiva.',
      ),
      d(
        'com3',
        'Escuta e uso das respostas',
        'Incorpora na condução as informações fornecidas pela pessoa.',
        'Desconsidera respostas e propõe opções incompatíveis com o que foi informado.',
        'Reconhece parte das informações, mas não as utiliza de forma consistente.',
        'Usa as respostas para orientar a próxima pergunta ou proposta, sem exigir repetição desnecessária.',
        'Relaciona informações dadas em momentos diferentes e ajusta a condução quando surge uma contradição ou mudança.',
      ),
      d(
        'com4',
        'Restrições e prioridades',
        'Identifica condições que tornam uma alternativa viável ou inviável.',
        'Ignora restrições expressas de horário, prazo, canal ou outra condição pertinente.',
        'Identifica uma restrição, mas deixa de verificar outra condição necessária à escolha.',
        'Confirma as restrições relevantes antes de oferecer ou confirmar uma alternativa.',
        'Distingue restrições indispensáveis de preferências negociáveis e usa essa diferença para explorar alternativas autorizadas.',
      ),
      d(
        'com5',
        'Pedido e necessidade',
        'Distingue a solução solicitada da necessidade que a pessoa busca atender.',
        'Aceita ou nega o pedido sem compreender sua finalidade quando isso impede o atendimento.',
        'Percebe que há uma necessidade por trás do pedido, mas presume qual seja.',
        'Esclarece a finalidade do pedido quando necessário e confirma a necessidade sem impor uma interpretação.',
        'Identifica uma alternativa autorizada que atende à necessidade mesmo quando o pedido inicial é inviável, e verifica sua pertinência com a pessoa.',
      ),
      d(
        'com6',
        'Síntese e confirmação',
        'Confirma uma compreensão compartilhada da demanda.',
        'Avança com entendimento incorreto ou ignora uma correção feita pela pessoa.',
        'Resume de forma genérica, omitindo uma condição importante ou sem abrir espaço para correção.',
        'Retoma o pedido e as condições essenciais e permite confirmar ou corrigir o entendimento.',
        'Diante de informações novas, revisa a síntese e torna explícito o que muda na proposta ou no encaminhamento.',
      ),
    ],
  },
  {
    codigo: 'clareza',
    nome: 'Clareza e precisão',
    descricao:
      'Comunica informações, alternativas e limites de forma compreensível, correta e verificável.',
    descritores: [
      d(
        'cla1',
        'Precisão das informações',
        'Informa apenas o que está confirmado nas fontes e procedimentos do caso.',
        'Inventa ou contradiz horário, cobertura, preço, autorização ou garantia.',
        'Apresenta informação correta, mas incompleta a ponto de dificultar a decisão.',
        'Informa corretamente os dados necessários à decisão, conforme a ficha do caso.',
        'Além de informar com precisão, identifica e esclarece uma possível interpretação equivocada antes que produza um compromisso incorreto.',
      ),
      d(
        'cla2',
        'Linguagem compreensível',
        'Explica com vocabulário acessível ao interlocutor.',
        'Usa linguagem confusa, siglas ou termos que impedem compreender a orientação.',
        'A explicação é parcialmente compreensível, mas depende de esclarecimentos evitáveis.',
        'Usa linguagem direta e compreensível, explicando termos necessários.',
        'Reformula a explicação a partir da dúvida apresentada e confirma o ponto essencial sem apenas repetir as mesmas palavras.',
      ),
      d(
        'cla3',
        'Organização da mensagem',
        'Organiza as informações na sequência necessária à compreensão.',
        'Mistura informações ou responde de forma fragmentada, tornando o próximo passo incompreensível.',
        'Apresenta informações pertinentes, mas com excesso, omissões ou sequência pouco clara.',
        'Organiza a resposta com situação, alternativa e próximo passo, conforme a necessidade do caso.',
        'Prioriza o que decide o caso e separa claramente opções, condições e próximos passos quando há maior complexidade.',
      ),
      d(
        'cla4',
        'Explicação de limites',
        'Explica o que é possível e o que não está autorizado.',
        'Oculta o limite, promete uma exceção ou usa a regra como ameaça.',
        'Informa que existe um limite, mas não esclarece seu alcance ou a alternativa disponível.',
        'Explica o limite pertinente com respeito e distingue o que pode fazer do que depende de outra instância.',
        'Esclarece o motivo previsto na ficha e as consequências práticas de cada alternativa, sem inventar justificativas ou transferir culpa.',
      ),
      d(
        'cla5',
        'Transparência sobre incertezas',
        'Distingue informação confirmada, pendência e compromisso de verificação.',
        'Trata hipótese ou pendência como certeza e promete resultado não confirmado.',
        'Reconhece dúvida, mas deixa ambíguo o que está confirmado e o que precisa verificar.',
        'Separa o confirmado do pendente e comunica a verificação prevista sem antecipar seu resultado.',
        'Explica como a pendência afeta a decisão e combina um caminho autorizado para atualizar a informação, sem transformar prazo de resposta em garantia de solução.',
      ),
      d(
        'cla6',
        'Verificação de compreensão',
        'Verifica a compreensão dos pontos necessários à decisão.',
        'Presume compreensão mesmo diante de dúvida expressa ou interpretação incorreta.',
        'Pergunta genericamente se a pessoa entendeu, sem tratar a dúvida já apresentada.',
        'Esclarece dúvidas e confirma o entendimento do ponto que determina a escolha ou o próximo passo.',
        'Identifica a interpretação equivocada, reformula a informação e verifica se a nova explicação resolveu a dúvida concreta.',
      ),
    ],
  },
  {
    codigo: 'resolucao',
    nome: 'Resolução e encaminhamento',
    descricao:
      'Constrói uma saída autorizada e viável, confirma a decisão e organiza os próximos passos.',
    descritores: [
      d(
        'res1',
        'Alternativas viáveis',
        'Propõe alternativas compatíveis com a demanda e com a ficha.',
        'Propõe uma alternativa indisponível, não autorizada ou incompatível com restrição já informada.',
        'Apresenta uma opção disponível, mas pouco considera a necessidade ou as restrições esclarecidas.',
        'Oferece alternativas autorizadas compatíveis com as informações obtidas.',
        'Compara as alternativas pertinentes e explicita suas condições para apoiar a escolha, sem criar opções inexistentes.',
      ),
      d(
        'res2',
        'Participação na decisão',
        'Preserva a autonomia da pessoa na escolha da saída.',
        'Confirma uma opção sem autorização ou ignora uma recusa expressa.',
        'Solicita uma decisão, mas deixa ambígua a opção aceita ou pressiona por concordância.',
        'Verifica a escolha e respeita a aceitação ou recusa antes de confirmar o encaminhamento.',
        'Quando a pessoa hesita, esclarece a condição que falta para decidir, sem induzir aceitação nem substituir sua escolha.',
      ),
      d(
        'res3',
        'Confirmação do combinado',
        'Explicita os dados essenciais do que foi acordado.',
        'Declara resolvido sem acordo ou confirma dados incompatíveis com a decisão.',
        'Retoma parte do combinado, mas omite um dado necessário à sua execução.',
        'Confirma os dados essenciais da opção aceita, como data, horário, profissional ou serviço, quando aplicáveis.',
        'Reconfirma o combinado após uma mudança e esclarece qual informação anterior deixa de valer, evitando entendimentos conflitantes.',
      ),
      d(
        'res4',
        'Responsável, prazo e canal',
        'Define os próximos passos e os responsáveis previstos.',
        'Deixa a pessoa sem saber quem fará o quê ou promete retorno não autorizado.',
        'Indica uma ação futura, mas omite responsável, prazo ou canal pertinente.',
        'Explica a ação seguinte, o responsável e o prazo ou canal previsto na ficha.',
        'Distingue o que cabe à pessoa e à equipe e esclarece como proceder se a condição prevista para o retorno não se cumprir, quando a ficha oferece esse caminho.',
      ),
      d(
        'res5',
        'Escalonamento adequado',
        'Reconhece quando deve encaminhar à instância autorizada.',
        'Assume decisão fora de sua atribuição ou encaminha sem relação com o problema.',
        'Identifica a necessidade de encaminhar, mas não explica o motivo ou o que será encaminhado.',
        'Encaminha à instância prevista com o motivo pertinente e a autorização exigida pelo procedimento.',
        'Organiza as informações necessárias ao encaminhamento e esclarece o que a outra instância pode avaliar, sem prometer a decisão dela.',
      ),
      d(
        'res6',
        'Encerramento e continuidade',
        'Encerra com clareza sobre o resultado e a forma de retomar.',
        'Encerra deixando uma pendência ignorada ou apresenta recusa como acordo.',
        'Finaliza cordialmente, mas deixa indefinido o resultado ou como dar continuidade.',
        'Retoma o resultado possível e orienta a continuidade prevista, inclusive quando não houve acordo.',
        'Diferencia o que foi resolvido do que permanece pendente e deixa uma via de retomada coerente, sem prolongar uma negociação já encerrada.',
      ),
    ],
  },
  {
    codigo: 'procedimentos',
    nome: 'Procedimentos e proteção de informações',
    descricao:
      'Aplica os procedimentos do caso, respeita sua alçada e protege informações e decisões da pessoa.',
    descritores: [
      d(
        'pro1',
        'Aplicação do procedimento',
        'Segue a sequência administrativa pertinente ao caso.',
        'Contraria uma regra expressa ou cria uma exigência proibida na ficha.',
        'Segue a regra principal, mas acrescenta etapas desnecessárias ou omite uma etapa relevante.',
        'Aplica o procedimento previsto sem criar exigências ou omitir etapas necessárias.',
        'Diante de uma exceção apresentada pela pessoa, identifica o caminho previsto ou explicita a necessidade de orientação autorizada, sem improvisar uma nova regra.',
      ),
      d(
        'pro2',
        'Limites de atuação',
        'Distingue suas atribuições das decisões de outras instâncias.',
        `Oferece ${ORIENTACAO_INDEVIDA} ou toma decisão administrativa fora de sua autorização.`,
        'Reconhece parte do limite, mas sugere que pode garantir uma decisão de outra instância.',
        'Atua dentro da alçada prevista e encaminha decisões que dependem de outra instância.',
        'Explica a divisão de responsabilidades e oferece o caminho autorizado mesmo sob pressão para assumir uma decisão indevida.',
      ),
      d(
        'pro3',
        'Uso mínimo de dados',
        'Solicita apenas informações necessárias ao procedimento.',
        'Pede documentos ou informações que a ficha proíbe ou que não têm finalidade no atendimento.',
        'Pede dados além do necessário, sem relacioná-los ao próximo passo.',
        'Usa os dados já disponíveis e solicita apenas o que o procedimento exige.',
        'Ao receber ou ser solicitada a coletar informação desnecessária, redireciona para o procedimento adequado sem ampliar a coleta.',
      ),
      d(
        'pro4',
        'Proteção de informações',
        'Preserva informações que não podem ser divulgadas no canal.',
        'Divulga ou confirma informação de terceiro sem autorização prevista.',
        'Evita a divulgação principal, mas comunica o limite de forma ambígua ou sugere acesso indevido.',
        'Preserva a informação protegida e explica a via autorizada de acesso quando disponível.',
        'Sustenta a proteção diante de insistência ou alegação de vínculo e orienta a via legítima sem confirmar indiretamente a informação reservada.',
      ),
      d(
        'pro5',
        'Autorizações e consentimento',
        'Obtém as autorizações exigidas antes de executar ou encaminhar.',
        'Executa, cancela ou encaminha contrariando a decisão expressa ou sem a autorização exigida.',
        'Menciona a autorização, mas prossegue sem confirmar claramente o que foi permitido.',
        'Solicita e confirma a autorização exigida para a ação proposta e respeita a decisão.',
        'Quando o escopo da ação muda, esclarece a mudança e reconfirma a autorização necessária, sem estender uma permissão anterior.',
      ),
      d(
        'pro6',
        'Coerência dos compromissos',
        'Assume apenas compromissos compatíveis com as condições e procedimentos disponíveis.',
        'Promete garantia, exceção, cobertura ou resultado que a ficha não autoriza.',
        'Evita uma promessa explícita, mas usa linguagem que pode ser entendida como garantia indevida.',
        'Assume somente compromissos autorizados e distingue providência de resultado.',
        'Identifica e corrige uma expectativa de garantia criada na conversa, reafirmando o compromisso possível e seus limites.',
      ),
    ],
  },
];

/**
 * A matriz nos termos do segmento do caso (`dominio.ts`). Em `recepcao_medica`
 * o texto é idêntico ao publicado até 18/09 ("Oferece orientação clínica...").
 */
export function competenciasAtendimento(dominio?: string): CompetenciaAtendimento[] {
  const termo = dominioAtendimento(dominio).orientacaoIndevida;
  return COMPETENCIAS_BASE.map((c) => ({
    ...c,
    descritores: c.descritores.map((d) => ({
      ...d,
      niveis: {
        n1: d.niveis.n1.replace(ORIENTACAO_INDEVIDA, termo),
        n2: d.niveis.n2.replace(ORIENTACAO_INDEVIDA, termo),
        n3: d.niveis.n3.replace(ORIENTACAO_INDEVIDA, termo),
        n4: d.niveis.n4.replace(ORIENTACAO_INDEVIDA, termo),
      },
    })),
  }));
}
/** A forma histórica (segmento médico), para quem lia a constante. */
export const COMPETENCIAS_ATENDIMENTO: CompetenciaAtendimento[] = competenciasAtendimento('recepcao_medica');
