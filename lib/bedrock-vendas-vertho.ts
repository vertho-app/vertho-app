import { BEDROCK_KIMI_K3_MODEL } from '@/lib/ai-provedores';
import { VERTHO_TREINO_EMPRESA_ID } from '@/lib/simulador-vendas/vertho';

/** Autorização específica do treinamento comercial, sem liberar outros tenants ou a API Moonshot. */
export function bedrockVendasVerthoAutorizado(
  modelo: string,
  tarefa?: string | null,
  empresaId?: string | null,
): boolean {
  return (
    modelo === BEDROCK_KIMI_K3_MODEL &&
    empresaId === VERTHO_TREINO_EMPRESA_ID &&
    (tarefa === 'sim_vendas_criador' || tarefa === 'sim_vendas_cliente')
  );
}
