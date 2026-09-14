/** Corrige somente desvios de apresentação, nunca inventa evidência/conduta. */
export function normalizarRelatorio(valor: unknown): unknown {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return valor;
  const r = structuredClone(valor) as Record<string, unknown>;
  const cortar = (obj: Record<string, unknown>, chave: string, tamanho: number) => {
    const v = obj[chave];
    if (typeof v === 'string') obj[chave] = v.slice(0, tamanho).replace(/[\uD800-\uDBFF]$/, '');
  };
  for (const chave of ['P', 'A', 'C', 'E', 'Media']) {
    const v = r[chave];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 10) r[chave] = Math.round(v * 2) / 2;
  }
  for (const chave of ['Preparacao', 'Analise', 'Cocriacao', 'Engajamento']) cortar(r, chave, 280);
  cortar(r, 'Resumo', 500);
  if (Array.isArray(r.Recomendacoes))
    for (const item of r.Recomendacoes) {
      if (item && typeof item === 'object') {
        cortar(item, 'titulo', 60);
        cortar(item, 'descricao', 250);
      }
    }
  return r;
}
