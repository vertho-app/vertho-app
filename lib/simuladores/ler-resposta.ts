/**
 * Corpo de uma resposta da API dos simuladores, sem quebrar quando ela não é
 * JSON. Um 502/504 do gateway chega com HTML: até 27/09/2026 a tela do vendas
 * fazia `response.json()` antes de olhar o status, e a pessoa lia, em inglês,
 * "Unexpected token '<'" (V-3 da revisão). Nasceu no vendas; desde 03/10/2026
 * (R-97) a aba da equipe, a de cenários e os botões de voz do atendimento leem
 * por aqui também.
 *
 * `mensagens.semCorpo` é a mensagem para resposta ilegível (o servidor pode ter
 * recebido o envio); `mensagens.generica`, para erro legível sem texto.
 * `traduzir` deixa a tela trocar o texto do servidor por uma mensagem traduzida
 * quando o corpo traz um código conhecido (o limite de inícios por hora do
 * vendas, por exemplo) ou uma lista de campos inválidos.
 */
export async function lerResposta<T = any>(
  response: Response,
  mensagens: { semCorpo: string; generica: string },
  traduzir?: (corpo: Record<string, any>, status: number) => string | null | undefined,
): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  const objeto =
    body && typeof body === 'object' ? (body as Record<string, any>) : null;
  if (!objeto) throw new Error(mensagens.semCorpo);
  if (!response.ok) {
    const traduzida = traduzir?.(objeto, response.status);
    if (traduzida) throw new Error(traduzida);
    throw new Error(
      typeof objeto.error === 'string' && objeto.error
        ? objeto.error
        : mensagens.generica,
    );
  }
  return objeto as T;
}

/**
 * Falha de rede do `fetch` ("Failed to fetch", "Load failed") é `TypeError` do
 * navegador, em inglês e sem ação. Aqui ela vira a mensagem traduzida da tela;
 * qualquer outro erro passa como veio.
 */
export async function comRede<T>(pedido: Promise<T>, mensagemDeRede: string): Promise<T> {
  try {
    return await pedido;
  } catch (e) {
    if (e instanceof TypeError) throw new Error(mensagemDeRede);
    throw e;
  }
}
