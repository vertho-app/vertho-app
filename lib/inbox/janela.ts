/**
 * Janela de atendimento de 24h do WhatsApp.
 *
 * A REGRA (política da Meta): a empresa só pode mandar **texto livre** nas 24h
 * seguintes à ÚLTIMA mensagem que a pessoa enviou. Fora disso, apenas template
 * aprovado. Dentro da janela, texto livre e templates de utilidade são
 * gratuitos.
 *
 * ⚠️ QUEM ABRE A JANELA É A PESSOA, não nós. Enviar template não abre janela; a
 * pessoa tocar num botão de URL também não (aquilo abre o navegador, não manda
 * mensagem). Só um `messages[]` no webhook conta — e é por isso que o cálculo
 * aqui olha para `recebida_em`, nunca para o que enviamos.
 *
 * ⚠️ ESTA FUNÇÃO É PURA E RECEBE `agora` INJETADO de propósito. A regra tem uma
 * fronteira dura em 24h, e testar fronteira com `Date.now()` produz suíte que
 * muda de cor conforme a hora em que roda — já aconteceu nesta base. Congele o
 * tempo no teste; nunca use o relógio real.
 */

export const JANELA_MS = 24 * 60 * 60 * 1000;

export type EstadoJanela = 'aberta' | 'fechada' | 'nunca-escreveu';

export interface Janela {
  estado: EstadoJanela;
  /** Quando fecha (ISO). `null` quando a pessoa nunca escreveu. */
  fechaEm: string | null;
  /** Milissegundos restantes; 0 quando fechada. */
  restanteMs: number;
  /** Pode mandar texto livre agora? */
  podeTextoLivre: boolean;
}

/**
 * Calcula o estado da janela a partir da última mensagem RECEBIDA.
 *
 * `ultimaRecebidaEm` nulo = a pessoa nunca escreveu ⇒ nunca houve janela. Note
 * que isso é diferente de "fechada": nunca-escreveu não vira aberta com um
 * template, e a tela precisa dizer isso de outro jeito ("a pessoa nunca
 * respondeu" ≠ "a janela expirou").
 */
export function calcularJanela(
  ultimaRecebidaEm: string | Date | null | undefined,
  agora: number = Date.now(),
): Janela {
  if (!ultimaRecebidaEm) {
    return { estado: 'nunca-escreveu', fechaEm: null, restanteMs: 0, podeTextoLivre: false };
  }

  const base = new Date(ultimaRecebidaEm).getTime();
  if (!Number.isFinite(base)) {
    // Data ilegível não pode virar "aberta" por acidente: o lado seguro de uma
    // regra de permissão é o que nega.
    return { estado: 'nunca-escreveu', fechaEm: null, restanteMs: 0, podeTextoLivre: false };
  }

  const fecha = base + JANELA_MS;
  const restante = fecha - agora;

  // `> 0` e não `>= 0`: no instante exato de 24h a janela JÁ fechou. A Meta
  // recusaria com 131047, e mostrar o campo habilitado no último milissegundo
  // produziria uma mensagem perdida em vez de um bloqueio explicado.
  const aberta = restante > 0;

  return {
    estado: aberta ? 'aberta' : 'fechada',
    fechaEm: new Date(fecha).toISOString(),
    restanteMs: aberta ? restante : 0,
    podeTextoLivre: aberta,
  };
}

/**
 * Texto curto do tempo restante, para a tela.
 *
 * Sem segundos de propósito: uma contagem regressiva ao segundo convida a
 * mandar no limite, que é exatamente onde a corrida entre renderizar e enviar
 * derruba a mensagem.
 */
export function restanteLegivel(restanteMs: number): string {
  if (restanteMs <= 0) return 'encerrada';
  const min = Math.floor(restanteMs / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
