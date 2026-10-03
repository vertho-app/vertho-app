import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-09 (revisão de 02/10/2026): o PDF executivo de evolução é a EMPRESA
 * INTEIRA, nominal, com o nível de partida e de chegada de cada pessoa. A rota
 * aceitava `gestor` e não recortava pela equipe: qualquer gestor baixava pela
 * URL o documento de todo o tenant. Nenhuma tela do gestor aponta para ela.
 *
 * O teste passa pelo `requireRole` REAL (só a sessão e o contexto são
 * simulados), porque é ele que decide; um mock do gate provaria só o mock.
 */
const estado = vi.hoisted(() => ({ ctx: null as any }));

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { nome: 'Empresa A' } : null),
});
sb.client.auth = { getUser: async () => ({ data: { user: { email: 'pessoa@empresa-a.com' } }, error: null }) };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => estado.ctx }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ raw: sb.client }) }));

const carregarEvolucaoRH = vi.fn(async () => ({ indisponivel: false, cobertura: { medidos: 3 }, pessoas: [] }));
vi.mock('@/lib/relatorios/evolucao-center', () => ({ carregarEvolucaoRH: (...a: any[]) => (carregarEvolucaoRH as any)(...a) }));
vi.mock('@/lib/relatorios/recorte-turma', () => ({ resolverRecorteDeTurma: async () => ({ colaboradorIds: null, turma: null }) }));
vi.mock('@/lib/pdf-marca', () => ({
  resolverMarcaPdf: async () => ({ logoBase64: null, mostrarVertho: true }),
  marcaVertho: () => ({ logoBase64: null, mostrarVertho: true }),
  nomeArquivoMarca: (v: string) => v,
}));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => Buffer.from('%PDF-1.7 teste') }));
vi.mock('@/components/pdf/RelatorioEvolucao', () => ({ default: () => null }));

import { GET } from '@/app/api/relatorios/evolucao/pdf/route';

const pedido = () =>
  new Request('https://empresa-a.vertho.ai/api/relatorios/evolucao/pdf', {
    headers: { authorization: 'Bearer token-de-teste' },
  });

const contexto = (role: string, isPlatformAdmin = false) => ({
  colaborador: { id: 'c1', email: 'pessoa@empresa-a.com', empresa_id: 'emp-a', role },
  role,
  empresaId: 'emp-a',
  isPlatformAdmin,
  platformAdminRole: isPlatformAdmin ? 'master' : null,
});

describe('PDF executivo de evolução: só RH e plataforma (R-09)', () => {
  beforeEach(() => {
    carregarEvolucaoRH.mockClear();
    sb.reset();
  });

  it('🔴 gestor recebe 403 e o agregado da empresa NEM é carregado', async () => {
    estado.ctx = contexto('gestor');
    const r = await GET(pedido());
    expect(r.status).toBe(403);
    expect(carregarEvolucaoRH).not.toHaveBeenCalled();
  });

  it('colaborador também recebe 403', async () => {
    estado.ctx = contexto('colaborador');
    const r = await GET(pedido());
    expect(r.status).toBe(403);
    expect(carregarEvolucaoRH).not.toHaveBeenCalled();
  });

  // Controle positivo: sem ele, um defeito no mock que derrubasse tudo em 403
  // faria os dois casos acima passarem pelo motivo errado.
  it('RH da empresa recebe o PDF da PRÓPRIA empresa', async () => {
    estado.ctx = contexto('rh');
    const r = await GET(pedido());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(carregarEvolucaoRH).toHaveBeenCalledWith('emp-a', expect.anything());
  });

  it('platform admin recebe o PDF', async () => {
    estado.ctx = { ...contexto('colaborador', true), empresaId: null };
    const r = await GET(new Request('https://app.vertho.ai/api/relatorios/evolucao/pdf?empresa=emp-b', {
      headers: { authorization: 'Bearer token-de-teste' },
    }));
    expect(r.status).toBe(200);
    expect(carregarEvolucaoRH).toHaveBeenCalledWith('emp-b', expect.anything());
  });
});
