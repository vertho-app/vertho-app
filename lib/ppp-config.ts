import { MODELOS_DECLARADOS } from '@/lib/ai-tasks';

// Compartilhado pela tela e pela action: o modelo exibido precisa ser o enviado.
// Só famílias declaradas (R-45): o PPP bruto pode trazer nome de gestor.
export const PPP_AI_MODELS = MODELOS_DECLARADOS;

// Explícito: `[0]` do catálogo é o Opus 5.5, e o padrão da extração de PPP não pode mudar de custo em silêncio.
export const DEFAULT_PPP_MODEL = 'claude-sonnet-5';
