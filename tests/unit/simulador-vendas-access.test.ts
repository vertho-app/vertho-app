import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: vi.fn(async () => new Response('', { status: 401 })) }));
import { contexto, empresaAutorizada } from '@/lib/simulador-vendas/access';
import { can } from '@/lib/permissions';
const auth = { email: 'pessoa@example.test', empresaId: 'empresa-a', isPlatformAdmin: false, role: 'colaborador', colaborador: { id: 'c1', empresa_id: 'empresa-a', nome_completo: 'Pessoa' } } as AuthenticatedContext;
describe('acesso PACE', () => {
  beforeEach(() => {
    vi.mocked(can).mockResolvedValue(true);
    sb = criarSupabaseMock({ resolver: t => t === 'empresas' ? { id: 'empresa-a', nome: 'Empresa' } : t === 'sim_vendas_config' ? { habilitado: true, briefing: 'Contexto comercial', limite_sessoes: null } : null });
  });
  it('participante não escolhe outro tenant e falha antes de ler/escrever dados', async () => {
    await expect(contexto(new Request('https://app.vertho.ai/api'), 'empresa-b', true, auth)).rejects.toThrow('acesso');
    expect(sb.chamadas).toEqual([]); expect(sb.escritas).toEqual([]);
  });
  it('ignorar colaborador ausente ou de outra empresa é proibido', () => {
    expect(() => empresaAutorizada({ ...auth, colaborador: null })).toThrow();
    expect(() => empresaAutorizada({ ...auth, colaborador: { ...auth.colaborador, empresa_id: 'empresa-b' } })).toThrow();
  });
  it('flag desabilitada ou falha de leitura fecham a API', async () => {
    sb = criarSupabaseMock({ resolver: t => t === 'empresas' ? { id: 'empresa-a', nome: 'Empresa' } : { habilitado: false } });
    await expect(contexto(new Request('https://app.vertho.ai/api'), null, false, auth)).rejects.toThrow('habilitado');
    sb.falharEm({ tabela: 'sim_vendas_config', op: 'select', mensagem: 'timeout' });
    await expect(contexto(new Request('https://app.vertho.ai/api'), null, false, auth)).rejects.toThrow('consultar');
  });
  it('configuração sempre é consultada com o tenant da sessão', async () => {
    const c = await contexto(new Request('https://app.vertho.ai/api'), null, true, auth);
    expect(c).not.toBeInstanceOf(Response); expect(sb.usou('sim_vendas_config', 'eq', 'empresa_id')).toBe(true);
    expect(sb.chamadas).toContainEqual({ tabela: 'sim_vendas_config', metodo: 'eq', args: ['empresa_id', 'empresa-a'] });
  });
  it('sem permissão de treinar, a chamada é barrada antes do banco', async () => {
    vi.mocked(can).mockResolvedValue(false);
    await expect(contexto(new Request('https://app.vertho.ai/api'), null, true, auth)).rejects.toThrow('perfil');
    expect(sb.chamadas).toEqual([]);
  });
  it('anônimo recebe 401 antes de escolher tenant', async () => {
    const c = await contexto(new Request('https://app.vertho.ai/api'), 'empresa-b', true);
    expect((c as Response).status).toBe(401); expect(sb.chamadas).toEqual([]);
  });
});
