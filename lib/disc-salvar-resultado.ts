/**
 * Desfecho do salvamento do mapeamento comportamental (DISC): a tela só segue
 * para "Você mapeou o seu perfil!" quando o servidor GRAVOU (R-84, 03/10/2026).
 *
 * Antes a tela ia para o encerramento em qualquer caso: a falha ficava num
 * estado que nada mostrava, a pessoa lia que tinha concluído, perdia as 14
 * respostas ao sair e depois era barrada no Diagnóstico por "falta o Perfil".
 * Agora a falha vira uma fase própria, com as respostas preservadas em memória
 * e um "Tentar de novo" que reenvia o MESMO resultado.
 */
export type DesfechoSalvarMapeamento = { fase: 'closing' } | { fase: 'erro'; erro: string };

export async function desfechoDoSalvamento(
  salvar: () => Promise<{ success?: boolean; error?: string } | null | undefined>,
  erroPadrao: string,
): Promise<DesfechoSalvarMapeamento> {
  try {
    const res = await salvar();
    if (res?.success === true) return { fase: 'closing' };
    return { fase: 'erro', erro: res?.error || erroPadrao };
  } catch (e: any) {
    return { fase: 'erro', erro: e?.message || erroPadrao };
  }
}
