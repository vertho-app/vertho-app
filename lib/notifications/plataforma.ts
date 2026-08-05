/**
 * Classificação de plataforma a partir do user-agent, feita NO SERVIDOR.
 *
 * Fica separada porque três consumidores diferentes precisam da MESMA regra
 * (registro de endpoint, evento de opt-in e a leitura do funil). Duas cópias
 * divergiriam no primeiro ajuste e o funil passaria a segmentar diferente de
 * como o endpoint foi carimbado — sem nada quebrar, só o painel mentindo.
 *
 * O user-agent cru é gravado junto em ambas as tabelas: heurística de UA
 * envelhece, e reclassificar depois exige a string original.
 */
export type Plataforma = 'ios' | 'android' | 'web';

export function detectarPlataforma(userAgent: string | null | undefined): Plataforma {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'web';
  // iPadOS 13+ se apresenta como Macintosh; o que o denuncia é o multi-touch.
  // Sem esta linha, iPad instalado como PWA seria contado em 'web' e o funil de
  // iOS mostraria menos gente do que realmente tentou.
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/macintosh/.test(ua) && /mobile/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'web';
}
