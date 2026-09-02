/**
 * O RESUMO SEMANAL DA EQUIPE — o texto que o gestor recebe depois de responder VER.
 *
 * POR QUE ELE É UM NÚCLEO, E NÃO UMA ACTION
 * ─────────────────────────────────────────
 * Quem chama isto é o WEBHOOK, que não tem sessão: a autorização vem de o
 * telefone ter resolvido para um colaborador que é gestor E de existir uma
 * entrega recente do template para ele. Um `'use server'` aqui seria um endpoint
 * HTTP a mais, com o `empresaId` escolhido por quem chama — exatamente o furo
 * que a flag `internal` já produziu nesta base.
 *
 * 🔑 A LISTA VAI AGRUPADA PELA AÇÃO, NUNCA CORRIDA. Medido em 02/09/2026: dez
 * pessoas em blocos individuais ocupam 34 linhas e chegam como parede; os mesmos
 * dez agrupados ocupam 18 e viram três ou quatro conversas. O gestor age uma vez
 * por grupo. E o agrupamento é o que permite não ter teto de pessoas: cabem ~243
 * nomes nos 4.096 caracteres da janela.
 *
 * ⚠️ O TETO É POR GRUPO, NÃO DE PESSOAS (`MAX_NOMES_POR_GRUPO`). Dezoito nomes
 * numa linha viram 266 caracteres e seis linhas no celular — a mesma parede que o
 * agrupamento resolveu, só que dentro de um grupo. Acima do teto o grupo vira
 * contagem, porque falar com dezoito pessoas não são dezoito conversas, é um
 * recado à turma: ali o nome individual deixa de ser acionável.
 *
 * ⚠️ A SEMANA É A DO CALENDÁRIO, como no painel do gestor
 * (`app/dashboard/gestor/actions.ts`: `ceil(dias/7)` limitado por
 * `getProgramaConfigDaTrilha`). Isso é deliberado: se o WhatsApp usasse uma régua
 * e a tela outra, o gestor cobraria uma semana e veria outra ao abrir o painel —
 * a família de defeito que o F-I21 registra (três portas, três critérios).
 */
import { PROGRESSO, TRILHA } from '@/lib/status';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';

/** Acima disto o grupo deixa de listar nomes e vira contagem. Ver o ⚠️ acima. */
export const MAX_NOMES_POR_GRUPO = 8;

export type ChaveGrupo = 'a_um_passo' | 'parou_no_meio' | 'nao_abriu';

export type GrupoResumo = {
  chave: ChaveGrupo;
  /** Texto do cabeçalho do grupo, já na voz da mensagem. */
  rotulo: string;
  /** Nomes a listar. Vazio quando o grupo passou do teto. */
  nomes: string[];
  /** Quantas pessoas o grupo tem — pode ser maior que `nomes.length`. */
  total: number;
};

export type ResumoEquipe = {
  gestorPrimeiroNome: string;
  /** Liderados com trilha ativa. É o denominador do template. */
  equipe: number;
  /** Concluíram alguma semana nos últimos 7 dias. */
  avancaram: number;
  grupos: GrupoResumo[];
  /** Voltaram a avançar depois de duas semanas ou mais parados. */
  retomaram: string[];
  /** Semana do programa em que a equipe está, quando é uma só. */
  semana: number | null;
  /** URL do painel NO HOST DO TENANT. Sem ela o texto só cita "o painel". */
  linkPainel?: string | null;
};

/**
 * A ORDEM É A DO RETORNO POR CONVERSA, não a da gravidade.
 *
 * Quem está a um passo de concluir vem primeiro porque uma lembrança resolve, e
 * é o que faz o número da semana seguinte subir. Ordenar por "pior primeiro"
 * gastaria a atenção do gestor no caso mais difícil — e a atenção dele é o
 * recurso escasso que esta mensagem administra.
 */
const ROTULOS: Record<ChaveGrupo, string> = {
  a_um_passo: '*A um passo de concluir* (uma lembrança basta)',
  parou_no_meio: '*Começaram e pararam no meio*',
  nao_abriu: '*Não abriram o conteúdo desta semana*',
};
const ORDEM: ChaveGrupo[] = ['a_um_passo', 'parou_no_meio', 'nao_abriu'];

export type PessoaNaSemana = {
  nome: string;
  chave: ChaveGrupo;
};

/** Monta os grupos aplicando o teto. Puro — é o que os testes exercitam. */
export function agruparPessoas(pessoas: PessoaNaSemana[]): GrupoResumo[] {
  const grupos: GrupoResumo[] = [];
  for (const chave of ORDEM) {
    const doGrupo = pessoas.filter((p) => p.chave === chave);
    if (!doGrupo.length) continue;
    grupos.push({
      chave,
      rotulo: ROTULOS[chave],
      // Acima do teto o grupo não lista ninguém: listar 8 de 18 escolheria por
      // ordem de query quem é nomeado e quem não é, o que não tem sentido para
      // quem lê e ainda dá a impressão de que só esses oito precisam de algo.
      nomes: doGrupo.length > MAX_NOMES_POR_GRUPO ? [] : doGrupo.map((p) => p.nome),
      total: doGrupo.length,
    });
  }
  return grupos;
}

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? singular : plural_;
}

/**
 * O texto final, pronto para `enviarTextoCloud`.
 *
 * ⚠️ O NÚMERO DE CONVERSAS É CALCULADO. Escrever "três conversas" fixo produz uma
 * mensagem que se contradiz na primeira semana em que um grupo ficar vazio — e
 * foi exatamente o que eu fiz no rascunho desta mensagem.
 */
export function formatarResumo(r: ResumoEquipe): string {
  const pendentes = r.grupos.reduce((s, g) => s + g.total, 0);
  const linhas: string[] = [];

  if (!pendentes) {
    linhas.push(
      `${r.gestorPrimeiroNome}, ninguém da sua equipe está parado nesta semana.`,
      '',
      `${r.avancaram} ${plural(r.avancaram, 'pessoa avançou', 'pessoas avançaram')} na trilha.`,
    );
    return linhas.join('\n');
  }

  const nConversas = r.grupos.length;
  const conversas = nConversas === 1
    ? 'É uma conversa só'
    : `${maiuscula(porExtenso(nConversas))} conversas dão conta`;
  linhas.push(
    `${r.gestorPrimeiroNome}, ${pendentes} ${plural(pendentes, 'pessoa da sua equipe precisa', 'pessoas da sua equipe precisam')} ` +
      `de um empurrão. ${conversas}.`,
    '',
  );

  for (const g of r.grupos) {
    linhas.push(g.rotulo);
    linhas.push(
      g.nomes.length
        ? g.nomes.join(', ')
        : `${g.total} pessoas. Aqui um recado à turma rende mais que ${g.total} conversas.`,
    );
    linhas.push('');
  }

  if (r.retomaram.length) {
    linhas.push(
      `${listarNomes(r.retomaram)} ${plural(r.retomaram.length, 'voltou', 'voltaram')} a avançar depois de duas semanas ou mais parados.`,
      '',
    );
  }

  // O link é do TENANT (`acme.vertho.ai`), então quem chama o resolve — daqui
  // não dá para inventá-lo sem arriscar mandar o gestor de uma empresa para o
  // domínio de outra, que é o defeito que o apelido de vídeo por tenant já
  // produziu nesta base.
  linhas.push(r.linkPainel ? `O detalhe de cada uma está no painel:\n${r.linkPainel}` : 'O detalhe de cada uma está no painel.');
  return linhas.join('\n').trimEnd();
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Ana", "Ana e Pedro", "Ana, Pedro e Marina". */
export function listarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

function porExtenso(n: number): string {
  return ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco'][n] ?? String(n);
}

export function primeiroNome(nomeCompleto: string | null | undefined): string {
  return String(nomeCompleto ?? '').trim().split(/\s+/)[0] || 'você';
}

/**
 * Em que semana do programa a pessoa está, pelo CALENDÁRIO da trilha dela.
 * Mesma conta do painel do gestor — ver o ⚠️ do topo.
 */
export function semanaDaTrilha(trilha: { data_inicio?: string | null }): number | null {
  if (!trilha?.data_inicio) return null;
  const inicio = new Date(trilha.data_inicio).getTime();
  if (!Number.isFinite(inicio)) return null;
  const dias = Math.floor((Date.now() - inicio) / (24 * 3600 * 1000));
  const total = getProgramaConfigDaTrilha(trilha as any).semanas;
  return Math.max(1, Math.min(total, Math.ceil((dias + 1) / 7)));
}

/**
 * Em qual grupo a pessoa cai, a partir da linha de progresso da semana ATUAL.
 *
 * `linha` ausente significa que a semana ainda não foi tocada — o mesmo lugar de
 * quem tem a linha em `pendente`. As duas formas existem no banco (medido: 707
 * linhas `pendente` contra semanas sem linha), e tratá-las diferente criaria dois
 * grupos para o mesmo estado.
 */
export function classificarSemana(
  linha: { status?: string | null; conteudo_consumido?: boolean | null } | null | undefined,
): ChaveGrupo | 'concluida' {
  if (!linha) return 'nao_abriu';
  if (linha.status === PROGRESSO.CONCLUIDO) return 'concluida';
  // `conteudo_consumido` distingue de verdade neste recorte: 95% das concluídas
  // e 35% das em andamento (medido 02/09/2026). Quem consumiu e não concluiu está
  // a um passo — o que falta é a conversa de evidências.
  if (linha.conteudo_consumido) return 'a_um_passo';
  if (linha.status === PROGRESSO.EM_ANDAMENTO) return 'parou_no_meio';
  return 'nao_abriu';
}

export const TRILHA_ATIVA = TRILHA.ATIVA;
