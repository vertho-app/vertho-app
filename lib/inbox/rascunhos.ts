/**
 * Os dois mecanismos que fazem uma caixa de entrada não trocar as bolas —
 * isolados do React de propósito, porque é aqui que os bugs moram.
 *
 * 🔴 1. RASCUNHO POR CONVERSA. Com um único campo de texto no componente, quem
 * atende escreve para A, clica em B e envia para B — sem nada na tela sugerir
 * que algo mudou de destinatário. A chave inclui a EMPRESA além do telefone:
 * o mesmo número pode existir em dois clientes, e nesse caso um rascunho
 * indexado só por telefone vaza o texto de um cliente na conversa do outro.
 *
 * 🔴 2. CONTROLE DE PEDIDOS. A rede não responde na ordem em que foi chamada, e
 * a caixa dispara pedidos de dois lugares (o clique e o polling de 15s). Sem
 * isto, a resposta atrasada da conversa anterior chega depois e substitui a
 * thread aberta: quem atende lê a conversa de outra pessoa acreditando que é
 * desta. O último pedido disparado é o único cujo resultado pode virar estado.
 */

export interface Alvo {
  empresaId: string;
  telefone: string;
}

export type Rascunhos = Record<string, string>;

/** Uma conversa é (empresa, telefone) — nunca só o telefone. */
export function chaveDaConversa(alvo: Alvo): string {
  return `${alvo.empresaId}:${alvo.telefone}`;
}

export function lerRascunho(rascunhos: Rascunhos, alvo: Alvo | null): string {
  if (!alvo) return '';
  return rascunhos[chaveDaConversa(alvo)] ?? '';
}

/** Escreve sem tocar nos rascunhos das outras conversas. */
export function gravarRascunho(rascunhos: Rascunhos, alvo: Alvo, valor: string): Rascunhos {
  return { ...rascunhos, [chaveDaConversa(alvo)]: valor };
}

export interface ControleDePedidos {
  /** Registra um pedido novo e devolve o número dele. */
  novo(): number;
  /** O resultado deste pedido ainda pode virar estado, ou já foi ultrapassado? */
  aindaVale(numero: number): boolean;
}

export function criarControleDePedidos(): ControleDePedidos {
  let atual = 0;
  return {
    novo: () => ++atual,
    aindaVale: (numero: number) => numero === atual,
  };
}
