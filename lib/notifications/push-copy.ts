/**
 * Textos das notificações push.
 *
 * Separado e puro porque é COPY QUE SAI PARA FORA — a categoria que já vazou
 * jargão de código para o usuário nesta base. Aqui o risco é maior que o normal:
 * é a primeira coisa que a pessoa vê do produto no aparelho dela, fora do app,
 * às vezes na tela de bloqueio.
 *
 * Restrições reais do meio (não são preferências):
 * - Título some por reticências perto de ~40 caracteres na tela de bloqueio do
 *   iOS; corpo, perto de ~90 na notificação recolhida.
 * - O nome do app já aparece ACIMA do título ("VERTHO"), então repetir a marca
 *   no texto gasta caracteres e soa robótico.
 * - Nada de interpolar nome de organização: `na ${org}` já produziu "aí na
 *   teste" e "na Grupo Marista" em mensagem real. Aqui só entram `semana` e o
 *   tema do conteúdo, que são dados do próprio conteúdo.
 * - Sem emoji: no WhatsApp ele funciona como respiro visual no meio de um bloco
 *   de texto; numa notificação de uma linha, vira ruído.
 *
 * O vocabulário segue o que o WhatsApp já usa ("Pílula de Aprendizagem"), para
 * a pessoa reconhecer a mesma coisa chegando por outro canal — e não achar que
 * é um produto novo.
 */

export interface TextoPush {
  titulo: string;
  corpo: string;
}

/** Corta sem deixar palavra pela metade nem reticências dupla. */
function limitar(texto: string, max: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max - 1);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[.,;:—-]+$/, '')}…`;
}

export const LIMITE_TITULO = 40;
export const LIMITE_CORPO = 90;

/**
 * Pílula do dia. O tema (competência — descritor) vai no CORPO, não no título:
 * o título precisa ser reconhecível de relance e igual todo dia; o corpo é o
 * que diferencia uma pílula da outra.
 */
export function pushPilula(semana: number, tema: string): TextoPush {
  return {
    titulo: limitar(`Pílula da semana ${semana}`, LIMITE_TITULO),
    corpo: limitar(tema || 'Seu conteúdo da semana está disponível.', LIMITE_CORPO),
  };
}

/**
 * Missão da semana de aplicação (4/8/12). Kind próprio de propósito: não é
 * pílula, e tratar como se fosse mistura duas coisas na contagem de cadência.
 */
export function pushMissao(semana: number): TextoPush {
  return {
    titulo: limitar(`Missão da semana ${semana}`, LIMITE_TITULO),
    corpo: limitar('Sua tarefa prática desta semana já está disponível.', LIMITE_CORPO),
  };
}

/**
 * Quinta: cobrança do registro de evidência/prática.
 *
 * Fala do que FALTA ("ainda não registrou"), não do que existe — é a única
 * mensagem da semana cujo propósito é uma ação pendente da pessoa, e um título
 * genérico tipo "Semana 5" não daria a ela motivo para abrir.
 */
export function pushEvidencia(semana: number): TextoPush {
  return {
    titulo: limitar(`Registro da semana ${semana}`, LIMITE_TITULO),
    corpo: limitar('Você ainda não registrou como foi a prática desta semana.', LIMITE_CORPO),
  };
}
