import { BEHAVIORAL_REPORT_SCHEMA_VERSION } from '../behavioral-report-schema';
import { computeDiscCompetenciesNatural } from '../disc-competencias';

type DemoBehavioralInput = {
  nome_completo?: string | null;
  perfil_dominante?: string | null;
  d_natural?: number | null;
  i_natural?: number | null;
  s_natural?: number | null;
  c_natural?: number | null;
};

type Quadrant = 'D' | 'I' | 'S' | 'C';

const QUADRANT_COPY: Record<Quadrant, {
  highTitle: string;
  lowTitle: string;
  high: string;
  low: string;
}> = {
  D: {
    highTitle: 'Direcionador',
    lowTitle: 'Conciliador',
    high: 'encara desafios com objetividade, assume a dianteira e tende a acelerar decisões quando enxerga um caminho viável',
    low: 'prefere construir acordos e avaliar impactos antes de entrar em confronto ou assumir uma decisão de forma unilateral',
  },
  I: {
    highTitle: 'Mobilizador',
    lowTitle: 'Observador',
    high: 'se conecta com facilidade, comunica ideias com energia e costuma influenciar o ambiente pela presença relacional',
    low: 'constrói confiança gradualmente e tende a convencer mais pela consistência do argumento do que pela exposição pessoal',
  },
  S: {
    highTitle: 'Estabilizador',
    lowTitle: 'Acelerador',
    high: 'sustenta ritmos consistentes, preserva vínculos e oferece previsibilidade mesmo quando o contexto muda',
    low: 'responde bem a mudanças de ritmo e prefere ciclos mais dinâmicos, com variedade e decisões frequentes',
  },
  C: {
    highTitle: 'Analista',
    lowTitle: 'Pragmático',
    high: 'valoriza precisão, critérios claros e qualidade, examinando detalhes antes de validar uma entrega ou decisão',
    low: 'privilegia aplicabilidade e velocidade, usando regras como referência sem deixar que o excesso de detalhe paralise a execução',
  },
};

const STRENGTH_COPY: Record<string, string> = {
  Ousadia: 'Entra em situações novas com disposição para testar caminhos e aprender rapidamente com a prática.',
  Comando: 'Assume direção quando o grupo precisa de clareza, decisão e responsabilidade visível.',
  Objetividade: 'Transforma discussões amplas em prioridades concretas e próximos passos compreensíveis.',
  Assertividade: 'Expõe posições com firmeza e reduz ambiguidades em conversas importantes.',
  Persuasão: 'Conecta argumentos às motivações das pessoas e amplia a adesão às propostas.',
  Extroversão: 'Cria contato com facilidade e mantém presença ativa em ambientes coletivos.',
  Entusiasmo: 'Transmite energia e torna oportunidades e ideias mais mobilizadoras para o grupo.',
  Sociabilidade: 'Constrói pontes entre pessoas e favorece a circulação de informação na equipe.',
  Empatia: 'Percebe necessidades e reações alheias, ajustando a interação sem perder o objetivo.',
  Paciência: 'Sustenta processos longos e relações profissionais com constância e equilíbrio.',
  Persistência: 'Mantém esforço diante de obstáculos e procura alternativas antes de abandonar uma meta.',
  Planejamento: 'Antecipa etapas, dependências e riscos antes que eles comprometam a execução.',
  Organização: 'Dá estrutura ao trabalho e torna prioridades, prazos e responsabilidades mais visíveis.',
  Detalhismo: 'Identifica inconsistências que poderiam comprometer a qualidade da entrega.',
  Prudência: 'Avalia consequências e riscos antes de assumir compromissos relevantes.',
  Concentração: 'Mantém profundidade e continuidade em tarefas que exigem atenção sustentada.',
};

const DEVELOPMENT_COPY: Record<string, string> = {
  Ousadia: 'Experimentar decisões de baixo risco com menos informação pode ampliar agilidade e repertório.',
  Comando: 'Assumir uma posição mais diretiva em momentos críticos pode aumentar clareza e confiança do time.',
  Objetividade: 'Resumir a mensagem em prioridade, motivo e próximo passo ajuda a acelerar alinhamentos.',
  Assertividade: 'Nomear limites e expectativas com mais clareza reduz retrabalho e acordos implícitos.',
  Persuasão: 'Traduzir argumentos para o interesse do interlocutor pode aumentar adesão às boas ideias.',
  Extroversão: 'Participar mais cedo das conversas amplia visibilidade e acesso a informações importantes.',
  Entusiasmo: 'Tornar o próprio envolvimento mais perceptível pode fortalecer mobilização e reconhecimento.',
  Sociabilidade: 'Investir em conexões fora das demandas imediatas amplia cooperação e influência informal.',
  Empatia: 'Checar como a mensagem foi recebida ajuda a equilibrar resultado e qualidade da relação.',
  Paciência: 'Criar pausas deliberadas antes de reagir favorece decisões mais consistentes sob pressão.',
  Persistência: 'Definir critérios de continuidade evita abandonar cedo demais iniciativas relevantes.',
  Planejamento: 'Antecipar marcos e riscos reduz improviso sem transformar o plano em rigidez.',
  Organização: 'Externalizar prioridades em uma rotina simples diminui dispersão e sobrecarga.',
  Detalhismo: 'Distinguir o detalhe crítico do detalhe desejável preserva qualidade sem atrasar a entrega.',
  Prudência: 'Testar hipóteses em pequena escala ajuda a avançar sem exigir certeza total.',
  Concentração: 'Proteger blocos de foco e limitar trocas de contexto aumenta consistência da execução.',
};

function score(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

/**
 * Relatório narrativo determinístico da sala de demonstração.
 *
 * O tenant fake não pode depender de uma chamada de IA durante uma apresentação.
 * Os números continuam sendo os DISC reais da persona; apenas a narrativa é
 * congelada e construída localmente, com o schema canônico do relatório.
 */
export function buildAcmeDemoBehavioralReport(input: DemoBehavioralInput) {
  const nome = String(input.nome_completo || 'Profissional').trim();
  const primeiroNome = nome.split(/\s+/)[0] || nome;
  const disc = {
    D: score(input.d_natural),
    I: score(input.i_natural),
    S: score(input.s_natural),
    C: score(input.c_natural),
  };
  const perfil = String(input.perfil_dominante || '')
    .toUpperCase()
    .replace(/[^DISC]/g, '') || (Object.entries(disc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'S');
  const dominantes = [...new Set(perfil.split(''))].slice(0, 2) as Quadrant[];
  const competencias = computeDiscCompetenciesNatural(disc);
  const ordenadas = Object.entries(competencias).sort((a, b) => b[1] - a[1]);
  const forcas = ordenadas.slice(0, 5).map(([competencia]) => ({
    competencia,
    frase: STRENGTH_COPY[competencia] || `${primeiroNome} demonstra consistência em ${competencia.toLowerCase()}.`,
  }));
  const desenvolver = [...ordenadas].reverse().slice(0, 5).map(([competencia]) => ({
    competencia,
    frase: DEVELOPMENT_COPY[competencia] || `Praticar ${competencia.toLowerCase()} de forma deliberada amplia a versatilidade profissional.`,
  }));

  const quadrante = (key: Quadrant) => {
    const copy = QUADRANT_COPY[key];
    const high = disc[key] >= 55;
    return {
      titulo_traco: high ? copy.highTitle : copy.lowTitle,
      descricao: `${primeiroNome} ${high ? copy.high : copy.low}. Esse traço aparece com intensidade ${disc[key]} no perfil natural e deve ser lido em conjunto com os demais fatores.`,
    };
  };

  const assinatura = dominantes.map((key) => QUADRANT_COPY[key].highTitle.toLowerCase()).join(' e ');
  const liderancaPorFator: Record<Quadrant, string> = {
    D: 'Executivo',
    I: 'Motivador',
    S: 'Metódico',
    C: 'Sistemático',
  };
  const estiloLideranca = dominantes.map((key) => liderancaPorFator[key]).join(' e ');

  return {
    _schema_version: BEHAVIORAL_REPORT_SCHEMA_VERSION,
    sintese_perfil: `${primeiroNome} apresenta um perfil ${perfil}, com combinação ${assinatura}. No trabalho, tende a buscar resultados de um jeito coerente com essa assinatura: usa seus fatores dominantes como fonte de energia e recorre aos demais para adaptar ritmo, comunicação e nível de detalhe. O valor do perfil está no equilíbrio — aproveitar o que surge naturalmente sem transformar preferência em rigidez.`,
    modo_de_trabalho: `${primeiroNome} rende melhor quando entende o resultado esperado, o espaço de decisão e o ritmo da entrega. A combinação ${perfil} favorece contextos em que suas forças principais podem aparecer com clareza, ao mesmo tempo em que acordos objetivos ajudam a compensar os fatores menos naturais.`,
    relacoes_e_comunicacao: `Nas relações profissionais, ${primeiroNome} tende a combinar ${dominantes.map((key) => QUADRANT_COPY[key].highTitle.toLowerCase()).join(' com ')}. Para ampliar impacto, vale ajustar a quantidade de contexto, a velocidade e o grau de objetividade de acordo com quem está do outro lado.`,
    frases_chave: [
      `Perfil ${perfil}: preferência não é limite.`,
      'Clareza sobre o resultado libera adaptação no caminho.',
      'Forças naturais ganham valor quando são usadas de forma consciente.',
      'Versatilidade é escolher o comportamento que a situação pede.',
    ],
    quadrante_D: quadrante('D'),
    quadrante_I: quadrante('I'),
    quadrante_S: quadrante('S'),
    quadrante_C: quadrante('C'),
    top5_forcas: forcas,
    top5_desenvolver: desenvolver,
    lideranca_sintese: `O estilo de liderança mais provável de ${primeiroNome} combina os padrões ${estiloLideranca}. Isso indica como tende a organizar decisões, mobilizar pessoas e acompanhar entregas — mesmo sem ocupar uma posição formal de liderança.`,
    lideranca_trabalhar: `O principal exercício de desenvolvimento é variar o estilo conforme a necessidade da equipe: direcionar quando falta clareza, envolver quando falta adesão, dar ritmo quando há instabilidade e estruturar quando a qualidade está em risco.`,
    pontos_desenvolver_pressao: [
      'Pode intensificar os próprios fatores dominantes e reduzir a escuta de sinais que pedem outra abordagem.',
      'Tende a recorrer ao comportamento mais confortável mesmo quando a situação exige mudança de ritmo.',
      'Pode interpretar preferências diferentes como falta de compromisso, quando na verdade são estilos distintos de execução.',
      'Sob sobrecarga, a comunicação pode ficar menos clara sobre prioridade, limite e expectativa.',
      'Decisões importantes ganham qualidade quando há uma pausa breve para checar impacto e alternativas.',
      'Pedir feedback objetivo ajuda a separar intenção percebida de efeito real sobre as pessoas.',
    ],
  };
}
