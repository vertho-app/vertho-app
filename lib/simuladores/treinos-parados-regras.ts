/**
 * As constantes e os tipos de "Treinos parados" (R-96) que a TELA também lê.
 * Moram aqui, sem `server-only`, porque o componente de cliente os importa e o
 * módulo do servidor (`treinos-parados.ts`) não pode entrar no bundle do browser.
 */

/** A sessão precisa estar sem atividade há pelo menos isto, na lista e na ação. */
export const HORAS_SEM_ATIVIDADE = 48;
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 500;
/** Teto de linhas da lista; passou disso, a tela avisa em vez de calar. */
export const LIMITE_LISTA = 200;

export type SimuladorEncerravel = 'vendas' | 'atendimento';

export type TreinoParado = {
  simulador: SimuladorEncerravel;
  sessaoId: string;
  empresaId: string;
  empresa: string;
  /** Nome da pessoa; `null` quando o cadastro não existe mais. */
  pessoa: string | null;
  status: string;
  /** Última transição gravada (`updated_at`), em ISO. */
  ultimaAtividade: string;
  temConversa: boolean;
};

export type ListaTreinosParados = {
  itens: TreinoParado[];
  /** Havia mais do que `LIMITE_LISTA`: a tela diz, em vez de parecer completa. */
  truncado: boolean;
  horas: number;
};
