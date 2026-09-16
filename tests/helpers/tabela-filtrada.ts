import { criarSupabaseMock, type Chamada, type SupabaseMock } from './supabase-mock';

/**
 * Mock que responde pela TABELA FILTRADA de verdade, não por "a cadeia chamou
 * `.eq('cargo')`": esquecer um filtro devolve linhas a mais, que é exatamente o
 * defeito de leitura por nome/código sem cargo. E devolve SÓ as colunas do select,
 * como o PostgREST — com a linha inteira, um select que esquece `cargo` passa verde
 * (medido por mutação em 16/09/2026: 3 sites sem a coluna, 0 testes vermelhos).
 *
 * Cobre o que as leituras de matriz/conteúdo usam: eq, neq, in, is, not.is.null,
 * ilike (igualdade sem caixa, com % e _ como curinga) e `or` no formato
 * `col.op.valor` com `eq`, `neq`, `is` e `in.(a,b)` — operador fora disso LANÇA,
 * para o teste não passar filtrando de menos. `order`/`limit`/`range` não mudam
 * QUEM volta e ficam de fora — a ordem é a da fixture.
 */

function casaIlike(valor: unknown, padrao: string): boolean {
  const re = new RegExp(`^${String(padrao).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');
  return re.test(String(valor ?? ''));
}

/** Divide `a.eq.1,b.in.(x,y)` nas vírgulas de fora dos parênteses. */
function partesDoOr(expr: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let nivel = 0;
  for (const ch of expr) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(atual); atual = ''; continue; }
    atual += ch;
  }
  if (atual) partes.push(atual);
  return partes;
}

function casaCondicaoOr(linha: any, cond: string): boolean {
  const [col, op, ...resto] = cond.split('.');
  const valor = resto.join('.');
  if (op === 'eq') return String(linha[col]) === valor;
  // Como o Postgres: NULL `neq` qualquer coisa não é verdadeiro.
  if (op === 'neq') return linha[col] != null && String(linha[col]) !== valor;
  if (op === 'is') return valor === 'null' ? linha[col] == null : String(linha[col]) === valor;
  if (op === 'in') return valor.replace(/^\(|\)$/g, '').split(',').includes(String(linha[col]));
  throw new Error(`tabela-filtrada: operador de .or() não suportado: ${cond}`);
}

export function aplicarFiltros(linhas: any[], cadeia: Chamada[]): any[] {
  return cadeia.reduce((acc, { metodo, args: [col, a, b] }) => {
    if (metodo === 'eq') return acc.filter((l) => l[col] === a);
    if (metodo === 'neq') return acc.filter((l) => l[col] !== a);
    if (metodo === 'in') return acc.filter((l) => (a as any[]).includes(l[col]));
    if (metodo === 'is') return acc.filter((l) => (a === null ? l[col] == null : l[col] === a));
    if (metodo === 'not' && a === 'is' && b === null) return acc.filter((l) => l[col] != null);
    if (metodo === 'ilike') return acc.filter((l) => casaIlike(l[col], a));
    if (metodo === 'or') return acc.filter((l) => partesDoOr(String(col)).some((c) => casaCondicaoOr(l, c)));
    // Como o Postgres: comparação com NULL não é verdadeira, a linha sai.
    if (metodo === 'lte') return acc.filter((l) => l[col] != null && l[col] <= a);
    if (metodo === 'gte') return acc.filter((l) => l[col] != null && l[col] >= a);
    return acc;
  }, linhas);
}

export function projetarColunas(linhas: any[], cols: string): any[] {
  if (!cols || cols.trim() === '*' || cols.includes('(')) return linhas;
  const campos = cols.split(',').map((c) => c.trim()).filter(Boolean);
  return linhas.map((l) => Object.fromEntries(campos.filter((c) => c in l).map((c) => [c, l[c]])));
}

/** `tabelas()` é lido a cada consulta: o teste pode trocar a fixture entre chamadas. */
export function criarMockDeTabelas(tabelas: () => Record<string, any[]>): SupabaseMock {
  return criarSupabaseMock({
    lista: (t, cols, cadeia) => projetarColunas(aplicarFiltros(tabelas()[t] || [], cadeia), cols),
    resolver: (t, cols, cadeia) => projetarColunas(aplicarFiltros(tabelas()[t] || [], cadeia), cols)[0] ?? null,
  });
}
