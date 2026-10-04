import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/** O que a tela diz quando a leitura que a alimenta falhou: não é "vazio", é "tente de novo". */
export const MENSAGEM_INDISPONIVEL = 'Não foi possível carregar os dados agora. Tente de novo em instantes.';

/**
 * A leitura que alimenta um painel de gestor ou de RH falhou (R-139, 04/10/2026): registra
 * em `degradacao_log` e devolve. NUNCA lança. Quem chama responde `indisponivel: true`, e a
 * tela oferece "tentar de novo" em vez de um estado vazio que se lê como verdade ("sem
 * liderados", "nenhum checkpoint", lista de evolução vazia).
 *
 * Fora de `'use server'` de propósito: export de arquivo `'use server'` vira endpoint.
 */
export async function registrarLeituraIndisponivel(empresaId: string | null | undefined, onde: string, motivo: string): Promise<void> {
  console.error(`[gestor] ${onde} indisponível:`, motivo);
  await registrarDegradacao({
    fluxo: 'leitura',
    tipo: DEGRADACAO.LEITURA_INDISPONIVEL,
    chave: `${onde}:${empresaId ?? 'sem-empresa'}`,
    empresaId: empresaId ?? null,
    severidade: 'aviso',
    detalhe: { onde, motivo },
  });
}
