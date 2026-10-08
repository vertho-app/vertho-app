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
 * para o dashboard. Os fallbacks são EXATAMENTE o tema Vertho do shell (Ciano #34C5CC),
 * então tenants sem branding não mudam em nada.
 */
export function resolveTheme(uiConfig) {
  const c = uiConfig || {};
  const { bgStart, bgEnd } = fundoEscuroDoDashboard(c);
  return {
    bgStart,
    bgEnd,
    accent: c.accent_color || '#34C5CC', // Ciano Vertho (brand book out/2026) = cyan-400 do tema
    // Accent cru (null se o tenant NÃO configurou) — usado para só sobrescrever
    // o token --brand-accent quando há branding real, mantendo Vertho idêntico.
    accentRaw: c.accent_color || null,
    logoUrl: c.logo_url || '/logo-vertho.png',
  };
}

function rgbHex(hex: unknown): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminanciaHex(hex: unknown): number | null {
  const rgb = rgbHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function escurecerHex(hex: string, fatorPreto: number): string {
  const rgb = rgbHex(hex)!;
  return '#' + rgb.map((v) => Math.round(v * (1 - fatorPreto)).toString(16).padStart(2, '0')).join('');
}

/**
 * O dashboard é desenhado SÓ para fundo escuro (texto text-white/gray em todas as
 * telas). Fundo claro configurado pro login (ex.: Amazon Bowling #FEFEFE→#E1A701)
 * deixava título branco sobre amarelo. Se o fundo do tenant é claro, o dashboard
 * usa um tom escuro derivado da cor de marca (primary → accent), no mesmo matiz.
 * Fundo escuro configurado passa intocado; sem branding = Vertho exato.
 */
export function fundoEscuroDoDashboard(c: any): { bgStart: string; bgEnd: string } {
  const start = c.bg_gradient_start || '#091D35';
  const end = c.bg_gradient_end || '#0F2A4A';
  const ls = luminanciaHex(start), le = luminanciaHex(end);
  const claro = (ls !== null && ls > 0.18) || (le !== null && le > 0.18);
  if (!claro) return { bgStart: start, bgEnd: end };
  const marca = [c.primary_color, c.accent_color].find((h) => rgbHex(h));
  if (!marca) return { bgStart: '#091D35', bgEnd: '#0F2A4A' };
  return { bgStart: escurecerHex(String(marca).slice(0, 7), 0.88), bgEnd: escurecerHex(String(marca).slice(0, 7), 0.8) };
}

export type TenantTheme = ReturnType<typeof resolveTheme>;
