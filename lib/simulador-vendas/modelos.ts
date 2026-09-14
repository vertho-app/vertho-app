// Compatibilidade comprovada pelo canário strict JSON do PACE, não pelo prefixo do fornecedor.
// Expandir este conjunto exige verificar Responses + schema + limite de contexto + catálogo de custo.
export const MODELOS_PACE = new Set(['gpt-5.4-2026-03-05', 'gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17']);
export function modeloPaceCompativel(modelo: string): boolean {
  return MODELOS_PACE.has(modelo);
}
