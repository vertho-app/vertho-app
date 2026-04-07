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
