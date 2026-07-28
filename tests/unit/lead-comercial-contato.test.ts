import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Captura de lead comercial — identidade por e-mail OU telefone (mig 195).
 *
 * O que estes testes protegem, em ordem de dano:
 *  1. lead só com WhatsApp era REJEITADO — numa feira, isso é voltar sem contato;
 *  2. rate limit de 10/h por IP cortava a captura no 11º visitante da hora,
 *     porque o stand inteiro sai por um roteador só;
 *  3. scope_id 'radarbett' cravado fazia o lead de evento entrar contabilizado
 *     como outro produto.
 */

type Linha = Record<string, unknown>;
const estado: { inseridos: Linha[]; existentes: Linha[] } = { inseridos: [], existentes: [] };

/**
 * Mock encadeável do supabase-js.
 *
 * Todo método devolve o PRÓPRIO encadeável — a primeira versão deste mock
 * devolvia o objeto interno, e o `await` da contagem caía num objeto sem
 * `then`: `count` vinha undefined e o rate limit NUNCA disparava. Os dois
 * testes de limite passavam sem exercitar nada.
 */
function tabela() {
  const filtros: Record<string, unknown> = {};
  let inserindo: Linha | null = null;

  const casa = (l: Linha) => Object.entries(filtros).every(([k, v]) => l[k] === v);

  const encadeavel: any = {
    select: () => encadeavel,
    eq: (col: string, val: unknown) => { filtros[col] = val; return encadeavel; },
    gte: () => encadeavel,
    limit: () => encadeavel,
    insert: (linha: Linha) => { inserindo = linha; return encadeavel; },
    maybeSingle: async () => {
      const achou = estado.existentes.find(casa);
      return { data: achou ? { id: achou.id } : null, error: null };
    },
    single: async () => {
      const linha = { id: `lead-${estado.inseridos.length + 1}`, ...(inserindo as Linha) };
      estado.inseridos.push(linha);
      return { data: { id: linha.id }, error: null };
    },
    // contagem do rate limit: `head: true` não chama maybeSingle/single —
    // a cadeia é aguardada diretamente
    then: (res: (v: unknown) => void) => res({ count: estado.existentes.filter(casa).length, error: null }),
  };

  return encadeavel;
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({ from: () => tabela() }) }));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'x-forwarded-for' ? '200.1.2.3' : null) }),
}));
vi.mock('@/lib/radar/eventos', () => ({ registrarEvento: async () => {} }));

const { capturarLeadComercial } = await import('@/actions/lead-comercial');

const base = {
  nome: 'Maria Souza',
  cargo: 'Gerente de RH',
  instituicao: 'Grupo Exemplo',
  consentimento_lgpd: true,
};

beforeEach(() => {
  estado.inseridos = [];
  estado.existentes = [];
});

describe('lead comercial: contato por e-mail OU telefone', () => {
  it('aceita lead só com WhatsApp (o caso da feira)', async () => {
    const r = await capturarLeadComercial({ ...base, whatsapp: '(11) 98765-4321' });
    expect(r.success).toBe(true);
    expect(estado.inseridos[0].telefone).toBe('+5511987654321');
    expect(estado.inseridos[0].email).toBeNull();
  });

  it('aceita lead só com e-mail', async () => {
    const r = await capturarLeadComercial({ ...base, email: 'Maria@Exemplo.COM' });
    expect(r.success).toBe(true);
    expect(estado.inseridos[0].email).toBe('maria@exemplo.com');
    expect(estado.inseridos[0].telefone).toBeNull();
  });

  it('recusa lead sem nenhuma forma de contato', async () => {
    const r = await capturarLeadComercial({ ...base });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/e-mail ou WhatsApp/i);
    expect(estado.inseridos).toHaveLength(0);
  });

  it('recusa e-mail malformado quando é o único contato', async () => {
    const r = await capturarLeadComercial({ ...base, email: 'nao-e-email' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/inválido/i);
  });

  it('grava origem e telefone em coluna, não dentro de organizacao', async () => {
    await capturarLeadComercial({ ...base, whatsapp: '11987654321', origem: 'evento-stand' });
    const l = estado.inseridos[0];
    expect(l.origem).toBe('evento-stand');
    expect(String(l.organizacao)).not.toMatch(/WhatsApp:|Origem:/);
  });
});

describe('campanha define o scope_id', () => {
  it('usa radarbett por padrão', async () => {
    await capturarLeadComercial({ ...base, email: 'a@b.com' });
    expect(estado.inseridos[0].scope_id).toBe('radarbett');
  });

  it('separa o lead de evento em scope próprio', async () => {
    await capturarLeadComercial({ ...base, email: 'a@b.com', campanha: 'conarh' });
    expect(estado.inseridos[0].scope_id).toBe('conarh-2026');
  });

  it('campanha desconhecida cai no padrão, não grava valor livre', async () => {
    await capturarLeadComercial({ ...base, email: 'a@b.com', campanha: 'inventada; drop' });
    expect(estado.inseridos[0].scope_id).toBe('radarbett');
  });
});

describe('rate limit', () => {
  /** O ip_hash é derivado dentro da action; pegamos o valor real do 1º insert. */
  async function ipRealGravado() {
    await capturarLeadComercial({ ...base, email: 'semente@b.com' });
    const ip = estado.inseridos[0].ip_hash;
    estado.inseridos = [];
    return ip;
  }

  it('no site, 10 cadastros do mesmo IP na hora bloqueiam o 11º', async () => {
    const ip = await ipRealGravado();
    estado.existentes = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, ip_hash: ip }));
    const r = await capturarLeadComercial({ ...base, email: 'outro@b.com' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/rede/i);
    expect(estado.inseridos).toHaveLength(0);
  });

  it('em evento, o mesmo volume de IP NÃO bloqueia — o stand é um roteador só', async () => {
    const ip = await ipRealGravado();
    estado.existentes = Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, ip_hash: ip }));
    const r = await capturarLeadComercial({ ...base, whatsapp: '11912345678', campanha: 'conarh' });
    expect(r.success).toBe(true);
    expect(estado.inseridos).toHaveLength(1);
  });

  it('mesma pessoa reenviando muitas vezes é barrada mesmo em evento', async () => {
    estado.existentes = Array.from({ length: 5 }, (_, i) => ({ id: `y${i}`, telefone: '+5511912345678' }));
    const r = await capturarLeadComercial({ ...base, whatsapp: '11912345678', campanha: 'conarh' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/recebemos seu contato/i);
  });
});

describe('dedup', () => {
  it('mesmo WhatsApp na última hora devolve o lead existente', async () => {
    estado.existentes = [
      { id: 'ja-existe', telefone: '+5511987654321', scope_type: 'comercial', scope_id: 'radarbett' },
    ];
    const r = await capturarLeadComercial({ ...base, whatsapp: '(11) 98765-4321' });
    expect(r.success).toBe(true);
    expect(r.leadId).toBe('ja-existe');
    expect(estado.inseridos).toHaveLength(0);
  });
});
