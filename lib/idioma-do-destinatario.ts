import type { AppLocale } from '@/i18n/routing';
import { normalizeAppLocale, resolveAppLocale } from '@/lib/i18n';

/**
 * O idioma em que cada PESSOA de uma empresa lê o e-mail (Onda D, 04/10/2026).
 *
 * A régua é a do app inteiro (`actions/certificado.ts`, `app/api/me`): o idioma da
 * pessoa (`colaboradores.locale`), senão o padrão da empresa
 * (`empresas.default_locale`), senão pt-BR. Aqui ela é calculada para a empresa
 * TODA de uma vez, porque quem manda e-mail em lote (a cadência semanal e os
 * disparos do admin) não tem request nem sessão para perguntar pessoa a pessoa.
 *
 * Duas leituras por empresa, não por pessoa:
 *  - `empresas.default_locale`, uma linha;
 *  - `colaboradores` SÓ de quem tem idioma próprio (`locale` não nulo). A maioria
 *    vem nula e herda o da empresa, então a leitura é pequena; e não há `.in(...)`
 *    com a lista de ids, que estoura o tamanho da URL em empresa grande.
 *
 * A leitura de colaboradores é PAGINADA: o PostgREST corta em 1.000 linhas, e
 * aqui "não apareceu na lista" significaria "usa o idioma da empresa", em
 * silêncio, para quem passou do corte.
 *
 * Falha de leitura NUNCA lança: o e-mail sai no que se conseguiu resolver (o
 * padrão da empresa ou pt-BR, que é o que saía antes da onda) e `falhou` fica
 * `true`, para quem chama tornar o fallback visível (`registrarDegradacao` na
 * cadência, aviso na tela do admin). Fallback pode existir, nunca invisível.
 *
 * `sb` é um client que já respeita o tenant ou que recebe o `empresaId` aqui: a
 * leitura de `colaboradores` leva `.eq('empresa_id', empresaId)`.
 */

const POR_PAGINA = 1000;

export interface IdiomasDaEmpresa {
  /** O padrão da empresa, ou null quando a coluna veio vazia ou a leitura falhou. */
  padrao: AppLocale | null;
  /** O idioma de UMA pessoa: o dela, senão o da empresa, senão pt-BR. */
  de(colaboradorId: string | null | undefined): AppLocale;
  /** Alguma leitura falhou: o idioma pode ser menos específico do que o cadastro. */
  falhou: boolean;
  /** O motivo da primeira falha, para o registro. */
  motivo?: string;
}

export async function carregarIdiomasDaEmpresa(sb: any, empresaId: string): Promise<IdiomasDaEmpresa> {
  let falhou = false;
  let motivo: string | undefined;
  let padrao: AppLocale | null = null;
  const proprios = new Map<string, string>();
  const falha = (m: string) => { if (!falhou) { falhou = true; motivo = m; } };

  try {
    const { data, error } = await sb.from('empresas').select('default_locale').eq('id', empresaId).maybeSingle();
    if (error) falha(`empresas: ${error.message}`);
    else padrao = normalizeAppLocale(data?.default_locale);
  } catch (e: any) {
    falha(`empresas: ${e?.message || e}`);
  }

  try {
    for (let de = 0; ; de += POR_PAGINA) {
      const { data, error } = await sb.from('colaboradores')
        .select('id, locale')
        .eq('empresa_id', empresaId)
        .not('locale', 'is', null)
        .order('id', { ascending: true })
        .range(de, de + POR_PAGINA - 1);
      if (error) { falha(`colaboradores: ${error.message}`); break; }
      for (const c of (data || []) as Array<{ id: string; locale: string | null }>) {
        if (c.locale) proprios.set(c.id, c.locale);
      }
      if (!data || data.length < POR_PAGINA) break;
    }
  } catch (e: any) {
    falha(`colaboradores: ${e?.message || e}`);
  }

  return {
    padrao,
    falhou,
    motivo,
    de: (colaboradorId) => resolveAppLocale(colaboradorId ? proprios.get(colaboradorId) : null, padrao),
  };
}
