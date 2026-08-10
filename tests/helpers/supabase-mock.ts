import { vi } from 'vitest';

/**
 * Mock encadeável do supabase-js **que sabe falhar**.
 *
 * POR QUE ESTE ARQUIVO EXISTE (F16 da auditoria de 09-10/08/2026):
 * medido em 10/08, **31 de 40** arquivos de teste com mock de Supabase hardcodam
 * `error: null` nos quatro métodos — nenhum deles consegue exercitar o ramo de
 * erro. E o `CLAUDE.md` apontava um desses arquivos como O MODELO a copiar. Ou
 * seja: a suíte garantia que a classe nº 1 do "NÃO fazer" do próprio CLAUDE.md
 * — *"NÃO confiar em try/catch para erro de query do supabase-js: ele RETORNA
 * `{ error }`, não lança"* — nascesse verde.
 *
 * Um teste que nunca viu `error` não-nulo não prova que o código checa `error`.
 * Prova que o caminho feliz funciona, e chama isso de cobertura.
 *
 * USO
 * ---
 *   const sb = criarSupabaseMock({
 *     resolver: (tabela) => (tabela === 'trilhas' ? { id: 'tr1' } : null),
 *   });
 *   vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
 *
 *   // e no teste que exercita a falha:
 *   sb.falharEm({ tabela: 'trilhas', op: 'update', mensagem: 'timeout no pool' });
 *
 * `sb.escritas` guarda o que foi gravado — para provar que uma falha de gate
 * impediu a escrita, e não só mudou a mensagem de retorno.
 */

export type Operacao = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export interface FalhaSpec {
  /** Se omitido, vale para qualquer tabela. */
  tabela?: string;
  /** Se omitido, vale para qualquer operação. */
  op?: Operacao;
  mensagem: string;
  /** Código Postgres, quando o código sob teste distingue (ex. '23505'). */
  code?: string;
}

export interface Escrita {
  tabela: string;
  op: Operacao;
  payload: any;
}

export interface SupabaseMock {
  client: any;
  escritas: Escrita[];
  falhas: FalhaSpec[];
  /** Programa uma falha. Pode ser chamada dentro do `it`, depois do `vi.mock`. */
  falharEm(spec: FalhaSpec): void;
  reset(): void;
}

export interface OpcoesMock {
  /** `data` de `.maybeSingle()` / `.single()`, por tabela e colunas do select. */
  resolver?: (tabela: string, cols: string) => any;
  /** `data` quando a cadeia é aguardada direto (lista). Default: `[]`. */
  lista?: (tabela: string, cols: string) => any[];
  /** `count` devolvido quando o select pede `{ count: 'exact' }`. */
  contagem?: (tabela: string) => number | null;
  falhas?: FalhaSpec[];
}

export function criarSupabaseMock(opts: OpcoesMock = {}): SupabaseMock {
  const escritas: Escrita[] = [];
  const falhas: FalhaSpec[] = [...(opts.falhas || [])];

  const resolver = opts.resolver || (() => null);
  const lista = opts.lista || (() => []);
  const contagem = opts.contagem || (() => null);

  const acharFalha = (tabela: string, op: Operacao): FalhaSpec | null =>
    falhas.find((f) => (!f.tabela || f.tabela === tabela) && (!f.op || f.op === op)) || null;

  const erroDe = (f: FalhaSpec) => ({ message: f.mensagem, code: f.code ?? null, details: null, hint: null });

  const from = (tabela: string) => {
    let cols = '';
    let op: Operacao = 'select';
    let querCount = false;
    let payload: any = null;

    const resultadoLista = () => {
      const f = acharFalha(tabela, op);
      if (f) return { data: null, error: erroDe(f), count: null };
      if (op !== 'select') {
        escritas.push({ tabela, op, payload });
        return { data: null, error: null, count: null };
      }
      return { data: lista(tabela, cols), error: null, count: querCount ? contagem(tabela) : null };
    };

    const b: any = {
      select: (c = '', o?: any) => { cols = c; querCount = Boolean(o?.count); return b; },
      insert: (p: any) => { op = 'insert'; payload = p; return b; },
      update: (p: any) => { op = 'update'; payload = p; return b; },
      upsert: (p: any, _o?: any) => { op = 'upsert'; payload = p; return b; },
      delete: () => { op = 'delete'; return b; },

      eq: () => b, neq: () => b, gt: () => b, gte: () => b, lt: () => b, lte: () => b,
      is: () => b, not: () => b, or: () => b, in: () => b, ilike: () => b, like: () => b,
      contains: () => b, order: () => b, limit: () => b, range: () => b, filter: () => b,

      maybeSingle: async () => {
        const f = acharFalha(tabela, op);
        if (f) return { data: null, error: erroDe(f) };
        if (op !== 'select') { escritas.push({ tabela, op, payload }); return { data: payload, error: null }; }
        return { data: resolver(tabela, cols), error: null };
      },
      single: async () => {
        const f = acharFalha(tabela, op);
        if (f) return { data: null, error: erroDe(f) };
        if (op !== 'select') { escritas.push({ tabela, op, payload }); return { data: payload, error: null }; }
        return { data: resolver(tabela, cols), error: null };
      },
      // `await sb.from(x).select()` sem terminador: a cadeia é thenable.
      then: (resolve: any, reject: any) => Promise.resolve(resultadoLista()).then(resolve, reject),
    };
    return b;
  };

  const storage = {
    from: () => ({
      upload: vi.fn(async () => {
        const f = acharFalha('__storage__', 'insert');
        return f ? { data: null, error: erroDe(f) } : { data: { path: 'ok' }, error: null };
      }),
      download: vi.fn(async () => ({ data: null, error: { message: 'sem cache' } })),
      list: vi.fn(async () => ({ data: [], error: null })),
      remove: vi.fn(async () => ({ data: null, error: null })),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://mock/${p}` } }),
      createSignedUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://signed/${p}` }, error: null })),
    }),
  };

  const client: any = { from, storage, rpc: vi.fn(async () => ({ data: null, error: null })) };

  return {
    client,
    escritas,
    falhas,
    falharEm(spec: FalhaSpec) { falhas.push(spec); },
    reset() { escritas.length = 0; falhas.length = 0; },
  };
}
