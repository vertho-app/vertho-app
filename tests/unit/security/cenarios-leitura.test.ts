import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { criarSupabaseMock, type Chamada, type SupabaseMock } from '../../helpers/supabase-mock';

const h = vi.hoisted(() => ({ sb: null as unknown as SupabaseMock, contexts: {} as Record<string, any> }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/authz', () => ({ getUserContext: async (email: string) => Object.values(h.contexts).find(c => c.email === email) ?? null }));
import { GET } from '@/app/api/cenarios/route';

let rows: Record<string, any[]>;
const scenario = (empresa: string, extra: Record<string, unknown> = {}) => ({
  id: `scenario-${empresa}`, empresa_id: empresa, competencia_id: `comp-${empresa}`, cargo: 'Professor',
  ppp_escola_id: `ppp-${empresa}`, titulo: `Cenário ${empresa}`, descricao: 'Descrição sintética',
  alternativas: [{ texto: 'Resposta sintética', correta: true }], ...extra,
});
const req = (token: string | null = 'rh-A', empresa: string | null = 'A') => new Request(
  `https://app.vertho.ai/api/cenarios${empresa === null ? '' : `?empresa=${empresa}`}`,
  { headers: token ? { authorization: `Bearer ${token}` } : {} },
) as NextRequest;

function applyFilters(data: any[], chain: Chamada[]) {
  let filtered = data;
  for (const c of chain) {
    if (c.metodo === 'eq') filtered = filtered.filter(row => row[c.args[0]] === c.args[1]);
    if (c.metodo === 'in') filtered = filtered.filter(row => c.args[1].includes(row[c.args[0]]));
  }
  return filtered;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External integration called in unit test'); }));
  rows = {
    banco_cenarios: [scenario('A'), scenario('B')],
    competencias: [{ id: 'comp-A', empresa_id: 'A', nome: 'Competência A', cod_comp: 'CA' }, { id: 'comp-B', empresa_id: 'B', nome: 'Competência B', cod_comp: 'CB' }],
    ppp_escolas: [{ id: 'ppp-A', empresa_id: 'A', escola: 'Escola A' }, { id: 'ppp-B', empresa_id: 'B', escola: 'Escola B' }],
  };
  h.contexts = Object.fromEntries(['A', 'B'].flatMap(empresa => ['rh', 'gestor', 'colaborador'].map(role => [
    `${role}-${empresa}`, { email: `${role}-${empresa.toLowerCase()}@example.test`, role, empresaId: empresa, isPlatformAdmin: false },
  ])));
  h.contexts.admin = { email: 'admin@example.test', role: 'colaborador', empresaId: null, isPlatformAdmin: true };
  h.sb = criarSupabaseMock({ lista: (table, _cols, chain) => applyFilters(rows[table] ?? [], chain) });
  h.sb.client.auth = { getUser: vi.fn(async (token: string) => ({ data: { user: h.contexts[token] ? { id: token, email: h.contexts[token].email } : null }, error: null })) };
});
afterEach(() => vi.unstubAllGlobals());

describe('cenários: leitura real, resposta legada e isolamento', () => {
  it.each(['A', 'B'])('RH de %s lê só seu cenário com os campos legados', async empresa => {
    const response = await GET(req(`rh-${empresa}`, empresa));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{
      ...scenario(empresa), competencia: { nome: `Competência ${empresa}`, cod_comp: `C${empresa}` },
      ppp: { escola: `Escola ${empresa}` }, competencia_nome: `Competência ${empresa}`,
      competencia_cod: `C${empresa}`, ppp_nome: `Escola ${empresa}`,
    }]);
    expect(h.sb.chamadas.find(c => c.tabela === 'banco_cenarios' && c.metodo === 'select')?.args[0]).not.toMatch(/competencia:|ppp:/);
    expect(h.sb.chamadas.filter(c => c.tabela === 'banco_cenarios' && c.metodo === 'order').map(c => c.args)).toEqual([['cargo'], ['created_at', { ascending: false }]]);
    expect(h.sb.escritas).toEqual([]);
  });

  it('admin mantém acesso à empresa explicitamente selecionada', async () => {
    const response = await GET(req('admin', 'B'));
    expect(response.status).toBe(200);
    expect((await response.json()).map((c: any) => c.id)).toEqual(['scenario-B']);
  });

  it.each(['competencia_id', 'ppp_escola_id'])('referência estrangeira em %s não revela o nome de outra empresa', async field => {
    rows.banco_cenarios[0][field] = field === 'competencia_id' ? 'comp-B' : 'ppp-B';
    const response = await GET(req());
    expect(response.status).toBe(200);
    const [body] = await response.json();
    if (field === 'competencia_id') expect([body.competencia, body.competencia_nome, body.competencia_cod]).toEqual([null, null, null]);
    else expect([body.ppp, body.ppp_nome]).toEqual([null, 'PPP']);
    expect(JSON.stringify(body)).not.toContain(field === 'competencia_id' ? 'Competência B' : 'Escola B');
  });

  it('referências nulas mantêm o fallback Rede', async () => {
    rows.banco_cenarios[0] = scenario('A', { competencia_id: null, ppp_escola_id: null });
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect((await response.json())[0]).toMatchObject({ competencia: null, ppp: null, competencia_nome: null, competencia_cod: null, ppp_nome: 'Rede' });
    expect(h.sb.chamadas.some(c => c.tabela !== 'banco_cenarios')).toBe(false);
  });

  it('referências inexistentes mantêm campos nulos e o fallback PPP', async () => {
    rows.competencias = []; rows.ppp_escolas = [];
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect((await response.json())[0]).toMatchObject({ competencia: null, ppp: null, competencia_nome: null, competencia_cod: null, ppp_nome: 'PPP' });
  });

  it('empresa sem cenários recebe lista vazia sem consultar referências', async () => {
    rows.banco_cenarios = [];
    const response = await GET(req());
    expect(response.status).toBe(200); expect(await response.json()).toEqual([]);
    expect(h.sb.chamadas.every(c => c.tabela === 'banco_cenarios')).toBe(true);
  });

  it('centenas de referências são lidas sem omissão nem filtro excessivo na URL', async () => {
    rows.banco_cenarios = Array.from({ length: 205 }, (_, i) => scenario('A', { id: `s-${i}`, competencia_id: `c-${i}`, ppp_escola_id: `p-${i}` }));
    rows.competencias = Array.from({ length: 205 }, (_, i) => ({ id: `c-${i}`, empresa_id: 'A', nome: `Comp ${i}`, cod_comp: `C${i}` }));
    rows.ppp_escolas = Array.from({ length: 205 }, (_, i) => ({ id: `p-${i}`, empresa_id: 'A', escola: `Escola ${i}` }));
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json(); expect(body).toHaveLength(205);
    expect(body[204]).toMatchObject({ competencia_nome: 'Comp 204', ppp_nome: 'Escola 204' });
    expect(h.sb.chamadas.filter(c => c.metodo === 'in').map(c => c.args[1].length)).toEqual([100, 100, 100, 100, 5, 5]);
  });

  it.each(['banco_cenarios', 'competencias', 'ppp_escolas'])('erro em %s vira 503 sem detalhes internos nem sucesso vazio', async tabela => {
    h.sb.falharEm({ tabela, op: 'select', mensagem: 'INTERNAL_DATABASE_DETAIL', code: 'PGRST200' });
    const response = await GET(req());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Não foi possível carregar os cenários.' });
    expect(h.sb.escritas).toEqual([]);
  });

  it.each(['gestor-A', 'colaborador-A', 'rh-B'])('%s é barrado antes de qualquer consulta de cenários', async token => {
    const response = await GET(req(token));
    expect(response.status).toBe(403); expect(h.sb.chamadas).toEqual([]);
  });
  it.each([null, 'invalid'])('sem autenticação válida (%s): 401 e nenhuma consulta', async token => {
    expect((await GET(req(token))).status).toBe(401); expect(h.sb.chamadas).toEqual([]);
  });
  it('empresa obrigatória: 400 e nenhuma consulta', async () => {
    expect((await GET(req('rh-A', null))).status).toBe(400); expect(h.sb.chamadas).toEqual([]);
  });
});
