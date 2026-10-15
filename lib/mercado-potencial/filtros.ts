import { REGIOES_METROPOLITANAS } from '@/lib/mercado-potencial/regioes-metropolitanas';
import { valorDeFiltro } from '@/lib/postgrest-valor';
import { escaparLike } from '@/lib/sql-like';

/**
 * Peças puras dos filtros da tela Mercado Potencial. Vivem aqui (e não no
 * `actions.ts`) porque um arquivo `'use server'` só exporta ação: tudo o que é
 * exportado vira endpoint HTTP.
 */

/** Teto de cidades numa busca: o `or` vai na URL do PostgREST. */
export const MAX_CIDADES_BUSCA = 30;

/** Teto de um mínimo (professores, gestores): cabe em int4 com folga. */
const TETO_MINIMO = 1_000_000_000;

/**
 * "campinas, salvador" -> ['campinas', 'salvador']. Separa por vírgula ou
 * ponto e vírgula (nome de município não tem nenhum dos dois), tira vazios e
 * repetidos (sem diferenciar maiúscula) e respeita o teto.
 */
export function termosDeCidade(busca?: string | null): string[] {
  const vistos = new Set<string>();
  const termos: string[] = [];
  for (const bruto of String(busca ?? '').split(/[,;]/)) {
    const termo = bruto.trim();
    const chave = termo.toLowerCase();
    if (!termo || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push(termo);
    if (termos.length >= MAX_CIDADES_BUSCA) break;
  }
  return termos;
}

/**
 * Valor do `.or()` do PostgREST para 2+ cidades: `municipio.ilike."%a%",municipio.ilike."%b%"`.
 *
 * O valor vai ENTRE ASPAS porque `,` `.` `:` `(` `)` são sintaxe do `or` e um nome
 * com qualquer um deles (ex.: "Sta. Maria") quebraria a expressão. `escaparLike`
 * primeiro (`%` e `_` literais), depois `valorDeFiltro` (aspas, com a barra e a
 * aspa escapadas para a string do PostgREST, que desfaz esse nível de escape
 * antes de entregar o padrão ao ILIKE).
 */
export function orDeCidades(termos: string[]): string {
  return termos.map((t) => `municipio.ilike.${valorDeFiltro(`%${escaparLike(t)}%`)}`).join(',');
}

const MUNICIPIOS_POR_REGIAO = new Map(REGIOES_METROPOLITANAS.map((r) => [r.id, r.municipios]));

/**
 * Regiões escolhidas (ids IBGE de RM/RIDE) -> códigos `municipio_ibge` da UNIÃO
 * delas, para um `.in('municipio_ibge', …)`.
 *
 * `null` = filtro não pedido (ausente, não-lista ou lista vazia): não filtra.
 * Id que não existe é ignorado, e se TODOS forem desconhecidos o resultado é
 * `[]`, que no banco é "nenhuma linha" (medido no PostgREST real nas 3 visões):
 * pedir uma região que não existe não pode devolver o mercado inteiro.
 * A lista vem do cliente, então a leitura é limitada ao número de regiões que existem.
 */
export function municipiosDasRegioes(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const uniao = new Set<string>();
  for (const id of ids.slice(0, REGIOES_METROPOLITANAS.length)) {
    for (const codigo of (typeof id === 'string' ? MUNICIPIOS_POR_REGIAO.get(id) : undefined) ?? []) uniao.add(codigo);
  }
  return [...uniao];
}

/**
 * Mínimo vindo do cliente (a action é endpoint HTTP): só número finito > 0 vira
 * filtro. Fração sobe para o inteiro seguinte (a coluna é inteira, e `>= 12.5`
 * num bigint dá 22P02; para inteiros, `>= 12.5` é `>= 13`). Acima do teto, o
 * teto: um `1e308` estouraria o int do banco e viraria erro 22003 na tela.
 */
export function corteDeMinimo(valor: unknown): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.ceil(n), TETO_MINIMO);
}

/**
 * Teto de linhas de uma consulta: o `limit` pedido na tela (do cliente, então
 * saneado como os mínimos: só inteiro > 0), senão o padrão da visão, e nunca
 * acima do teto dela (protege o navegador).
 */
export function limiteDaConsulta(pedido: unknown, padrao: number, teto: number): number {
  return Math.min(corteDeMinimo(pedido) ?? padrao, teto);
}

/**
 * O que a tela precisa saber sobre o que foi lido: quantas linhas vieram, quantas
 * existem no banco para esses filtros (`count` exato da primeira página, `null` se
 * não veio) e se o teto CORTOU algo. Sem o total, o corte só se adivinha pelo teto
 * ter sido atingido.
 */
export function resumoDaLeitura(lidas: number, totalNoBanco: number | null | undefined, limite: number) {
  const total = typeof totalNoBanco === 'number' ? totalNoBanco : null;
  return { total: lidas, totalNoBanco: total, truncado: total != null ? total > lidas : lidas >= limite };
}

/**
 * Onde o "gestores >= N" se aplica em cada visão.
 *
 * Município e rede: a MV já traz `qt_gestores` (a soma, mig 093/094/095).
 *
 * Escola: a MV NÃO tem `qt_gestores`; a tela soma `qt_coord_pedag +
 * qt_diretor_proxy` em JS. O proxy de diretor é a CONSTANTE 1 em toda escola
 * (`1 AS qt_diretor_proxy`, mig 093 e 094; medido 15/10/2026: min = max = 1 em
 * 210.694 linhas), então `coord + 1 >= N` é `coord >= N - 1`, exato e no banco.
 * Se o proxy deixar de ser constante, a conta muda: o guard
 * `mercado-potencial-filtros-cidade-gestores.test.ts` olha as migrations.
 */
export const GESTORES_NA_MV = { coluna: 'qt_gestores', diretorProxy: 0 } as const;
export const GESTORES_NA_ESCOLA = { coluna: 'qt_coord_pedag', diretorProxy: 1 } as const;
export type ColunaGestores = typeof GESTORES_NA_MV | typeof GESTORES_NA_ESCOLA;
