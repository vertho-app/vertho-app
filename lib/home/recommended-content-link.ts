export type RecommendedContentLinkInput = {
  id?: string | null;
  formato?: string | null;
  url?: string | null;
  bunny_video_id?: string | null;
};

/**
 * Resolve o destino abrível de um card de capacitação da home.
 *
 * Todo formato consumível abre primeiro na experiência interna do dashboard.
 * Isso é especialmente importante na sala de apresentação: o dashboard roda
 * dentro da moldura de celular, então uma nova aba faria o material "escapar"
 * do aparelho simulado.
 */
export function getRecommendedContentHref(item: RecommendedContentLinkInput): string | null {
  const id = String(item.id || '').trim();
  const formato = String(item.formato || '').trim().toLowerCase();
  if (!id) return null;

  const hasInternalSource = formato === 'texto'
    || formato === 'case'
    || formato === 'audio'
    || (formato === 'video' && Boolean(String(item.bunny_video_id || '').trim() || String(item.url || '').trim()))
    || (formato === 'pdf' && Boolean(String(item.url || '').trim()));

  return hasInternalSource
    ? `/dashboard/conteudo/${encodeURIComponent(id)}`
    : null;
}
