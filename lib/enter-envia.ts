import { useEffect, useState } from 'react';

/**
 * Quando o Enter de um campo de conversa ENVIA a mensagem.
 *
 * No computador, Enter envia e Shift+Enter quebra a linha. No celular não existe
 * Shift+Enter: a tecla de quebra de linha do teclado da tela mandava a resposta
 * pela metade, e a conversa de Evidências contava o pedaço como uma resposta.
 * `Medido: 20/10/2026`, Ibipeba: a primeira resposta saiu cortada ("...uma turma
 * de 7÷"), a conversa fechou sobre fragmentos e a pessoa foi ao Tira-Dúvidas
 * escrever "Não terminei de digitar". Quem ditava por voz não sofria, porque
 * enviava pelo botão. No celular o envio passa a ser só pelo botão para todos.
 *
 * Enter durante a composição (acento, sugestão do teclado) também não envia: ele
 * confirma a palavra, não a mensagem.
 */
export type TeclaDoCampo = {
  key: string;
  shiftKey: boolean;
  nativeEvent: { isComposing?: boolean };
};

export function enterEnvia(e: TeclaDoCampo, tecladoDeToque: boolean): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false;
  if (e.nativeEvent.isComposing) return false;
  return !tecladoDeToque;
}

/**
 * Ponteiro PRINCIPAL grosso = celular ou tablet, onde o teclado é o da tela.
 * Sem `hover: none` de propósito: há Android que se declara com hover, e o
 * notebook com tela de toque continua `fine` (o principal é o mouse).
 */
export const MIDIA_TECLADO_DE_TOQUE = '(pointer: coarse)';

type JanelaComMidia = { matchMedia?: (consulta: string) => MediaQueryList };

/**
 * Avisa agora e a cada mudança se o aparelho é de toque; devolve o cancelamento.
 * Navegador sem `matchMedia` fica como computador (Enter envia), que é o
 * comportamento de antes, e não como um campo que nunca envia.
 */
export function assinarTecladoDeToque(janela: JanelaComMidia | undefined, aoMudar: (toque: boolean) => void): () => void {
  if (!janela || typeof janela.matchMedia !== 'function') return () => {};
  const midia = janela.matchMedia(MIDIA_TECLADO_DE_TOQUE);
  const ler = () => aoMudar(midia.matches);
  ler();
  midia.addEventListener?.('change', ler);
  return () => midia.removeEventListener?.('change', ler);
}

/**
 * Começa `false` (o servidor não sabe o aparelho) e lê a mídia na montagem. Antes
 * disso o campo nem recebe tecla, então o Enter do celular já cai na regra certa.
 */
export function useTecladoDeToque(): boolean {
  const [toque, setToque] = useState(false);
  useEffect(() => assinarTecladoDeToque(typeof window === 'undefined' ? undefined : window, setToque), []);
  return toque;
}
