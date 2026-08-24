import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * E5 da auditoria 22/08 — `lib/tenant-db.ts` não tinha UM teste.
 *
 * Nenhum dos 220 arquivos de teste importava `@/lib/tenant-db`: ele só aparecia
 * MOCKADO. E é a peça em que todo o sistema de guards se apoia — o
 * `tenant-mutation-guard` sanciona o receiver `tdb` como prova de isolamento,
 * sem olhar o payload. Quando a prova não é verificada, ela vale o que a
 * intenção de quem escreveu valia.
 *
 * O contrato era falso nos TRÊS verbos de escrita:
 *   insert/upsert: `{ empresa_id: tenantId, ...row }` — o default vinha ANTES do
 *                  spread, então o payload vencia;
 *   update:        `.eq('empresa_id', tenantId)` escolhe QUAL linha, e o
 *                  `changes` passava intacto — `update({ empresa_id: outro })`
 *                  tira a linha do meu tenant e a entrega para outro.
 *
 * Estes casos pinam também o que JÁ estava certo (`select`, `delete`): sem isso,
 * a próxima refatoração pode quebrá-los sem ninguém ver.
 */

/** Registra a chamada real feita ao client do Supabase. */
let chamadas: Array<{ metodo: string; args: any[] }> = [];

function clienteFalso() {
  const b: any = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'in', 'order', 'limit']) {
    b[m] = (...args: any[]) => { chamadas.push({ metodo: m, args }); return b; };
  }
  return {
    from: (t: string) => { chamadas.push({ metodo: 'from', args: [t] }); return b; },
    auth: {} as any,
    storage: {} as any,
    rpc: () => b,
  };
}

vi.mock('./supabase', () => ({ createSupabaseAdmin: () => clienteFalso() }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => clienteFalso() }));

import { tenantDb } from '@/lib/tenant-db';

const TENANT = 'emp-A';
const OUTRO = 'emp-B';

const arg = (metodo: string) => chamadas.find((c) => c.metodo === metodo)?.args;

beforeEach(() => { chamadas = []; });

describe('tenantDb — o tenant do wrapper vence o payload', () => {
  it('insert injeta o empresa_id do wrapper', () => {
    tenantDb(TENANT).from('colaboradores').insert({ nome: 'X' });
    expect(arg('insert')?.[0]).toEqual({ nome: 'X', empresa_id: TENANT });
  });

  it('🔴 insert com empresa_id DIVERGENTE lança (antes, o payload vencia e gravava no outro tenant)', () => {
    expect(() => tenantDb(TENANT).from('colaboradores').insert({ nome: 'X', empresa_id: OUTRO }))
      .toThrow(/empresa_id emp-B sob o tenant emp-A/);
  });

  it('insert em LOTE valida linha a linha (uma maçã podre no array bastava)', () => {
    expect(() => tenantDb(TENANT).from('colaboradores').insert([
      { nome: 'ok' },
      { nome: 'ruim', empresa_id: OUTRO },
    ])).toThrow(/empresa_id emp-B/);
  });

  it('empresa_id nulo no payload é "não sei o tenant" — o wrapper preenche, sem reclamar', () => {
    tenantDb(TENANT).from('colaboradores').insert({ nome: 'X', empresa_id: null });
    expect(arg('insert')?.[0]).toEqual({ nome: 'X', empresa_id: TENANT });
  });

  it('empresa_id IGUAL ao do wrapper passa (redundante, não é erro)', () => {
    tenantDb(TENANT).from('colaboradores').insert({ nome: 'X', empresa_id: TENANT });
    expect(arg('insert')?.[0]?.empresa_id).toBe(TENANT);
  });

  it('upsert segue a mesma regra do insert', () => {
    expect(() => tenantDb(TENANT).from('trilhas').upsert({ id: 1, empresa_id: OUTRO }))
      .toThrow(/tenantDb.upsert/);
  });

  /**
   * O verbo que o E5 original não cobria, e o de efeito pior: não é escrever no
   * tenant errado, é TIRAR a linha do tenant certo.
   */
  it('🔴 update({ empresa_id: outro }) lança — o `.eq` escolhe a linha, não protege o payload', () => {
    expect(() => tenantDb(TENANT).from('colaboradores').update({ empresa_id: OUTRO }))
      .toThrow(/mover linha para o tenant emp-B/);
  });

  it('update normal continua filtrando por empresa_id', () => {
    tenantDb(TENANT).from('colaboradores').update({ nome: 'Y' });
    expect(arg('update')?.[0]).toEqual({ nome: 'Y' });
    expect(arg('eq')).toEqual(['empresa_id', TENANT]);
  });
});

describe('tenantDb — o que já estava certo, agora pinado', () => {
  it('select filtra por empresa_id', () => {
    tenantDb(TENANT).from('colaboradores').select('*');
    expect(arg('eq')).toEqual(['empresa_id', TENANT]);
  });

  it('delete filtra por empresa_id', () => {
    tenantDb(TENANT).from('colaboradores').delete();
    expect(arg('eq')).toEqual(['empresa_id', TENANT]);
  });

  it('tenantId vazio é erro de programação, não filtro vazio', () => {
    expect(() => tenantDb('')).toThrow(/tenantId obrigatório/);
  });

  it('`raw` é o escape hatch declarado — não filtra nada', () => {
    const tdb = tenantDb(TENANT);
    expect(tdb.raw).toBeTruthy();
    tdb.raw.from('competencias_base' as any).select('*');
    expect(chamadas.filter((c) => c.metodo === 'eq')).toHaveLength(0);
  });
});
