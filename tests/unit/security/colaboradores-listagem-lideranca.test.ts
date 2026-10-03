import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-11 (revisão de 02/10/2026), na listagem `GET /api/colaboradores`:
 *  1. devolvia `select('*')`: as ~100 colunas de cada pessoa;
 *  2. recortava o gestor por `area_depto`, enquanto telas e actions usam
 *     `gestor_email` (`canViewColabJourney`). No banco, de 369 pares gestor e
 *     liderado só 61 têm a mesma área: o gestor via quem é só da área e não
 *     via o liderado de verdade.
 *
 * `canViewColabJourney` é o REAL; só a sessão é simulada.
 */
const estado = vi.hoisted(() => ({ auth: null as any }));
const EMPRESA = 'emp-a';

const PESSOAS = [
  { id: 'gestora', empresa_id: EMPRESA, nome_completo: 'Gestora', email: 'ana_lima@empresa.com', area_depto: 'Vendas', gestor_email: null },
  { id: 'liderado-1', empresa_id: EMPRESA, nome_completo: 'Liderado Um', email: 'l1@empresa.com', area_depto: 'Financeiro', gestor_email: 'ANA_LIMA@empresa.com ' },
  { id: 'liderado-2', empresa_id: EMPRESA, nome_completo: 'Liderado Dois', email: 'l2@empresa.com', area_depto: null, gestor_email: 'ana_lima@empresa.com' },
  { id: 'mesma-area', empresa_id: EMPRESA, nome_completo: 'Só da Área', email: 'area@empresa.com', area_depto: 'Vendas', gestor_email: 'outro@empresa.com' },
  // `_` é curinga no `ilike`: esta pessoa casaria por `ilike('gestor_email', 'ana_lima@…')`.
  { id: 'curinga', empresa_id: EMPRESA, nome_completo: 'Curinga', email: 'c@empresa.com', area_depto: 'Vendas', gestor_email: 'anaXlima@empresa.com' },
];

const sb = criarSupabaseMock({ lista: (t) => (t === 'colaboradores' ? PESSOAS : []) });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/request-context', async (original) => ({
  ...(await original<typeof import('@/lib/auth/request-context')>()),
  requireRole: async () => estado.auth,
}));
vi.mock('@/lib/simulador-vendas/exclusao', () => ({ preverExclusaoPace: vi.fn(), excluirCadastroComBackupPace: vi.fn() }));

import { GET } from '@/app/api/colaboradores/route';

const sessao = (role: string, isPlatformAdmin = false) => ({
  email: 'ana_lima@empresa.com',
  colaborador: { id: 'gestora', empresa_id: EMPRESA, email: 'ana_lima@empresa.com', area_depto: 'Vendas', role },
  role,
  empresaId: EMPRESA,
  isPlatformAdmin,
});
const listar = async () => {
  const r = await GET(new Request(`https://empresa.vertho.ai/api/colaboradores?empresa_id=${EMPRESA}`));
  return { status: r.status, corpo: await r.json() };
};

describe('GET /api/colaboradores (R-11)', () => {
  beforeEach(() => sb.reset());

  it('🔴 gestor recebe a si e aos liderados por gestor_email, não quem é só da mesma área', async () => {
    estado.auth = sessao('gestor');
    const { status, corpo } = await listar();
    expect(status).toBe(200);
    expect(corpo.map((c: any) => c.id).sort()).toEqual(['gestora', 'liderado-1', 'liderado-2']);
  });

  it('🔴 a régua é igualdade exata (sem curinga de ilike)', async () => {
    estado.auth = sessao('gestor');
    const { corpo } = await listar();
    expect(corpo.map((c: any) => c.id)).not.toContain('curinga');
    expect(sb.usou('colaboradores', 'ilike')).toBe(false);
  });

  it('🔴 colunas explícitas, nunca `*`', async () => {
    estado.auth = sessao('rh');
    await listar();
    const sel = sb.chamadas.find((c) => c.tabela === 'colaboradores' && c.metodo === 'select')!.args[0];
    expect(sel).not.toContain('*');
    expect(sel).toContain('gestor_email');
  });

  it('RH recebe a empresa inteira, escopada pelo tenant', async () => {
    estado.auth = sessao('rh');
    const { corpo } = await listar();
    expect(corpo).toHaveLength(PESSOAS.length);
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
  });

  it('falha de leitura vira 500, não lista vazia', async () => {
    estado.auth = sessao('rh');
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    const { status } = await listar();
    expect(status).toBe(500);
  });
});
