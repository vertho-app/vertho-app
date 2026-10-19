/**
 * Janelas da cadência diária: o dia agendado, a RECUPERAÇÃO de 1 a 2 dias depois, e o
 * fim do calendário para quem ficou atrasado (R-94, 04/10/2026).
 *
 * 🔴 O DEFEITO. A cadência só agia no dia exato de cada papel (pílula 1, pílula 2,
 * evidência). Envio que falhava no dia, por template recusado, SES caído, fornecedor fora
 * ou cron perdido, nunca era recuperado: no dia seguinte o cron olhava OUTRO papel, e o
 * carimbo do canal que não saiu ficava para trás. E quem estava atrasado na jornada
 * recebia "concluído" na quinta em que o relógio passava do fim do plano, e nenhuma
 * mensagem mais, por mais semanas que lhe faltassem.
 *
 * O que muda, em três regras que se leem aqui:
 *
 *  1. RECUPERAÇÃO. Num dia SEM papel agendado, o papel que caiu 1 ou 2 dias antes é
 *     refeito para quem ainda não foi alcançado por canal nenhum aplicável desde a data
 *     dele (`desdeUTC`). Dia com papel agendado não recupera (a pessoa receberia dois
 *     contatos no mesmo dia, e o número é compartilhado por todos os tenants).
 *  2. A recuperação NUNCA usa o texto livre: ele está morto desde 13/08/2026 (fora da
 *     janela de 24 h a Meta só entrega template). Falha de template vira tentativa de
 *     novo, dentro da janela, e fica visível (postflight R6/R7, degradação).
 *  3. FIM DO CALENDÁRIO. Passado o último dia do plano, quem concluiu tudo ou não está
 *     mais ativo é concluído, como sempre; quem ficou ATRASADO segue com o envio ATIVO, sem
 *     mensagem automática nenhuma, por até `SEMANAS_ABERTO_POS_FIM` semanas, e depois é
 *     concluído.
 *
 * 🔑 SEM ENVIO AUTOMÁTICO DEPOIS DO FIM DO PLANO (decisão do dono, 19/10/2026: "cancelar os
 * envios automáticos após a semana 7; se precisar, o envio deve ser feito de forma manual").
 * Até então o atrasado recebia a pendência a cada quinzena (R-94, 04/10). O envio continua
 * ATIVO na janela de propósito: o disparo manual da tela de Envios só enxerga quem tem
 * `fase4_envios` ativo (`carregarCadenciaManual`), e concluir no fim do plano deixaria o
 * atrasado sem canal nenhum, nem o manual.
 *
 * Puro de propósito: é o que o teste precisa exercitar sem montar o disparo.
 */
import { diasDaSemanaComFeriado, type DiasCadencia } from './feriados';

export type SlotCadencia = 'p1' | 'p2' | 'ev';

/** Quantos dias depois do dia agendado um papel ainda pode ser refeito. */
export const JANELA_RECUPERACAO_DIAS = 2;

/** Por quantas semanas depois do fim do plano o envio do atrasado segue ativo (só para o manual) antes de concluir. */
export const SEMANAS_ABERTO_POS_FIM = 8;

export interface RecuperacaoDoDia {
  slot: SlotCadencia;
  /** 1 ou 2: quantos dias depois do agendado é hoje. */
  atrasoDias: number;
  /** A data (YYYY-MM-DD) do dia agendado do papel: o que vale como "já saiu" é carimbo desta data em diante. */
  desdeUTC: string;
}

export interface JanelaDoDia {
  /** Os papéis cujo dia é HOJE, já deslocados pelo feriado nacional. */
  agendados: SlotCadencia[];
  /** Os papéis em recuperação hoje. Vazio num dia com papel agendado. */
  recuperando: RecuperacaoDoDia[];
}

/** Os dias configurados da empresa, com os defaults de sempre (segunda, terça, quinta). */
export function diasBaseDaCadencia(cadencia: any): DiasCadencia {
  return {
    diaP1: cadencia?.fase4_dia_pilula ?? 1,
    diaP2: cadencia?.fase4_dia_pilula2 ?? 2,
    diaEv: cadencia?.fase4_dia_evidencia ?? 4,
  };
}

const DIA_MS = 86_400_000;

const dataUTCMenos = (hojeUTC: string, dias: number): string => {
  const [y, m, d] = hojeUTC.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - dias * DIA_MS).toISOString().slice(0, 10);
};

const SLOTS: Array<[SlotCadencia, keyof DiasCadencia]> = [['p1', 'diaP1'], ['p2', 'diaP2'], ['ev', 'diaEv']];

/**
 * O que a cadência faz HOJE: os papéis agendados e, num dia livre, os que caíram 1 ou 2
 * dias antes. O deslocamento por feriado vale para o dia de hoje E para o dia agendado de
 * cada papel (cada um pergunta à semana da sua própria data).
 */
export function janelasDoDia(cadencia: any, hojeUTC: string, hoje: number): JanelaDoDia {
  const base = diasBaseDaCadencia(cadencia);
  const dias = diasDaSemanaComFeriado(base, hojeUTC, hoje);
  const agendados = SLOTS.filter(([, chave]) => dias[chave] === hoje).map(([slot]) => slot);
  if (agendados.length) return { agendados, recuperando: [] };

  const recuperando: RecuperacaoDoDia[] = [];
  for (let atraso = 1; atraso <= JANELA_RECUPERACAO_DIAS; atraso++) {
    const dowDoSlot = (hoje - atraso + 7) % 7;
    const dataDoSlot = dataUTCMenos(hojeUTC, atraso);
    const diasDaquela = diasDaSemanaComFeriado(base, dataDoSlot, dowDoSlot);
    for (const [slot, chave] of SLOTS) {
      if (diasDaquela[chave] === dowDoSlot) recuperando.push({ slot, atrasoDias: atraso, desdeUTC: dataDoSlot });
    }
  }
  return { agendados, recuperando };
}

/** Há trabalho hoje para esta empresa (papel agendado ou em recuperação)? É o filtro do dispatcher. */
export function temTrabalhoHoje(cadencia: any, hojeUTC: string, hoje: number): boolean {
  const j = janelasDoDia(cadencia, hojeUTC, hoje);
  return j.agendados.length > 0 || j.recuperando.length > 0;
}

export type DecisaoPosFim = 'concluir' | 'aguardar';

/**
 * Passado o fim do calendário (`semana_atual > total`), na quinta: concluir o envio ou
 * mantê-lo ativo, em silêncio, para o disparo manual.
 *
 * Não existe mais a opção de mandar algo (19/10/2026, ver o topo): nenhuma das duas
 * decisões envia mensagem. Só fica ativo quem a LEITURA confirma atrasado: trilha ativa,
 * com semanas por concluir. Sem leitura confiável a decisão é concluir.
 */
export function decidirPosFim(args: {
  progressoConfiavel: boolean;
  trilhaAtiva: boolean;
  semanasConcluidas: number;
  totalSemanas: number;
  /** Semana da trilha PELA DATA (`semanaPorData`), e não o relógio da cadência. */
  semanaPelaData: number | null;
}): DecisaoPosFim {
  if (!args.progressoConfiavel || !args.trilhaAtiva) return 'concluir';
  if (args.semanasConcluidas >= args.totalSemanas) return 'concluir';
  if (args.semanaPelaData == null) return 'concluir';
  if (args.semanaPelaData > args.totalSemanas + SEMANAS_ABERTO_POS_FIM) return 'concluir';
  return 'aguardar';
}
