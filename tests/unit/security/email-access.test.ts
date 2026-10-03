import { beforeEach, describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';

/**
 * `assertEmailAccess`: a mesma pergunta de `assertColabAccess`, pelo e-mail do
 * alvo (rotas de PDF de temporada e de certificado).
 *
 * R-11 (revisão de 02/10/2026): travava a régua errada (`area_depto`). Agora é a
 * de `canViewColabJourney`. Dois cuidados próprios do e-mail:
 *  - o mesmo e-mail existe em mais de uma empresa (multi-tenant legítimo): a
 *    leitura é escopada pela empresa da SESSÃO, e não "a primeira que achar";
 *  - o e-mail chega do cliente com caixa e espaço diferentes.
 */
type Linha = { id: string; empresa_id: string; email: string; area_depto: string | null; gestor_email: string | null };

const BANCO: Linha[] = [
  { id: 'gestora', empresa_id: 'e1', email: 'ana@e1.com', area_depto: 'Vendas', gestor_email: null },
  { id: 'liderado', empresa_id: 'e1', email: 'liderado@empresa.com', area_depto: 'Financeiro', gestor_email: 'ANA@e1.com' },
  { id: 'vizinho', empresa_id: 'e1', email: 'vizinho@empresa.com', area_depto: 'Vendas', gestor_email: 'outro@e1.com' },
  // O vizinho também é colaborador de outra empresa, onde a gestora consta como gestora dele.
  { id: 'vizinho-em-e2', empresa_id: 'e2', email: 'vizinho@empresa.com', area_depto: 'Vendas', gestor_email: 'ana@e1.com' },
  { id: 'so-em-e2', empresa_id: 'e2', email: 'so-e2@empresa.com', area_depto: null, gestor_email: 'ana@e1.com' },
];

const filtrar = (cadeia: Chamada[]) =>
  BANCO.filter((l) => cadeia.filter((c) => c.metodo === 'eq').every((c) => (l as any)[c.args[0]] === c.args[1]));

const sb = criarSupabaseMock({ resolver: (_t, _cols, cadeia) => filtrar(cadeia)[0] ?? null });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { assertEmailAccess } from '@/lib/auth/request-context';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

const sessao = (role: string, extra: Record<string, any> = {}): AuthenticatedContext => ({
  email: 'ana@e1.com',
  colaborador: { id: 'gestora', email: 'ana@e1.com', empresa_id: 'e1', nome_completo: 'Ana', area_depto: 'Vendas', role },
  role,
  empresaId: 'e1',
  isPlatformAdmin: false,
  ...extra,
} as AuthenticatedContext);

const status = async (auth: AuthenticatedContext, email: string) => (await assertEmailAccess(auth, email))?.status ?? 'ok';

beforeEach(() => sb.reset());

describe('assertEmailAccess (régua de canViewColabJourney)', () => {
  it('platform admin: qualquer e-mail, sem consultar', async () => {
    expect(await status(sessao('colaborador', { isPlatformAdmin: true }), 'so-e2@empresa.com')).toBe('ok');
    expect(sb.chamadas).toHaveLength(0);
  });

  it('o próprio e-mail, com caixa e espaço diferentes, sem consultar', async () => {
    expect(await status(sessao('colaborador'), '  ANA@E1.COM ')).toBe('ok');
    expect(sb.chamadas).toHaveLength(0);
  });

  it('colaborador comum não lê outra pessoa', async () => {
    expect(await status(sessao('colaborador'), 'liderado@empresa.com')).toBe(403);
  });

  it('RH: qualquer pessoa da própria empresa', async () => {
    expect(await status(sessao('rh'), 'vizinho@empresa.com')).toBe('ok');
  });

  it('🔴 RH não lê quem só existe em outra empresa', async () => {
    expect(await status(sessao('rh'), 'so-e2@empresa.com')).toBe(403);
  });

  it('🔴 gestor ABRE o liderado de área diferente', async () => {
    expect(await status(sessao('gestor'), 'Liderado@Empresa.com')).toBe('ok');
  });

  it('🔴 gestor NÃO abre o vizinho de área, nem pelo cadastro dele em OUTRA empresa', async () => {
    // Em e2 a gestora consta como gestora do vizinho; a leitura escopada pela
    // sessão (e1) não pode escolher aquela linha.
    expect(await status(sessao('gestor'), 'vizinho@empresa.com')).toBe(403);
    const eqs = sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['empresa_id', 'e1']);
  });

  it('falha de leitura responde 503', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    expect(await status(sessao('gestor'), 'liderado@empresa.com')).toBe(503);
  });

  it('e-mail vazio: 400', async () => {
    expect(await status(sessao('rh'), '   ')).toBe(400);
  });
});
