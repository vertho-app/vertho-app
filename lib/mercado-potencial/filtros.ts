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
 * primeiro (`%` e `_` literais), depois a barra e a aspa para a string entre
 * aspas do PostgREST, que desfaz esse nível de escape antes de entregar o padrão
 * ao ILIKE.
 */
export function orDeCidades(termos: string[]): string {
  return termos
    .map((t) => `municipio.ilike."%${escaparLike(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`)
    .join(',');
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
