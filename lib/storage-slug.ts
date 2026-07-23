/**
 * Slug seguro para key do Supabase Storage.
 *
 * Storage rejeita key com caractere não-ASCII ("Invalid key") — nome de pessoa
 * com acento (ex.: "Corrêa", "Elizângela") derrubava o upload de PDF/áudio.
 * Usar SEMPRE este helper ao derivar key de storage de nome livre (pessoa,
 * cargo etc.). O `filename` de download pode manter acento — só a key não.
 */
export function storageSlug(name: string | null | undefined, fallback = 'arquivo'): string {
  const slug = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')          // qualquer não-alfanumérico → hífen
    .replace(/^-+|-+$/g, '')                  // trim hífens
    .toLowerCase();
  return slug || fallback;
}
