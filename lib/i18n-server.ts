import { unstable_cache } from 'next/cache';
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';
import { normalizarGlossario, type GlossarioTenant } from '@/lib/i18n-vocabulario';
import type { AppLocale } from '@/i18n/routing';

/**
 * Tag do data cache do locale default por tenant. O locale muda raramente
 * (só em /admin/empresas/[id]/configuracoes) e a query rodava em TODA
 * request renderizada via i18n/request.ts — era a query mais quente do
 * sistema. Invalidada em salvarLocaleEmpresa; TTL de 1 dia como backstop.
 */
export const TENANT_LOCALE_CACHE_TAG = 'tenant-default-locale';

async function fetchTenantDefaultLocale(slug: string): Promise<AppLocale | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('empresas')
    .select('default_locale')
    .eq('slug', slug)
    .maybeSingle();

  // Lança (em vez de retornar null) para o unstable_cache NÃO cachear erro
  // transitório do banco por 1 dia — quem chama trata o fallback.
  if (error) throw new Error(`tenant locale: ${error.message}`);
  return resolveAppLocale(data?.default_locale);
}

// Os argumentos (slug) entram na chave do cache automaticamente — cada
// tenant tem sua entrada.
const getCachedTenantDefaultLocale = unstable_cache(
  fetchTenantDefaultLocale,
  ['tenant-default-locale-by-slug'],
  { tags: [TENANT_LOCALE_CACHE_TAG], revalidate: 86_400 },
);

export async function getTenantDefaultLocaleBySlug(slug: string | null | undefined): Promise<AppLocale | null> {
  if (!slug) return null;

  try {
    return await getCachedTenantDefaultLocale(slug);
  } catch {
    return null;
  }
}

/**
 * Tag do data cache do glossário por tenant. Muda tão raramente quanto o
 * locale (é configuração de white-label) e seria lido em TODA request
 * renderizada — a mesma razão que fez o locale ser cacheado aqui.
 */
export const TENANT_GLOSSARIO_CACHE_TAG = 'tenant-glossario';

async function fetchTenantGlossario(slug: string): Promise<GlossarioTenant | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('empresas')
    .select('ui_config')
    .eq('slug', slug)
    .maybeSingle();

  // Lança (em vez de devolver null) para o `unstable_cache` NÃO guardar um erro
  // transitório do banco por um dia inteiro — quem chama trata o fallback.
  if (error) throw new Error(`tenant glossário: ${error.message}`);
  return normalizarGlossario((data?.ui_config as any)?.vocabulario);
}

const getCachedTenantGlossario = unstable_cache(
  fetchTenantGlossario,
  ['tenant-glossario-by-slug'],
  { tags: [TENANT_GLOSSARIO_CACHE_TAG], revalidate: 86_400 },
);

/**
 * Glossário de vocabulário do tenant (`ui_config.vocabulario`), ou null.
 *
 * Fail-safe por decisão: qualquer falha devolve null, e null significa "as
 * mensagens padrão". O app inteiro renderiza a partir das mensagens — um erro
 * aqui não pode custar mais que uma palavra não trocada.
 */
export async function getTenantGlossarioBySlug(slug: string | null | undefined): Promise<GlossarioTenant | null> {
  if (!slug) return null;

  try {
    return await getCachedTenantGlossario(slug);
  } catch {
    return null;
  }
}

/**
 * Locale da pessoa: o dela, senão o default da empresa DELA.
 *
 * ── B13 (auditoria de 22/08): era `.eq('email')` + `.limit(1)` ────────────
 *
 * Consultar `colaboradores` por e-mail sem escopo de tenant é o padrão que o
 * CLAUDE.md proíbe, e o `.limit(1)` sem `order` por cima deixava o planner
 * escolher a linha: para quem existe em 2+ empresas, qual empresa responde é
 * sorteio. `Medido em 24/08:` **os 3 platform admins têm cadastro em 2 a 4
 * empresas** — não é hipótese.
 *
 * Aqui o pior sintoma é barato (a interface abre em pt-PT em vez de pt-BR, ou
 * vice-versa — o app roda os dois desde a mig 114). O valor de fechar é tirar
 * da base mais uma cópia da régua errada: o mesmo `.eq('email')` sem tenant,
 * noutro consumidor, decide AUTORIZAÇÃO.
 *
 * `findColabByEmail` resolve o tenant pelo cookie/header e é **fail-closed**
 * quando não consegue: e-mail ambíguo sem tenant resolvido devolve null em vez
 * de escolher um. Aqui isso significa "não gravo cookie de locale" — a request
 * segue com o default do tenant, que é o certo. Antes, sortear a empresa
 * gravava um cookie de 1 ano com o idioma da empresa errada.
 */
export async function getLocaleForEmail(email: string | null | undefined): Promise<AppLocale | null> {
  if (!email) return null;

  try {
    const { findColabByEmail } = await import('@/lib/authz');
    const colab = await findColabByEmail(email, 'locale, empresa_id, empresas(default_locale)') as any;
    if (!colab) return null;

    const empresaLocale = Array.isArray(colab.empresas)
      ? colab.empresas?.[0]?.default_locale
      : colab.empresas?.default_locale;

    return resolveAppLocale(colab.locale, empresaLocale);
  } catch {
    return null;
  }
}
