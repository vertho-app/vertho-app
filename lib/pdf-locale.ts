/**
 * Em que idioma sai o PDF, e como o arquivo guardado diz o idioma em que nasceu.
 *
 * ── Quem decide o idioma ─────────────────────────────────────────────────────
 * O idioma é o da PESSOA que vê: `colaboradores.locale`; na falta, o da empresa
 * (`empresas.default_locale`); na falta, pt-BR. É a mesma cadeia que o resto do
 * app usa (`getLocaleForEmail`, `i18n/request.ts`); aqui só muda que a pessoa é
 * resolvida por id, dentro do tenant, e não por e-mail.
 *
 *  - PDF baixado na rota: o idioma de quem BAIXA (`idiomaDoLeitor`);
 *  - PDF gravado no Storage na hora de gerar o relatório (`individual-core`,
 *    `gestor-rh-core`): o da pessoa a quem o relatório pertence (`idiomaDaPessoa`):
 *    o PDI é da pessoa, o do gestor é do gestor.
 *
 * ── O arquivo guardado precisa dizer em que idioma está ──────────────────────
 * `relatorios.pdf_path` é reaproveitado em todo download e em todo envio, e não
 * há coluna de idioma (e esta onda não cria migration). Então o idioma vai no
 * NOME do arquivo: `...-<carimbo>.<idioma>.pdf` para pt-PT, es-ES e en-US. O
 * pt-BR continua exatamente como era (`...-<carimbo>.pdf`), e todo PDF gravado
 * antes desta mudança é pt-BR, porque era o único idioma que existia. O slug do
 * nome vem de `storageSlug` (só `[a-z0-9-]`), então o ponto antes do idioma não
 * colide com o nome da pessoa.
 *
 * Falha de leitura NUNCA derruba o PDF: cai no próximo da cadeia, com `console.warn`.
 * Um PDF no idioma errado é um contratempo; um PDF que não sai é uma falha.
 */
import { tenantDb } from '@/lib/tenant-db';
import { resolveAppLocale } from '@/lib/i18n';
import { defaultLocale, locales, type AppLocale } from '@/i18n/routing';

const MARCA_DO_IDIOMA = new RegExp(`\\.(${locales.join('|')})\\.pdf$`);

/** Caminho no bucket `relatorios-pdf`: o idioma entra antes da extensão, salvo no pt-BR (o formato de sempre). */
export function caminhoDoPdf(
  empresaId: string,
  tipo: string,
  slug: string,
  locale: AppLocale,
  carimbo: number = Date.now(),
): string {
  const marca = locale === defaultLocale ? '' : `.${locale}`;
  return `${empresaId}/${tipo}-${slug}-${carimbo}${marca}.pdf`;
}

/** O idioma em que o arquivo guardado foi renderizado. Sem marca no nome, é pt-BR (todo PDF anterior à onda D). */
export function idiomaDoCaminhoPdf(path: string | null | undefined): AppLocale {
  const achado = MARCA_DO_IDIOMA.exec(String(path ?? ''));
  return achado ? (achado[1] as AppLocale) : defaultLocale;
}

async function localeDoColaborador(empresaId: string, colaboradorId: string | null | undefined): Promise<string | null> {
  if (!empresaId || !colaboradorId) return null;
  try {
    const { data, error } = await tenantDb(empresaId).from('colaboradores')
      .select('locale').eq('id', colaboradorId).maybeSingle();
    if (error) {
      console.warn('[pdf-locale] leitura do idioma da pessoa falhou; segue com o da empresa:', error.message);
      return null;
    }
    return (data as { locale?: string | null } | null)?.locale ?? null;
  } catch (e: any) {
    console.warn('[pdf-locale] leitura do idioma da pessoa lançou; segue com o da empresa:', e?.message || e);
    return null;
  }
}

async function localeDaEmpresa(empresaId: string | null | undefined): Promise<string | null> {
  if (!empresaId) return null;
  try {
    const { data, error } = await tenantDb(empresaId).raw.from('empresas')
      .select('default_locale').eq('id', empresaId).maybeSingle();
    if (error) {
      console.warn('[pdf-locale] leitura do idioma da empresa falhou; segue em pt-BR:', error.message);
      return null;
    }
    return (data as { default_locale?: string | null } | null)?.default_locale ?? null;
  } catch (e: any) {
    console.warn('[pdf-locale] leitura do idioma da empresa lançou; segue em pt-BR:', e?.message || e);
    return null;
  }
}

/**
 * Idioma de uma pessoa do tenant: o dela, senão o da empresa, senão pt-BR.
 *
 * `localeDaEmpresa` é para quem JÁ leu `empresas.default_locale` na mesma rota (as
 * rotas de PDF leem a empresa para o nome do arquivo): passa o valor, mesmo `null`,
 * e a leitura não se repete.
 */
export async function idiomaDaPessoa(
  empresaId: string,
  colaboradorId: string | null | undefined,
  opcoes: { localeDaEmpresa?: string | null } = {},
): Promise<AppLocale> {
  const empresaJaLida = 'localeDaEmpresa' in opcoes;
  const [daPessoa, daEmpresa] = await Promise.all([
    localeDoColaborador(empresaId, colaboradorId),
    empresaJaLida ? Promise.resolve(opcoes.localeDaEmpresa ?? null) : localeDaEmpresa(empresaId),
  ]);
  return resolveAppLocale(daPessoa, daEmpresa);
}

/**
 * Idioma de quem está baixando. A sessão do admin da plataforma não tem cadastro
 * no tenant do relatório: nesse caso vale o idioma da empresa do relatório.
 */
export async function idiomaDoLeitor(
  auth: { colaborador?: { id?: string | null; empresa_id?: string | null } | null } | null | undefined,
  empresaIdDoRelatorio: string,
  opcoes: { localeDaEmpresa?: string | null } = {},
): Promise<AppLocale> {
  const colab = auth?.colaborador;
  // Só vale o cadastro do leitor no tenant do relatório (um admin pode ter cadastro em outra empresa).
  const idDoLeitor = colab?.id && (!colab.empresa_id || colab.empresa_id === empresaIdDoRelatorio) ? colab.id : null;
  return idiomaDaPessoa(empresaIdDoRelatorio, idDoLeitor, opcoes);
}
