export type RecommendedContentLinkInput = {
  id?: string | null;
  formato?: string | null;
  url?: string | null;
};

/**
 * Resolve o destino abrível de um card de capacitação da home.
 *
 * Texto/case e áudio normalmente nascem com `conteudo_inline`, mas sem `url`:
 * as rotas internas geram ou recuperam o PDF/podcast personalizado. Confiar
 * apenas em `item.url` transformava esses cards em áreas clicáveis sem ação.
 */
export function getRecommendedContentHref(item: RecommendedContentLinkInput): string | null {
  const id = String(item.id || '').trim();
  const formato = String(item.formato || '').trim().toLowerCase();

  if (id && (formato === 'texto' || formato === 'case')) {
    return `/api/conteudo/${encodeURIComponent(id)}/pdf`;
  }
  if (id && formato === 'audio') {
    return `/api/conteudo/${encodeURIComponent(id)}/podcast`;
  }

  const url = String(item.url || '').trim();
  return url || null;
}
