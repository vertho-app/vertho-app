/**
 * Rascunho da preparação e da reflexão do Simulador de liderança, no aparelho.
 *
 * Até 27/09/2026 os dois textos (até 6.000 e 4.000 caracteres) viviam só no
 * estado da tela: um F5, uma aba fechada ou a bateria do celular apagavam o que
 * a pessoa tinha escrito. O rascunho é conveniência, não estado do treino: o
 * que vale é o que o servidor confirmou. Por isso tudo aqui engole a falha do
 * `localStorage` (janela anônima, armazenamento bloqueado, cota cheia) e a tela
 * funciona igual sem ele.
 *
 * Chave por empresa, encontro e etapa. O id do encontro é o do comando que o
 * abriu (UUID da jornada da pessoa), então identifica jornada e encontro de uma
 * vez, e uma repetição do mesmo encontro tem rascunho próprio.
 */
export type EtapaRascunho = 'plano' | 'reflexao';

const PREFIXO = 'vertho:sim-lideranca:rascunho:v1';

export const chaveRascunho = (empresaId: string, encontroId: string, etapa: EtapaRascunho) =>
  `${PREFIXO}:${empresaId}:${encontroId}:${etapa}`;

export function lerRascunho(chave: string): string {
  try {
    return window.localStorage.getItem(chave) || '';
  } catch {
    return '';
  }
}

/** Grava (ou apaga, se vazio). Devolve se o texto ficou salvo no aparelho. */
export function salvarRascunho(chave: string, texto: string): boolean {
  try {
    if (texto.trim()) {
      window.localStorage.setItem(chave, texto);
      return true;
    }
    window.localStorage.removeItem(chave);
    return false;
  } catch {
    return false;
  }
}

export function apagarRascunho(chave: string) {
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Sem armazenamento, não há o que apagar.
  }
}
