/**
 * Análise de segurança de 05/10/2026: `/api/colaboradores` deixava o RH editar
 * `email`, `telefone`, `whatsapp`, `login_por_whatsapp` e `role` das linhas da
 * própria empresa. A conta do Auth é global por e-mail e o link de login também
 * sai por WhatsApp para o telefone da linha: o RH punha o e-mail de OUTRA conta
 * (até de platform admin) e o próprio telefone, e pedia o link dela.
 *
 * Esses campos agora são reservados a platform admin; o RH segue editando o
 * resto (nome, cargo, área, gestor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const COLAB = '20000000-0000-4000-8000-000000000002';

const sb = criarSupabaseMock({
  resolver: (tabela: string) => (tabela === 'colaboradores' ? { empresa_id: EMPRESA, id: COLAB } : null),
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/simulador-vendas/exclusao', () => ({ preverExclusaoPace: vi.fn(), excluirCadastroComBackupPace: vi.fn() }));

let auth: any;
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => auth,
  requireRole: async () => auth,
  requireAdmin: async () => auth,
  assertTenantAccess: () => null,
  assertColabAccess: async () => null,
  assertEmailAccess: async () => null,
}));

const { PUT, POST } = await import('@/app/api/colaboradores/route');

const rh = { email: 'rh@empresa.test', role: 'rh', empresaId: EMPRESA, isPlatformAdmin: false };
const admin = { email: 'adm@vertho.ai', role: 'rh', empresaId: EMPRESA, isPlatformAdmin: true };

const enviar = (metodo: 'PUT' | 'POST', corpo: unknown) => {
  const req = new Request('https://empresa.vertho.ai/api/colaboradores', {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return (metodo === 'PUT' ? PUT : POST)(req);
};
const escritasEmColaboradores = () => sb.escritas.filter((e) => e.tabela === 'colaboradores' && e.op !== 'select');

beforeEach(() => {
  sb.reset();
  auth = rh;
});

describe('/api/colaboradores: campos de identidade são de platform admin', () => {
  it.each(['email', 'telefone', 'whatsapp', 'login_por_whatsapp', 'role'])(
    '🔴 RH mandando `%s` no PUT: 403 e nada é gravado',
    async (campo) => {
      const valor = campo === 'login_por_whatsapp' ? true : campo === 'role' ? 'rh' : 'x@y.com';
      const r = await enviar('PUT', { id: COLAB, [campo]: valor });
      expect(r.status).toBe(403);
      expect((await r.json()).error).toContain(campo);
      expect(escritasEmColaboradores()).toHaveLength(0);
    },
  );

  it('🔴 RH criando colaborador (POST exige e-mail): 403 e nada é gravado', async () => {
    const r = await enviar('POST', { empresa_id: EMPRESA, email: 'admin@vertho.ai', nome_completo: 'Fulano' });
    expect(r.status).toBe(403);
    expect(escritasEmColaboradores()).toHaveLength(0);
  });

  it('RH segue editando nome, cargo e área', async () => {
    const r = await enviar('PUT', { id: COLAB, nome_completo: 'Ana Souza', cargo: 'Professora', area_depto: 'Anos finais' });
    expect(r.status).not.toBe(403);
    const w = escritasEmColaboradores();
    expect(w).toHaveLength(1);
    expect(w[0].payload).toEqual({ nome_completo: 'Ana Souza', cargo: 'Professora', area_depto: 'Anos finais' });
  });

  it('platform admin continua podendo editar e-mail, telefone e papel', async () => {
    auth = admin;
    const r = await enviar('PUT', { id: COLAB, email: 'novo@empresa.test', telefone: '5511987654321', role: 'gestor' });
    expect(r.status).not.toBe(403);
    expect(escritasEmColaboradores()[0].payload).toEqual({ email: 'novo@empresa.test', telefone: '5511987654321', role: 'gestor' });
  });

  it('a validação de papel continua valendo para o admin (platform_admin não é atribuível)', async () => {
    auth = admin;
    const r = await enviar('PUT', { id: COLAB, role: 'platform_admin' });
    expect(r.status).toBe(400);
    expect(escritasEmColaboradores()).toHaveLength(0);
  });
});
