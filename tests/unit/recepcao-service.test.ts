import { beforeEach, expect, test, vi } from 'vitest';
import { abrirSessao } from '@/lib/recepcao/core.mjs';
import { cenario } from '@/lib/recepcao/cenario.mjs';

const mock = vi.hoisted(() => ({ gerar: vi.fn(), auth: null as any, sb: null as any, permitido: true }));
vi.mock('@/lib/recepcao/ai', () => ({ geradorRecepcao: () => ({ gerar: mock.gerar, chamadas: [] }), textoParaTreino: (s: string) => s }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: async () => mock.auth }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mock.sb }));
vi.mock('@/lib/permissions', () => ({ can: async () => mock.permitido }));
import { executar, consultar } from '@/lib/recepcao/service';
import { empresaDaSessao, contextoRecepcao } from '@/lib/recepcao/access';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const OUTRA = '10000000-0000-4000-8000-000000000002';
const ID = '20000000-0000-4000-8000-000000000001';
const REQUEST = '30000000-0000-4000-8000-000000000001';
let rows: any[], ctx: any;
function db() {
  return {
    from(table: string) {
      const filters: any[] = []; let op = 'select', payload: any;
      const source = () => table === 'empresas' ? [{ id: EMPRESA, nome: 'Fictícia' }] : table === 'recepcao_config' ? [{ empresa_id: EMPRESA, habilitado: true }] : rows;
      const execute = () => {
        const selected = source().filter(row => filters.every(([k, v]) => row[k] === v));
        if (op === 'update') { selected.forEach(row => Object.assign(row, payload)); return { data: null, error: null }; }
        if (op === 'insert') {
          if (rows.some(r => r.id === payload.id)) return { data: null, error: { code: '23505' } };
          rows.push({ ...structuredClone(payload), revisao: 0, created_at: '2026-09-05' });
          return { data: null, error: null };
        }
        return { data: structuredClone(selected), error: null };
      };
      const q: any = {
        select: () => q, eq: (k: string, v: any) => { filters.push([k, v]); return q; },
        order: () => q, limit: () => q,
        insert: (v: any) => { op = 'insert'; payload = v; return q; },
        update: (v: any) => { op = 'update'; payload = v; return q; },
        maybeSingle: async () => { const r = execute(); return { ...r, data: r.data?.[0] ?? null }; },
        then: (resolve: any) => Promise.resolve(execute()).then(resolve),
      };
      return q;
    },
    async rpc(name: string, p: any) {
      const row = rows.find(r => r.id === p.p_id && r.empresa_id === p.p_empresa && r.owner_email === p.p_owner && r.revisao === p.p_revisao);
      if (!row) return { data: false, error: null };
      if (name === 'recepcao_claim') {
        if (row.lock_token) return { data: false, error: null };
        row.lock_token = p.p_token; return { data: true, error: null };
      }
      if (row.lock_token !== p.p_token) return { data: false, error: null };
      row.estado = structuredClone(p.p_estado); row.revisao++; row.lock_token = null;
      return { data: true, error: null };
    },
  };
}
beforeEach(() => {
  const estado = abrirSessao(cenario); estado.id = ID;
  rows = [{ id: ID, empresa_id: EMPRESA, owner_email: 'pessoa@example.test', estado, revisao: 0, created_at: '2026-09-05' }];
  mock.sb = db(); mock.permitido = true;
  mock.auth = { email: 'pessoa@example.test', empresaId: EMPRESA, isPlatformAdmin: false, role: 'colaborador', colaborador: { id: 'colab', empresa_id: EMPRESA } };
  ctx = { auth: mock.auth, empresaId: EMPRESA, owner: mock.auth.email, empresaNome: 'Fictícia', habilitado: true, sb: mock.sb };
  mock.gerar.mockReset().mockResolvedValue(JSON.stringify({ fala: 'Prefiro a Dra. Helena.' }));
});
const comando = () => ({ acao: 'responder' as const, sessaoId: ID, requestId: REQUEST, revisao: 0, mensagem: 'Qual horário funciona?' });

test('tenant vem da sessão; colaborador não pode trocar a empresa', () => {
  expect(empresaDaSessao(mock.auth)).toBe(EMPRESA);
  expect(() => empresaDaSessao(mock.auth, OUTRA)).toThrow('não autorizada');
  expect(() => empresaDaSessao({ ...mock.auth, colaborador: null })).toThrow('cadastro');
});
test('contexto preserva 401 e aplica permissão para mutações', async () => {
  mock.auth = new Response(null, { status: 401 });
  expect((await contextoRecepcao(new Request('http://local'))) as Response).toHaveProperty('status', 401);
  mock.auth = ctx.auth; mock.permitido = false;
  await expect(contextoRecepcao(new Request('http://local'), undefined, true)).rejects.toThrow('perfil');
});
test('flag fechada bloqueia colaborador inclusive por API', async () => {
  mock.sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: EMPRESA, nome: 'Fictícia', habilitado: false }, error: null }) }) }) }) };
  await expect(contextoRecepcao(new Request('http://local'))).rejects.toThrow('não está habilitado');
});
test('sessões de outra empresa ou outro proprietário não podem ser lidas nem alteradas', async () => {
  for (const change of [{ empresaId: OUTRA }, { owner: 'outra@example.test' }]) {
    const outro = { ...ctx, ...change };
    await expect(consultar(outro, ID)).rejects.toThrow('não encontrado');
    await expect(executar(outro, comando())).rejects.toThrow('não encontrado');
  }
  expect(mock.gerar).not.toHaveBeenCalled();
});
test('retry do mesmo turno com revisão antiga devolve resultado salvo, sem cobrar outra chamada', async () => {
  const a = await executar(ctx, comando());
  const b = await executar(ctx, comando());
  expect(b).toEqual(a); expect(mock.gerar).toHaveBeenCalledTimes(1);
  expect(rows[0].estado.historico).toHaveLength(3);
});
test('criação é idempotente e fica vinculada à identidade do servidor', async () => {
  const cmd = { acao: 'iniciar' as const, requestId: REQUEST };
  await executar(ctx, cmd); await executar(ctx, cmd);
  expect(rows.filter(r => r.id === REQUEST)).toHaveLength(1);
  expect(rows[1].owner_email).toBe(ctx.owner);
  expect(rows[1].empresa_id).toBe(EMPRESA);
});
test('falha de IA preserva estado e libera lease', async () => {
  mock.gerar.mockRejectedValue(new Error('provedor indisponível'));
  await expect(executar(ctx, comando())).rejects.toThrow('preservado');
  expect(rows[0].revisao).toBe(0); expect(rows[0].estado.historico).toHaveLength(1);
  expect(rows[0].lock_token).toBeNull();
});
test('concorrência na mesma revisão permite só um gerador', async () => {
  let release: (s: string) => void;
  mock.gerar.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
  const primeiro = executar(ctx, comando());
  await vi.waitFor(() => expect(mock.gerar).toHaveBeenCalledTimes(1));
  await expect(executar(ctx, { ...comando(), requestId: ID })).rejects.toThrow('processamento');
  release!(JSON.stringify({ fala: 'Obrigada.' })); await primeiro;
  expect(rows[0].revisao).toBe(1);
});
test('revisão stale sem recibo não sobrescreve conversa', async () => {
  rows[0].revisao = 3;
  await expect(executar(ctx, comando())).rejects.toThrow('outra aba');
  expect(mock.gerar).not.toHaveBeenCalled();
});
