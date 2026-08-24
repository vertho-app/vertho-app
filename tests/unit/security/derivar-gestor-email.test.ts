import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * B10 da auditoria 22/08 — `derivarGestorEmailPorNome` vinculava por SUBSTRING e
 * contava intenções.
 *
 * Por que importa: `gestor_email` governa QUEM VÊ QUEM. Vínculo errado entrega a
 * evolução de um liderado ao gestor errado — e a tela diz "N vinculados" nos dois
 * casos. O campo está preenchido em 299 de 400 colaboradores: é caminho usado, não
 * hipótese.
 *
 * Os dois defeitos eram independentes:
 *  · o casamento aceitava substring nos DOIS sentidos, e só desempatava quando
 *    havia mais de um candidato — com um único parcial, "Ana" virava
 *    "Mariana Souza" em silêncio;
 *  · o laço de updates não capturava `{ error }` e o retorno era
 *    `vinculados: updates.length`, ou seja, o que a função PRETENDIA fazer.
 */

const EMPRESA = 'emp-1';

let pendentes: any[] = [];
let colaboradores: any[] = [];

const sb = criarSupabaseMock({
  lista: (tabela: string, cols: string) => {
    if (tabela !== 'colaboradores') return [];
    // a 1ª leitura pede gestor_nome (pendentes), a 2ª pede email (candidatos)
    return cols.includes('gestor_nome') ? pendentes : colaboradores;
  },
  // o update com .select('id') devolve as linhas afetadas
  escrita: (tabela, op) => (tabela === 'colaboradores' && op === 'update' ? [{ id: 'x' }] : null),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => sb.client,
  requireEmpresaSupabase: async () => sb.client,
  requireLinhaSupabase: async () => ({ sb: sb.client, linha: { empresa_id: EMPRESA } }),
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true, role: null }),
  requireAdminAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true }),
  requirePermissionAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true }),
  assertTenantAccessAction: async () => undefined,
  getAuthenticatedEmailFromAction: async () => 'admin@vertho.ai',
}));

const { derivarGestorEmailPorNome } = await import('@/app/admin/empresas/gerenciar/actions');

beforeEach(() => {
  sb.reset();
  pendentes = [];
  colaboradores = [];
});

describe('B10 — só o match EXATO vincula', () => {
  it('nome exato (com acento e caixa diferentes) vincula', async () => {
    pendentes = [{ id: 'c1', nome_completo: 'João Liderado', gestor_nome: '  MARIA DA SILVA ' }];
    colaboradores = [{ id: 'g1', nome_completo: 'María da Silva', email: 'Maria@ACME.com' }];

    const r: any = await derivarGestorEmailPorNome(EMPRESA);
    expect(r.vinculados).toBe(1);
    expect(sb.escritas[0].payload.gestor_email).toBe('maria@acme.com');
  });

  /**
   * O caso que dá nome ao achado: um único parcial vinculava sem desempate.
   */
  it('🔴 "Ana" NÃO vira "Mariana Souza" — vai para ambíguos, não para o banco', async () => {
    pendentes = [{ id: 'c1', nome_completo: 'João Liderado', gestor_nome: 'Ana' }];
    colaboradores = [{ id: 'g1', nome_completo: 'Mariana Souza', email: 'mariana@acme.com' }];

    const r: any = await derivarGestorEmailPorNome(EMPRESA);
    expect(r.vinculados).toBe(0);
    expect(r.ambiguos).toHaveLength(1);
    expect(r.ambiguos[0].motivo).toBe('apenas-parcial');
    expect(sb.escritas.filter((e) => e.op === 'update')).toHaveLength(0);
  });

  it('homônimos exatos não vinculam (ninguém decide isso por nome)', async () => {
    pendentes = [{ id: 'c1', nome_completo: 'João', gestor_nome: 'Maria Silva' }];
    colaboradores = [
      { id: 'g1', nome_completo: 'Maria Silva', email: 'maria1@acme.com' },
      { id: 'g2', nome_completo: 'Maria Silva', email: 'maria2@acme.com' },
    ];

    const r: any = await derivarGestorEmailPorNome(EMPRESA);
    expect(r.vinculados).toBe(0);
    expect(r.ambiguos[0].motivo).toBe('homonimos');
  });

  it('sem nenhum candidato parecido continua indo para naoEncontrados', async () => {
    pendentes = [{ id: 'c1', nome_completo: 'João', gestor_nome: 'Fulano Inexistente' }];
    colaboradores = [{ id: 'g1', nome_completo: 'Maria Silva', email: 'maria@acme.com' }];

    const r: any = await derivarGestorEmailPorNome(EMPRESA);
    expect(r.naoEncontrados).toHaveLength(1);
    expect(r.ambiguos).toHaveLength(0);
  });
});

describe('B10 — `vinculados` conta ESCRITA, não intenção', () => {
  it('🔴 update que falha não entra na conta, e a falha volta no retorno', async () => {
    pendentes = [{ id: 'c1', nome_completo: 'João', gestor_nome: 'Maria Silva' }];
    colaboradores = [{ id: 'g1', nome_completo: 'Maria Silva', email: 'maria@acme.com' }];
    sb.falharEm({ tabela: 'colaboradores', op: 'update', mensagem: 'deadlock detected' });

    const r: any = await derivarGestorEmailPorNome(EMPRESA);
    expect(r.vinculados).toBe(0);
    expect(r.falhas).toHaveLength(1);
  });

  it('falha ao LER pendentes não vira "0 vinculados, tudo certo"', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'pool esgotado' });
    const r: any = await derivarGestorEmailPorNome(EMPRESA);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Falha ao ler/);
  });
});
