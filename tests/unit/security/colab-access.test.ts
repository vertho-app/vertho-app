import { beforeEach, describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';

/**
 * `assertColabAccess`: quem pode ler dados de um colaborador numa rota de API.
 *
 * R-11 (revisão de 02/10/2026): este arquivo travava a régua ERRADA. O gestor
 * era recortado por `area_depto`, enquanto telas e actions usam `gestor_email`
 * (`canViewColabJourney`); no banco, de 369 pares gestor e liderado só 61 têm a
 * mesma área. Agora a régua é a das telas, e os casos abaixo são os dois lados
 * do defeito: o liderado de área diferente ABRE, o vizinho de área NÃO abre.
 *
 * O banco é uma lista que respeita os filtros pedidos (`id` e `empresa_id`):
 * um gate que esquecesse o tenant receberia a linha do outro tenant aqui.
 */
type Linha = { id: string; empresa_id: string; email: string; area_depto: string | null; gestor_email: string | null };

const BANCO: Linha[] = [
  { id: 'gestora', empresa_id: 'e1', email: 'ana_lima@e1.com', area_depto: 'Vendas', gestor_email: null },
  { id: 'liderado-outra-area', empresa_id: 'e1', email: 'l1@e1.com', area_depto: 'Financeiro', gestor_email: ' ANA_LIMA@e1.com' },
  { id: 'liderado-sem-area', empresa_id: 'e1', email: 'l2@e1.com', area_depto: null, gestor_email: 'ana_lima@e1.com' },
  { id: 'vizinho-mesma-area', empresa_id: 'e1', email: 'v@e1.com', area_depto: 'Vendas', gestor_email: 'outro@e1.com' },
  { id: 'curinga', empresa_id: 'e1', email: 'c@e1.com', area_depto: 'Vendas', gestor_email: 'anaXlima@e1.com' },
  { id: 'tenant-b', empresa_id: 'e2', email: 'b@e2.com', area_depto: 'Vendas', gestor_email: 'ana_lima@e1.com' },
];

const filtrar = (cadeia: Chamada[]) =>
  BANCO.filter((l) => cadeia.filter((c) => c.metodo === 'eq').every((c) => (l as any)[c.args[0]] === c.args[1]));

const sb = criarSupabaseMock({ resolver: (_t, _cols, cadeia) => filtrar(cadeia)[0] ?? null });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { assertColabAccess } from '@/lib/auth/request-context';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

const sessao = (role: string, extra: Record<string, any> = {}): AuthenticatedContext => ({
  email: 'ana_lima@e1.com',
  colaborador: { id: 'gestora', email: 'ana_lima@e1.com', empresa_id: 'e1', nome_completo: 'Ana', area_depto: 'Vendas', role },
  role,
  empresaId: 'e1',
  isPlatformAdmin: false,
  ...extra,
} as AuthenticatedContext);

const status = async (auth: AuthenticatedContext, id: string) => (await assertColabAccess(auth, id))?.status ?? 'ok';

beforeEach(() => sb.reset());

describe('assertColabAccess (régua de canViewColabJourney)', () => {
  it('platform admin: qualquer colaborador, sem consultar', async () => {
    expect(await status(sessao('colaborador', { isPlatformAdmin: true }), 'tenant-b')).toBe('ok');
    expect(sb.chamadas).toHaveLength(0);
  });

  it('o próprio colaborador, sem consultar', async () => {
    expect(await status(sessao('colaborador'), 'gestora')).toBe('ok');
    expect(sb.chamadas).toHaveLength(0);
  });

  it('colaborador comum não lê outra pessoa', async () => {
    expect(await status(sessao('colaborador'), 'liderado-outra-area')).toBe(403);
  });

  it('RH: qualquer pessoa da PRÓPRIA empresa', async () => {
    for (const id of ['liderado-outra-area', 'vizinho-mesma-area', 'curinga']) {
      expect(await status(sessao('rh'), id), id).toBe('ok');
    }
  });

  it('🔴 RH de outra empresa: 403 (a leitura é escopada pela empresa da sessão)', async () => {
    expect(await status(sessao('rh'), 'tenant-b')).toBe(403);
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
  });

  it('🔴 gestor ABRE o liderado de verdade, mesmo de área diferente ou sem área (os 83%)', async () => {
    expect(await status(sessao('gestor'), 'liderado-outra-area')).toBe('ok');
    expect(await status(sessao('gestor'), 'liderado-sem-area')).toBe('ok');
  });

  it('🔴 gestor NÃO abre quem é só da mesma área', async () => {
    expect(await status(sessao('gestor'), 'vizinho-mesma-area')).toBe(403);
  });

  it('🔴 igualdade exata: `_` não é curinga', async () => {
    expect(await status(sessao('gestor'), 'curinga')).toBe(403);
    expect(sb.usou('colaboradores', 'ilike')).toBe(false);
  });

  it('🔴 gestor de outro tenant, mesmo com o próprio e-mail no gestor_email do alvo: 403', async () => {
    expect(await status(sessao('gestor'), 'tenant-b')).toBe(403);
  });

  it('a leitura pede gestor_email (sem ele o gate nega por falta de dado)', async () => {
    await assertColabAccess(sessao('gestor'), 'liderado-outra-area');
    const sel = sb.chamadas.find((c) => c.tabela === 'colaboradores' && c.metodo === 'select')!.args[0];
    expect(sel).toContain('gestor_email');
  });

  it('sessão sem empresa não lê ninguém', async () => {
    expect(await status(sessao('rh', { empresaId: null }), 'liderado-outra-area')).toBe(403);
  });

  it('falha de leitura responde 503, não acesso nem "sem acesso"', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    expect(await status(sessao('gestor'), 'liderado-outra-area')).toBe(503);
  });

  it('id ausente: 400', async () => {
    expect(await status(sessao('rh'), '')).toBe(400);
  });
});
