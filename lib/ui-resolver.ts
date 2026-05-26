/**
 * Utilitários de UI dinâmica por tenant.
 * Lê ui_config.labels e ui_config.hidden_elements para
 * personalizar labels e ocultar botões por empresa.
 */

export function getCustomLabel(elementId, defaultLabel, uiConfig) {
  if (!uiConfig?.labels) return defaultLabel;
  return uiConfig.labels[elementId] || defaultLabel;
}

export function isHidden(elementId, uiConfig) {
  if (!uiConfig?.hidden_elements) return false;
  return uiConfig.hidden_elements.includes(elementId);
}

/**
 * Tema visual do tenant (white-label além do login).
 *
 * Lê as MESMAS chaves de ui_config usadas na tela de login
 * (bg_gradient_start/end, accent_color, logo_url) e devolve tokens prontos
 * para o dashboard. Os fallbacks são EXATAMENTE o tema Vertho atual do shell,
 * então tenants sem branding não mudam em nada.
 */
export function resolveTheme(uiConfig) {
  const c = uiConfig || {};
  return {
    bgStart: c.bg_gradient_start || '#091D35',
    bgEnd: c.bg_gradient_end || '#0F2A4A',
    accent: c.accent_color || '#22d3ee', // cyan-400 (cor atual do nav ativo)
    logoUrl: c.logo_url || '/logo-vertho.png',
  };
}

export type TenantTheme = ReturnType<typeof resolveTheme>;
