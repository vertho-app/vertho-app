/**
 * Tabelas em memória sobre o `criarSupabaseMock` oficial (27/09/2026).
 *
 * O mock oficial registra a cadeia de cada query e deixa a resposta com quem
 * testa. Aqui a resposta é CALCULADA a partir dela: filtros (`eq`, `neq`, `in`,
 * `is`, `gte`, `not like`), ordem, `limit`/`range` e a projeção do `select`,
 * inclusive caminhos JSON (`estado->>status`, `alias:estado->relatorio->nota`).
 * Updates atingem só as linhas que a cadeia da escrita casa.
 *
 * Nasceu porque o mock à mão de `recepcao-service.test.ts` tinha `limit: () => q`,
 * que ignorava o argumento: com ele, "o histórico lê só 20 sessões" não era
 * observável em teste nenhum. A regra de ouro do mock oficial vale aqui também:
 * `sb.falharEm(...)` programa erro de verdade.
 */
import { criarSupabaseMock, type Chamada, type SupabaseMock } from './supabase-mock';

export type Tabelas = Record<string, any[]>;

/** Valor de uma coluna, com caminho JSON: `estado->cenario->publico->>titulo`. */
export function valorDaColuna(linha: any, coluna: string): any {
  const partes = coluna.split(/(->>|->)/);
  let v = linha?.[partes[0].trim()];
  let texto = false;
  for (let i = 1; i < partes.length; i += 2) {
    texto = partes[i] === '->>';
    const chave = partes[i + 1].trim();
    v = v == null ? null : v[/^\d+$/.test(chave) && Array.isArray(v) ? Number(chave) : chave];
  }
  if (v === undefined) v = null;
  if (texto && v !== null && typeof v !== 'string') v = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return v;
}

function comoLike(padrao: string) {
  return new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`);
}

/** Divide `a,b,and(c,d)` nas vírgulas de nível zero. */
function dividir(s: string): string[] {
  const partes: string[] = [];
  let nivel = 0, atual = '';
  for (const ch of s) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(atual); atual = ''; } else atual += ch;
  }
  if (atual) partes.push(atual);
  return partes.map((p) => p.trim());
}
/** Um termo do `.or()` do PostgREST: `col.eq.v`, `col.neq.v`, `col.is.null`, `and(...)`, `or(...)`. */
function termoCasa(linha: any, termo: string): boolean {
  const grupo = /^(and|or)\((.*)\)$/.exec(termo);
  if (grupo) {
    const partes = dividir(grupo[2]);
    return grupo[1] === 'and' ? partes.every((p) => termoCasa(linha, p)) : partes.some((p) => termoCasa(linha, p));
  }
  const [col, op, ...resto] = termo.split('.');
  const valor = resto.join('.');
  const atual = valorDaColuna(linha, col);
  if (op === 'eq') return atual !== null && String(atual) === valor;
  if (op === 'neq') return atual !== null && String(atual) !== valor;
  if (op === 'is') return valor === 'null' ? atual === null : String(atual) === valor;
  throw new Error(`or(): operador ${op} sem suporte em tabelas-em-memoria`);
}

/** As linhas que a cadeia casa (sem ordem, limite nem projeção). */
export function filtrar(linhas: any[], cadeia: Chamada[]) {
  return linhas.filter((l) =>
    cadeia.every(({ metodo, args }) => {
      const [col, v, extra] = args;
      const atual = () => valorDaColuna(l, col);
      switch (metodo) {
        case 'eq':
          // Como no Postgres: NULL não é igual a nada; o texto de `->>` compara como texto.
          return atual() !== null && String(atual()) === String(v);
        case 'neq':
          return atual() !== null && String(atual()) !== String(v);
        case 'in':
          return (v as any[]).map(String).includes(String(atual()));
        case 'is':
          return v === null ? atual() === null : atual() === v;
        case 'gte':
          return atual() !== null && String(atual()) >= String(v);
        case 'lt':
          return atual() !== null && String(atual()) < String(v);
        case 'not':
          if (v === 'like') return !comoLike(extra).test(String(atual() ?? ''));
          if (v === 'is') return atual() !== extra;
          throw new Error(`not.${v} sem suporte em tabelas-em-memoria`);
        case 'or':
          return dividir(String(col)).some((t) => termoCasa(l, t));
        default:
          return true;
      }
    }),
  );
}

function ordenarLimitar(linhas: any[], cadeia: Chamada[]) {
  const ordens = cadeia.filter((c) => c.metodo === 'order');
  let saida = [...linhas].sort((a, b) => {
    for (const { args: [col, opt] } of ordens) {
      const x = valorDaColuna(a, col), y = valorDaColuna(b, col);
      if (x === y) continue;
      const r = x == null ? 1 : y == null ? -1 : x < y ? -1 : 1;
      return opt?.ascending === false ? -r : r;
    }
    return 0;
  });
  for (const c of cadeia) {
    if (c.metodo === 'range') saida = saida.slice(c.args[0], c.args[1] + 1);
    if (c.metodo === 'limit') saida = saida.slice(0, c.args[0]);
  }
  return saida;
}

/** Projeção do PostgREST: `*`, colunas, `alias:coluna` e caminhos JSON (nome = última chave). */
export function projetar(linha: any, cols: string) {
  const itens = (cols || '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (itens.includes('*')) return structuredClone(linha);
  const out: Record<string, any> = {};
  for (const item of itens) {
    const m = /^([A-Za-z_][\w]*):(.+)$/.exec(item);
    const caminho = m ? m[2] : item;
    const nome = m ? m[1] : caminho.split(/->>|->/).at(-1)!.trim();
    out[nome] = structuredClone(valorDaColuna(linha, caminho));
  }
  return out;
}

export interface BancoEmMemoria extends SupabaseMock {
  tabelas: Tabelas;
  /** As colunas pedidas em cada `select` de uma tabela, na ordem. */
  selects(tabela: string): string[];
}

/**
 * `padroes`: colunas com DEFAULT no banco, por tabela (ex.: `revisao: 0`, `created_at`),
 * aplicadas no insert antes do payload.
 */
export function bancoEmMemoria(tabelas: Tabelas, padroes: Record<string, () => Record<string, unknown>> = {}): BancoEmMemoria {
  const t = (nome: string) => (tabelas[nome] ||= []);
  const sb = criarSupabaseMock({
    resolver: (tabela, cols, cadeia) => {
      const linha = ordenarLimitar(filtrar(t(tabela), cadeia), cadeia)[0];
      return linha ? projetar(linha, cols) : null;
    },
    lista: (tabela, cols, cadeia) => ordenarLimitar(filtrar(t(tabela), cadeia), cadeia).map((l) => projetar(l, cols)),
    escrita: (tabela, op, payload, cadeia) => {
      if (op === 'insert') {
        for (const p of Array.isArray(payload) ? payload : [payload])
          t(tabela).push({ ...(padroes[tabela]?.() ?? {}), ...structuredClone(p) });
        return null;
      }
      if (op === 'update') {
        const alvo = filtrar(t(tabela), cadeia);
        for (const l of alvo) Object.assign(l, structuredClone(payload));
        return alvo.map((l) => structuredClone(l));
      }
      if (op === 'delete') {
        const alvo = new Set(filtrar(t(tabela), cadeia));
        tabelas[tabela] = t(tabela).filter((l) => !alvo.has(l));
        return null;
      }
      return null;
    },
  });
  return Object.assign(sb, {
    tabelas,
    selects: (tabela: string) => sb.chamadas.filter((c) => c.tabela === tabela && c.metodo === 'select').map((c) => String(c.args[0] ?? '*')),
  });
}
