import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: null as any, listar: vi.fn(), editar: vi.fn() }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: async () => mocks.auth }));
vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/recepcao/access', async importOriginal => ({ ...(await importOriginal<any>()), contextoRecepcao: async () => ({ auth: mocks.auth, empresaId: 'e' }) }));
vi.mock('@/lib/recepcao/competencias', () => ({ listarCompetencias: (...a: any[]) => mocks.listar(...a), editarCompetencia: (...a: any[]) => mocks.editar(...a) }));
vi.mock('@/lib/recepcao/cenarios', () => ({ catalogo: async () => [], editarCenario: async () => ({}) }));
vi.mock('@/lib/recepcao/equipe', () => ({ detalheEquipe: async () => ({}), painelEquipe: async () => ({}), revisar: async () => ({ ok: true }) }));
import { GET, POST } from '@/app/api/recepcao/gestao/route';
const post = (payload: unknown) => new Request('http://localhost/api/recepcao/gestao', { method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const conteudo = { codigo: 'escuta', nome: 'Escuta ativa', descricao: 'd', niveis: { n1: 'a', n2: 'b', n3: 'c', n4: 'd' } };

beforeEach(() => {
  mocks.auth = { email: 'fixture@example.test', isPlatformAdmin: true };
  mocks.listar.mockReset().mockResolvedValue({ competencias: [], podeEditar: true });
  mocks.editar.mockReset().mockResolvedValue({ id: 'c1', ...conteudo });
});
test('GET visao=competencias lista (inativas só com o parâmetro)', async () => {
  expect((await GET(new Request('http://localhost/api/recepcao/gestao?visao=competencias'))).status).toBe(200);
  expect(mocks.listar).toHaveBeenLastCalledWith(expect.anything(), false);
  await GET(new Request('http://localhost/api/recepcao/gestao?visao=competencias&inativas=1'));
  expect(mocks.listar).toHaveBeenLastCalledWith(expect.anything(), true);
});
test('POST acao=competencia valida o comando antes de chegar ao serviço', async () => {
  const ok = await POST(post({ acao: 'competencia', op: 'salvar', conteudo }));
  expect(ok.status).toBe(200); expect((await ok.json()).competencia.codigo).toBe('escuta');
  expect(mocks.editar).toHaveBeenCalledTimes(1);
  for (const ruim of [{ acao: 'competencia', op: 'apagar' }, { acao: 'competencia', op: 'salvar', conteudo: { ...conteudo, niveis: { n1: 'a' } } }, { acao: 'competencia', op: 'salvar', conteudo: { ...conteudo, codigo: 'Maiúsculo' } }, { acao: 'competencia', op: 'excluir', id: 'nao-uuid' }]) {
    expect((await POST(post(ruim))).status).toBe(400);
  }
  expect(mocks.editar).toHaveBeenCalledTimes(1);
});
test('não autenticado não chega ao serviço', async () => {
  mocks.auth = new Response(null, { status: 401 });
  expect((await GET(new Request('http://localhost/api/recepcao/gestao?visao=competencias'))).status).toBe(401);
  expect((await POST(post({ acao: 'competencia', op: 'salvar', conteudo }))).status).toBe(401);
  expect(mocks.listar).not.toHaveBeenCalled(); expect(mocks.editar).not.toHaveBeenCalled();
});
