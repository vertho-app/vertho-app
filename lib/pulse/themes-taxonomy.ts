/**
 * Taxonomia fechada de temas para classificação das respostas abertas.
 *
 * Cada tema:
 *  - key: identificador estável usado em pulse_classifications.classifier_themes
 *  - label: texto exibido ao usuário
 *  - polarity: 'positive' (acelerador potencial) | 'negative' (bloqueador potencial) | 'neutral'
 *  - dimensions: dimensões do Pulso que esse tema costuma informar
 *
 * Importante: a IA deve escolher entre estes temas (não inventar novos).
 * Se o texto não cabe em nenhum, retorna 'outro' (não persiste tema).
 */

import type { DimensionKey } from './template';

export type ThemePolarity = 'positive' | 'negative' | 'neutral';

export interface Theme {
  key: string;
  label: string;
  polarity: ThemePolarity;
  dimensions: DimensionKey[];
}

export const THEMES: Theme[] = [
  // Bloqueadores típicos
  { key: 'falta_tempo',          label: 'Falta de tempo',                     polarity: 'negative', dimensions: ['condicoes', 'aplicacao_pratica'] },
  { key: 'falta_clareza',        label: 'Falta de clareza',                   polarity: 'negative', dimensions: ['clareza'] },
  { key: 'falta_apoio',          label: 'Falta de apoio',                     polarity: 'negative', dimensions: ['lideranca', 'condicoes'] },
  { key: 'ausencia_feedback',    label: 'Ausência de feedback',               polarity: 'negative', dimensions: ['lideranca'] },
  { key: 'sobrecarga',           label: 'Sobrecarga',                         polarity: 'negative', dimensions: ['condicoes'] },
  { key: 'baixa_autonomia',      label: 'Baixa autonomia',                    polarity: 'negative', dimensions: ['aplicacao_pratica'] },
  { key: 'dificuldade_aplicar',  label: 'Dificuldade de aplicação',           polarity: 'negative', dimensions: ['aplicacao_pratica'] },
  { key: 'inseguranca_ajuda',    label: 'Insegurança para pedir ajuda',       polarity: 'negative', dimensions: ['seguranca_aprender'] },
  { key: 'conflito_prioridades', label: 'Conflito de prioridades',            polarity: 'negative', dimensions: ['clareza', 'condicoes'] },

  // Aceleradores típicos
  { key: 'reconhecimento',       label: 'Reconhecimento',                     polarity: 'positive', dimensions: ['futuro_permanencia', 'lideranca'] },
  { key: 'evolucao_percebida',   label: 'Evolução percebida',                 polarity: 'positive', dimensions: ['futuro_permanencia', 'aplicacao_pratica'] },
  { key: 'aplicacao_concreta',   label: 'Aplicação prática concreta',         polarity: 'positive', dimensions: ['aplicacao_pratica'] },
];

export const THEME_KEYS = THEMES.map(t => t.key);

export function findTheme(key: string): Theme | null {
  return THEMES.find(t => t.key === key) || null;
}

/**
 * Lista de temas em formato de "menu" pro prompt da IA classificadora.
 * Estável — não muda entre versões salvo bump explícito.
 */
export function getThemesPromptList(): string {
  return THEMES.map(t => `- ${t.key}: ${t.label} (${t.polarity})`).join('\n');
}

export const TAXONOMY_VERSION = '1.0.0';
