import { MODELOS_DISPONIVEIS } from '@/lib/ai-tasks';

// Compartilhado pela tela e pela action: o modelo exibido precisa ser o enviado.
export const PPP_AI_MODELS = MODELOS_DISPONIVEIS;

// Explícito: `[0]` do catálogo é o Opus 5.5, e o padrão da extração de PPP não pode mudar de custo em silêncio.
export const DEFAULT_PPP_MODEL = 'claude-sonnet-5';
