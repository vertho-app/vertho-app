/**
 * Nome curto do tenant para a TELA DE INÍCIO do aparelho.
 *
 * Dois consumidores usam a mesma régua e precisam concordar:
 *   - `app/manifest.webmanifest/route.ts` → `short_name` do manifest (Android)
 *   - `app/layout.tsx` → `appleWebApp.title` (iOS)
 * Se divergirem, o mesmo app aparece com nomes diferentes dependendo do
 * aparelho — e ninguém percebe, porque cada plataforma mostra só o seu.
 *
 * Vive em `lib/` e não dentro da rota: importar de um módulo de rota funciona
 * mas é frágil (o Next trata `route.ts` de forma especial).
 *
 * O sistema corta a legenda sob o ícone perto de ~12 caracteres. "Secretaria
 * Municipal de Ibipeba/BA" viraria "Secretaria…", que não identifica cliente
 * nenhum — daí pular as palavras genéricas do começo.
 */
const GENERICAS = new Set([
  'secretaria', 'municipal', 'prefeitura', 'instituto', 'colegio', 'colégio',
  'escola', 'grupo', 'centro', 'faculdade', 'universidade', 'de', 'da', 'do',
]);

export const NOME_CURTO_PADRAO = 'Vertho';
export const MAX_NOME_CURTO = 12;

export function derivarNomeCurto(nome: string | null | undefined): string {
  const limpo = (nome || '').replace(/\s+/g, ' ').trim();
  if (!limpo) return NOME_CURTO_PADRAO;

  const palavras = limpo.split(' ').filter(Boolean);
  const significativa = palavras.find(
    (p) => !GENERICAS.has(p.toLowerCase().replace(/[^\wáéíóúâêôãõç]/gi, '')),
  );
  const escolhida = (significativa || palavras[0] || NOME_CURTO_PADRAO).replace(/[/,.]+$/, '');

  return escolhida.length > MAX_NOME_CURTO
    ? `${escolhida.slice(0, MAX_NOME_CURTO - 1)}…`
    : escolhida;
}
