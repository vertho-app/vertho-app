/** Dados editoriais da empresa fictícia; nunca usados no funil de leads reais. */
export const MIX_RESULTADOS_DEMO = [
  'confirmada', 'confirmada', 'confirmada', 'parcial', 'confirmada',
  'confirmada', 'confirmada', 'confirmada', 'estavel', 'confirmada',
] as const;

/** Repertório já presente no diagnóstico; a competência trabalhada usa o T0 da evolução. */
export function notaPanoramaDemo(email: string, competencia: string, descritor: string): number {
  const hash = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const base = [3.15, 3.3, 3.45, 3.65, 3.8][hash(`${email}:${competencia}`) % 5];
  const variacao = ((hash(descritor) % 5) - 2) * 0.05;
  return Number((base + variacao).toFixed(2));
}
