/**
 * Capacidade máxima de um lote de reavaliação da Sem 14.
 *
 * Cada regeneração custa ~2 chamadas de IA (~2-3 min); a task Trigger tem
 * maxDuration 1800s (30 min). 10×~3min cabe com folga. Acima disso o caller
 * (UI) desabilita o botão e pede pra dividir.
 *
 * Vive fora do `'use server'` (actions.ts) porque arquivos server-action só
 * podem exportar funções async — uma `const` invalida o módulo pro client
 * bundle (Turbopack). Importado pela action e pela UI.
 */
export const REAVALIACAO_LOTE_CAP = 10;
