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
  /**
   * Filtro pelo PAYLOAD da escrita — para falhar em uma escrita específica
   * quando a mesma (tabela, op) acontece mais de uma vez no fluxo.
   *
   * Nasceu no B5 (24/08): `/api/chat` insere DUAS linhas em `mensagens_chat` por
   * turno (a do usuário e a do assistente), com destinos opostos — a do usuário
   * é idempotente e trata `23505` como "já gravei", a do assistente é crítica.
   * Sem este filtro, programar a falha do turno derrubava também a resposta, e o
   * teste media outra coisa que não a invariante que descreve.
   */
  quando?: (payload: any) => boolean;
}

export interface Escrita {
  tabela: string;
  op: Operacao;
  payload: any;
}

/**
 * Um elo da cadeia, registrado: `.eq('empresa_id', x)`, `.order('em', {…})`, …
 *
 * Existe porque várias invariantes desta base não estão no dado que volta, e sim
 * na PERGUNTA feita: "filtrou por empresa_id?", "pediu DESC?", "limitou às linhas
 * sem dono?". Sem registrar a cadeia, um teste sobre isso só pode afirmar que a
 * função não explodiu.
 */
export interface Chamada {
  tabela: string;
  metodo: string;
  args: any[];
}

export interface SupabaseMock {
  client: any;
  escritas: Escrita[];
  /** Todos os elos encadeados, na ordem em que foram chamados. */
  chamadas: Chamada[];
  falhas: FalhaSpec[];
  /** Programa uma falha. Pode ser chamada dentro do `it`, depois do `vi.mock`. */
  falharEm(spec: FalhaSpec): void;
  /** Houve `.metodo(arg0, …)` nesta tabela? Ex.: `usou('colaboradores', 'eq', 'empresa_id')`. */
  usou(tabela: string, metodo: string, arg0?: any): boolean;
  reset(): void;
}

export interface OpcoesMock {
  /** `data` de `.maybeSingle()` / `.single()`, por tabela e colunas do select. */
  resolver?: (tabela: string, cols: string) => any;
  /** `data` quando a cadeia é aguardada direto (lista). Default: `[]`. */
  lista?: (tabela: string, cols: string) => any[];
  /** `count` devolvido quando o select pede `{ count: 'exact' }`. */
  contagem?: (tabela: string) => number | null;
  /**
   * `data` de uma ESCRITA com `.select()` — as linhas afetadas.
   *
   * Default `null` (o comportamento histórico). Programar isto é o que permite
   * distinguir "o update casou linhas" de "o update não casou nada e voltou
   * `error: null`" — que é falha silenciosa, não sucesso.
   */
  escrita?: (tabela: string, op: Operacao, payload: any) => any[] | null;
  falhas?: FalhaSpec[];
}

export function criarSupabaseMock(opts: OpcoesMock = {}): SupabaseMock {
  const escritas: Escrita[] = [];
  const chamadas: Chamada[] = [];
  const falhas: FalhaSpec[] = [...(opts.falhas || [])];

  const resolver = opts.resolver || (() => null);
  const lista = opts.lista || (() => []);
  const contagem = opts.contagem || (() => null);
  const escrita = opts.escrita || (() => null);

  const acharFalha = (tabela: string, op: Operacao, payload?: any): FalhaSpec | null =>
    falhas.find(
      (f) =>
        (!f.tabela || f.tabela === tabela) &&
        (!f.op || f.op === op) &&
        (!f.quando || f.quando(payload)),
    ) || null;

  const erroDe = (f: FalhaSpec) => ({ message: f.mensagem, code: f.code ?? null, details: null, hint: null });

  const from = (tabela: string) => {
    let cols = '';
    let op: Operacao = 'select';
    let querCount = false;
    let payload: any = null;

    const registrar = (metodo: string, args: any[]) => { chamadas.push({ tabela, metodo, args }); };

    const resultadoLista = () => {
      const f = acharFalha(tabela, op, payload);
      if (f) return { data: null, error: erroDe(f), count: null };
      if (op !== 'select') {
        escritas.push({ tabela, op, payload });
        return { data: escrita(tabela, op, payload), error: null, count: null };
      }
      return { data: lista(tabela, cols), error: null, count: querCount ? contagem(tabela) : null };
    };

    const filtro = (nome: string) => (...args: any[]) => { registrar(nome, args); return b; };

    const b: any = {
      select: (c = '', o?: any) => { cols = c; querCount = Boolean(o?.count); registrar('select', [c, o]); return b; },
      insert: (p: any) => { op = 'insert'; payload = p; registrar('insert', [p]); return b; },
      update: (p: any) => { op = 'update'; payload = p; registrar('update', [p]); return b; },
      upsert: (p: any, o?: any) => { op = 'upsert'; payload = p; registrar('upsert', [p, o]); return b; },
      delete: () => { op = 'delete'; registrar('delete', []); return b; },

      eq: filtro('eq'), neq: filtro('neq'), gt: filtro('gt'), gte: filtro('gte'),
      lt: filtro('lt'), lte: filtro('lte'), is: filtro('is'), not: filtro('not'),
      or: filtro('or'), in: filtro('in'), ilike: filtro('ilike'), like: filtro('like'),
      contains: filtro('contains'), order: filtro('order'), limit: filtro('limit'),
      range: filtro('range'), filter: filtro('filter'),

      maybeSingle: async () => {
        const f = acharFalha(tabela, op, payload);
        if (f) return { data: null, error: erroDe(f) };
        if (op !== 'select') { escritas.push({ tabela, op, payload }); return { data: payload, error: null }; }
        return { data: resolver(tabela, cols), error: null };
      },
      single: async () => {
        const f = acharFalha(tabela, op, payload);
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
    chamadas,
    falhas,
    falharEm(spec: FalhaSpec) { falhas.push(spec); },
    usou(tabela: string, metodo: string, arg0?: any) {
      return chamadas.some(
        (c) => c.tabela === tabela && c.metodo === metodo && (arg0 === undefined || c.args[0] === arg0),
      );
    },
    reset() { escritas.length = 0; chamadas.length = 0; falhas.length = 0; },
  };
}
