/**
 * Corpo de uma resposta da API do simulador de vendas, sem quebrar quando ela
 * não é JSON. Um 504 do gateway chega com HTML: até 27/09/2026 a tela fazia
 * `response.json()` antes de olhar o status, e a pessoa lia, em inglês,
 * "Unexpected token '<'" (V-3 da revisão). O atendimento já tratava assim.
 *
 * `mensagens.semCorpo` é a mensagem para resposta ilegível (o servidor pode ter
 * recebido o envio); `mensagens.generica`, para erro legível sem texto.
 */
export async function lerResposta<T = any>(
  response: Response,
  mensagens: { semCorpo: string; generica: string },
): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  const objeto =
    body && typeof body === 'object' ? (body as { error?: unknown }) : null;
  if (!objeto) throw new Error(mensagens.semCorpo);
  if (!response.ok)
    throw new Error(
      typeof objeto.error === 'string' && objeto.error
        ? objeto.error
        : mensagens.generica,
    );
  return objeto as T;
}
