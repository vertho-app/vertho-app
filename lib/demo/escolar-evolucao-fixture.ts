/**
 * Evolução da Rede de Escolas ACME — a mesma vitrine da ACME Demo, no segmento
 * escolar.
 *
 * A MECÂNICA VIVE EM `evolucao-nucleo`. Aqui fica o que é da escola: quais
 * competências cada cargo tem, quais comportamentos a régua mede e — a parte
 * que mais importa — COMO ESSAS PESSOAS FALAM.
 *
 * ⚠️ A VOZ NÃO É DECORAÇÃO. O relatório de evolução é lido em voz alta numa
 * reunião de coordenação, e a evidência textual é o que sustenta a conversa. Um
 * professor dizendo "negociei a dependência com a outra área" entrega a demo
 * errada, do mesmo jeito que uma diretora falando em "risco comercial" — que é
 * exatamente o motivo de o roster escolar existir. Por isso os textos daqui não
 * herdam nada do elenco comercial.
 *
 * Os comportamentos saem da RÉGUA REAL do segmento (`escolas-descritores.json`,
 * a mesma que o roster usa para semear `competencias`), nunca de uma lista
 * digitada aqui: o casamento entre o relatório e o mapeamento é por NOME, e uma
 * grafia divergente produz um relatório que fala de um comportamento que a
 * pessoa não tem.
 */

import reguaEscolar from '@/lib/demo/escolas-descritores.json';
import {
  competenciaFocoDistribuida,
  construirEvolucao,
  construirFechamento,
  type EvolucaoDemo,
  type PerfilEvolucao,
  type ReguaDeEvolucao,
} from './evolucao-nucleo';

type LinhaDaRegua = { nome_curto: string };
const REGUA = (reguaEscolar as any).descritores as Record<string, LinhaDaRegua[]>;

export const DOCENCIA = 'Professor(a)';
export const COORDENACAO = 'Coordenador(a) Pedagógico(a)';

/** Competências de um cargo, na ordem da régua. */
export function competenciasEscolaresPorCargo(cargo: string): string[] {
  return Object.keys(REGUA)
    .filter((chave) => chave.startsWith(`${cargo}::`))
    .map((chave) => chave.slice(cargo.length + 2));
}

export function descritoresEscolares(cargo: string, competencia: string): string[] {
  return (REGUA[`${cargo}::${competencia}`] || []).map((linha) => linha.nome_curto);
}

/**
 * O que a pessoa conta que mudou, por competência.
 *
 * É por COMPETÊNCIA e não por comportamento porque a régua escolar tem 6
 * comportamentos em cada uma das 10 competências: escrever 60 falas produziria
 * variedade que ninguém lê e um arquivo impossível de revisar. A competência
 * carrega o assunto, e o comportamento entra na frase pelo próprio relatório.
 */
type Falas = { antes: string; depois: string; limite: string };

const FALAS: Record<string, Falas> = {
  // ── Docência ──────────────────────────────────────────────────────────
  'Didática e estratégias de ensino': {
    antes: 'Eu explicava do meu jeito e seguia. Quem não acompanhava naquele momento ficava para trás sem eu perceber.',
    depois: 'Passei a checar o entendimento antes de avançar. Numa aula descobri no meio que metade da turma não tinha entendido a consigna, e refiz ali.',
    limite: 'A explicação melhorou, mas a checagem ainda depende de perguntar "entenderam?" — que é a pergunta que quase ninguém responde com sinceridade.',
  },
  'Planejamento e intencionalidade pedagógica': {
    antes: 'Eu planejava a atividade, não a aprendizagem. Sabia o que a turma ia fazer, não o que ia aprender.',
    depois: 'Agora escrevo o objetivo antes da atividade. Quando os dois não conversam, é a atividade que muda.',
    limite: 'O objetivo aparece no plano, mas ainda não guia a escolha da atividade: ele é escrito depois, para justificar o que eu já ia fazer.',
  },
  'Diversidade e Inclusão': {
    antes: 'Eu adaptava para quem tinha laudo. Os outros que não acompanhavam eu tratava como falta de esforço.',
    depois: 'Comecei a olhar a barreira antes do aluno. Mudei a forma de apresentar a tarefa e três estudantes que eu achava desinteressados entregaram.',
    limite: 'As adaptações acontecem quando alguém sinaliza. Ainda não parto do princípio de que a turma é diversa ao planejar.',
  },
  'Gestão da Aprendizagem': {
    antes: 'A avaliação era o fim do processo. Eu descobria quem não tinha aprendido quando já não dava para voltar.',
    depois: 'Passei a coletar evidência durante o percurso. O reensino agora acontece na semana seguinte, não no fim do bimestre.',
    limite: 'A evidência é coletada, mas ainda vira nota antes de virar decisão pedagógica. O dado existe e não muda o próximo passo.',
  },
  'Observação e Contexto': {
    antes: 'Eu via a turma como um bloco. O que acontecia na vida de cada um ficava fora da minha leitura.',
    depois: 'Comecei a registrar o que observo, aluno a aluno. Foi assim que percebi que a queda de uma estudante tinha começado numa mudança de casa.',
    limite: 'A observação acontece, mas fica na memória. Sem registro, o que eu percebo não chega à coordenação nem ao próximo professor.',
  },
  // ── Coordenação ───────────────────────────────────────────────────────
  'Desenvolvimento Docente': {
    antes: 'A formação era o tema que eu achava importante. Chegava pronta, igual para todo mundo.',
    depois: 'Passei a partir do que observo em sala. A última formação nasceu de três aulas que eu tinha acabado de acompanhar.',
    limite: 'O tema já vem da observação, mas a formação ainda termina no encontro: falta acompanhar se aquilo chegou à prática.',
  },
  'Planejamento curricular e intencionalidade pedagógica': {
    antes: 'Eu conferia se o conteúdo tinha sido dado, não se fazia sentido no percurso do estudante.',
    depois: 'Agora olho a sequência inteira antes de aprovar. Encontrei duas unidades que ensinavam a mesma coisa em meses diferentes.',
    limite: 'A revisão curricular acontece, mas por disciplina. A coerência entre elas ainda depende de os professores conversarem por conta própria.',
  },
  'Gestão de Desempenho e Avaliação': {
    antes: 'Eu recebia os resultados e repassava. A conversa era sobre a média, não sobre o que fazer.',
    depois: 'Passei a chegar na reunião com o gap identificado e uma intervenção proposta. A conversa mudou de tom na hora.',
    limite: 'Os dados são analisados, mas a intervenção fica no combinado verbal. Sem prazo e responsável, a próxima reunião recomeça do zero.',
  },
  'Colaboração docente e cultura formativa': {
    antes: 'Cada professor resolvia sozinho. Duas pessoas tinham o mesmo problema em salas vizinhas e não sabiam.',
    depois: 'Criei um momento fixo de troca de prática. Na segunda vez, uma professora trouxe uma solução que outra tinha testado.',
    limite: 'O espaço de troca existe no calendário, mas ainda é relato. Ninguém sai de lá com algo combinado para testar.',
  },
  'Gestão da Aprendizagem (coordenação)': {
    antes: 'Eu acompanhava pela nota que chegava no fim. Entrava na sala para resolver problema, não para observar.',
    depois: 'Passei a observar aula com foco combinado antes. A devolutiva deixou de ser impressão e virou conversa sobre o que aconteceu.',
    limite: 'As observações acontecem, mas a devolutiva ainda é elogio geral. O professor sai sem saber o que mudar na próxima aula.',
  },
};

/**
 * A mesma competência "Gestão da Aprendizagem" existe nos DOIS cargos, com
 * comportamentos diferentes — e a fala de quem coordena não é a de quem dá
 * aula. Por isso a busca considera o cargo antes de cair no nome puro.
 */
function falasDe(cargo: string, competencia: string): Falas | null {
  if (cargo === COORDENACAO && FALAS[`${competencia} (coordenação)`]) {
    return FALAS[`${competencia} (coordenação)`];
  }
  return FALAS[competencia] || null;
}

const JUSTIFICATIVA: Record<PerfilEvolucao, string> = {
  confirmada: 'No cenário de fechamento, descreveu uma situação real de sala com o que fez, por que fez e o que mudou para os estudantes — sem precisar que a pergunta oferecesse a estrutura.',
  parcial: 'Descreveu o caminho correto no cenário de fechamento, apoiado no que a pergunta já sugeria. A prática aparece quando provocada, ainda não por iniciativa.',
  estavel: 'Reconhece o que precisaria mudar e explica bem o porquê, mas o fechamento não trouxe uma situação concreta em que isso já tenha acontecido com a turma.',
};

export const REGUA_ESCOLAR: ReguaDeEvolucao = {
  competenciasPorCargo: competenciasEscolaresPorCargo,
  descritoresPorCompetencia: descritoresEscolares,
  textos: {
    antes: (cargo, competencia) => falasDe(cargo, competencia)?.antes || null,
    depois: (cargo, competencia) => falasDe(cargo, competencia)?.depois || null,
    limiteEstavel: (cargo, competencia) => falasDe(cargo, competencia)?.limite || null,
    justificativa: (perfil) => JUSTIFICATIVA[perfil],
    insight: (perfil, { primeiroNome, maiorAvanco, menorAvanco }) => ({
      confirmada: `${primeiroNome} levou para o fechamento o que vinha praticando com a turma. O avanço mais claro está em ${maiorAvanco.toLowerCase()}, e apareceu tanto na avaliação quanto no relato da própria pessoa.`,
      parcial: `${primeiroNome} avançou em ${maiorAvanco.toLowerCase()}, ainda apoiada na estrutura da conversa. O próximo ciclo precisa verificar se a prática aparece sem provocação.`,
      estavel: `${primeiroNome} manteve o patamar de partida. Explica bem o que precisaria mudar, mas o fechamento não trouxe uma situação de sala em que isso já tenha acontecido. ${menorAvanco} é onde a lacuna segue mais visível.`,
    }[perfil]),
    proximoPasso: (perfil, { maiorAvanco, menorAvanco }) => ({
      confirmada: `Levar ${menorAvanco.toLowerCase()} para o próximo ciclo, com a coordenação acompanhando uma aula e devolvendo sobre esse ponto específico.`,
      parcial: `Repetir ${maiorAvanco.toLowerCase()} em duas aulas seguidas e registrar o que mudou para os estudantes, para a próxima devolutiva partir de evidência.`,
      estavel: `Combinar com a coordenação uma aula observada nas próximas duas semanas com foco em ${menorAvanco.toLowerCase()}, com data marcada para a devolutiva.`,
    }[perfil]),
  },
};

export function competenciaFocoEscolar(cargo: string, indice: number, total: number): string {
  return competenciaFocoDistribuida(competenciasEscolaresPorCargo(cargo), indice, total);
}

export function construirEvolucaoEscolar(
  pessoa: { email: string; nome_completo: string; cargo: string },
  perfil: PerfilEvolucao,
  distribuicao?: { indice: number; total: number },
): EvolucaoDemo {
  return construirEvolucao(pessoa, perfil, REGUA_ESCOLAR, distribuicao);
}

/**
 * A jornada escolar tem 7 semanas (`programaModo: 'jornada'`), então o
 * fechamento é 6/7 — e não 13/14 como o DUO. Passar as semanas do DUO aqui
 * gravaria o fechamento em semanas que a trilha desta rede não tem.
 */
export function construirFechamentoEscolar(evolucao: EvolucaoDemo, concluidoEm: string) {
  return construirFechamento(evolucao, concluidoEm, { qualitativa: 6, cenario: 7 });
}
