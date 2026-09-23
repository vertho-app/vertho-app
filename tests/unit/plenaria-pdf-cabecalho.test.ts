import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `GET /api/gestor/plenaria/pdf`: o cabeçalho do PDF.
 *
 * Até 22/09/2026 a rota relia `colaboradores` só pelo e-mail (`maybeSingle`):
 * com o mesmo e-mail em várias empresas o cabeçalho saía sem nome e sem
 * empresa, e o rótulo era sempre "Gestor", inclusive para o RH. Aqui se prova
 * que o cabeçalho vem da SESSÃO (nome do colaborador autenticado, empresa pelo
 * `empresaId`), que o rótulo acompanha o papel e que `colaboradores` não é lido.
 */

let sb = criarSupabaseMock({ resolver: (t) => (t === 'empresas' ? { nome: 'Escola Sessão' } : null) });
let auth: any;
const render = vi.fn(async (_p: any) => Buffer.from('%PDF'));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/request-context', () => ({ requireRole: vi.fn(async () => auth) }));
vi.mock('@/app/dashboard/gestor/equipe-evolucao/actions', () => ({
  listarEquipeEvolucao: vi.fn(async () => ({ resumo: { total: 1 }, rows: [] })),
}));
vi.mock('@/lib/plenaria-equipe-pdf', () => ({ renderPlenariaEquipePDF: (p: any) => render(p) }));

import { GET } from '@/app/api/gestor/plenaria/pdf/route';

const req = () => new Request('https://escola.vertho.ai/api/gestor/plenaria/pdf') as any;

describe('plenária da equipe: cabeçalho pela sessão', () => {
  beforeEach(() => { sb.reset(); render.mockClear(); });

  it('RH baixa com o rótulo "RH", o próprio nome e a empresa da sessão, sem ler colaboradores', async () => {
    auth = { email: 'rita@escola.test', role: 'rh', empresaId: 'emp-1', colaborador: { nome_completo: 'Rita Alves' }, isPlatformAdmin: false };
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(render.mock.calls[0][0]).toMatchObject({ gestorNome: 'Rita Alves', empresa: 'Escola Sessão', responsavelLabel: 'RH' });
    expect(sb.usou('empresas', 'eq', 'id')).toBe(true);
    expect(sb.chamadas.some((c) => c.tabela === 'colaboradores')).toBe(false);
  });

  it('gestor continua "Gestor"', async () => {
    auth = { email: 'gil@escola.test', role: 'gestor', empresaId: 'emp-1', colaborador: { nome_completo: 'Gil Ramos' }, isPlatformAdmin: false };
    await GET(req());
    expect(render.mock.calls[0][0]).toMatchObject({ gestorNome: 'Gil Ramos', responsavelLabel: 'Gestor' });
  });

  it('falha ao ler a empresa devolve erro, não um PDF com cabeçalho vazio', async () => {
    auth = { email: 'gil@escola.test', role: 'gestor', empresaId: 'emp-1', colaborador: { nome_completo: 'Gil Ramos' }, isPlatformAdmin: false };
    sb.falharEm({ tabela: 'empresas', mensagem: 'statement timeout' });
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(render).not.toHaveBeenCalled();
  });
});
