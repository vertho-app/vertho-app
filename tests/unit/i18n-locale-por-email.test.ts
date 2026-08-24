import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B13 (auditoria de 22/08) — `getLocaleForEmail` resolvia colaborador com
 * `.eq('email')` sem escopo de tenant, e `.limit(1)` sem `order` por cima.
 *
 * Para quem existe em 2+ empresas, **qual linha responde é escolha do planner**.
 * `Medido em 24/08:` os 3 platform admins têm cadastro em 2 a 4 empresas — não
 * é hipótese, é o caso comum de quem administra.
 *
 * O sintoma aqui é barato (interface no idioma da empresa errada; o app roda
 * pt-BR e pt-PT desde a mig 114), mas o cookie gravado dura **1 ano**. E o valor
 * de fechar é tirar da base mais uma cópia da régua errada: o mesmo
 * `.eq('email')` sem tenant, noutro consumidor, decide AUTORIZAÇÃO.
 */

const mocks = vi.hoisted(() => ({
  /** O que `findColabByEmail` devolve. */
  colab: null as any,
  /** Chamadas recebidas: [email, selectCols]. */
  chamadas: [] as Array<[string, string | undefined]>,
  /** Faz o resolvedor LANCAR (rede caiu no meio do login). */
  lanca: false,
}));

vi.mock('@/lib/authz', () => ({
  findColabByEmail: async (email: string, cols?: string) => {
    mocks.chamadas.push([email, cols]);
    if (mocks.lanca) throw new Error('conexao perdida');
    return mocks.colab;
  },
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('não devia consultar direto'); } }));

async function locale(email: string | null | undefined) {
  const mod = await import('@/lib/i18n-server');
  return mod.getLocaleForEmail(email);
}

beforeEach(() => {
  mocks.colab = null;
  mocks.chamadas = [];
  mocks.lanca = false;
});

describe('B13 · getLocaleForEmail respeita o tenant', () => {
  it('🔴 resolve pelo `findColabByEmail`, não por `.eq(email)` cru', async () => {
    mocks.colab = { locale: 'pt-BR', empresa_id: 'e1', empresas: { default_locale: 'pt-PT' } };

    await locale('ana@x.com');

    expect(
      mocks.chamadas.length,
      'não passou pelo resolvedor que escopa o tenant — é o `.eq(email)` sem escopo de volta',
    ).toBe(1);
    expect(mocks.chamadas[0][0]).toBe('ana@x.com');
    expect(mocks.chamadas[0][1], 'precisa pedir locale + o default da empresa na mesma consulta')
      .toMatch(/locale/);
  });

  it('o locale da PESSOA vence o da empresa', async () => {
    mocks.colab = { locale: 'pt-PT', empresas: { default_locale: 'pt-BR' } };
    expect(await locale('ana@x.com')).toBe('pt-PT');
  });

  it('sem locale próprio, cai no default da empresa dela', async () => {
    mocks.colab = { locale: null, empresas: { default_locale: 'pt-PT' } };
    expect(await locale('ana@x.com')).toBe('pt-PT');
  });

  it('o join do PostgREST pode vir como ARRAY — as duas formas resolvem', async () => {
    mocks.colab = { locale: null, empresas: [{ default_locale: 'pt-PT' }] };
    expect(await locale('ana@x.com')).toBe('pt-PT');
  });

  /**
   * 🔴 O caso do achado. `findColabByEmail` é fail-closed: e-mail ambíguo sem
   * tenant resolvido devolve null em vez de escolher uma empresa. Aqui isso
   * significa NÃO gravar cookie — a request segue com o default do tenant.
   *
   * Antes, sortear a empresa gravava um cookie de 1 ano com o idioma errado, e
   * nada na tela dizia por quê.
   */
  it('🔴 e-mail ambíguo (multi-tenant) NÃO vira um locale sorteado', async () => {
    mocks.colab = null; // o que o resolvedor devolve quando não consegue decidir

    expect(
      await locale('admin@vertho.ai'),
      'devolveu um locale para um e-mail que o resolvedor recusou decidir — é o sorteio de volta',
    ).toBeNull();
  });

  it('e-mail vazio nem consulta', async () => {
    expect(await locale(null)).toBeNull();
    expect(await locale('')).toBeNull();
    expect(mocks.chamadas).toHaveLength(0);
  });

  /**
   * Degradar aqui e o certo: idioma nao pode derrubar um LOGIN. Mas tem que
   * degradar para `null` (a request usa o default do tenant), nunca lancar.
   */
  it('falha do resolvedor vira null, e nao explode o callback do login', async () => {
    mocks.lanca = true;

    await expect(locale('ana@x.com')).resolves.toBeNull();
    expect(mocks.chamadas, 'nem chegou a tentar').toHaveLength(1);
  });
});
