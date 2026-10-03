import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-65 (revisão de 02/10/2026): `logAdminAction` fazia `await insert(...)` sem
 * olhar o `{ error }` que o supabase-js DEVOLVE. O `catch` em volta nunca via
 * nada, e um rastro perdido era indistinguível de um gravado.
 *
 * O contrato que fica: nunca lança (a ação de negócio não para por causa do
 * rastro), devolve se gravou, e a perda chega ao Sentry pelo `logger.error`,
 * sem `detalhes` nem e-mail (podem carregar dado de pessoa).
 */
const sb = criarSupabaseMock();
const erroLogado = vi.fn();
let adminQuebrado = false;

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => {
    if (adminQuebrado) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente');
    return sb.client;
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: (...a: any[]) => erroLogado(...a) } }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'vitest' }),
}));

import { logAdminAction } from '@/lib/audit';

const ENTRADA = {
  adminEmail: 'master@vertho.ai',
  acao: 'lixeira.restaurar',
  empresaId: 'emp-1',
  detalhes: { nome_completo: 'Pessoa Real', restaurados: 2 },
  resultado: 'parcial' as const,
};

describe('logAdminAction', () => {
  beforeEach(() => {
    sb.reset();
    erroLogado.mockClear();
    adminQuebrado = false;
  });

  it('grava a linha com ip e user-agent do request e devolve true', async () => {
    expect(await logAdminAction(ENTRADA)).toBe(true);
    const [linha] = sb.escritas.filter((e) => e.tabela === 'admin_audit_log');
    expect(linha.payload).toMatchObject({
      admin_email: 'master@vertho.ai', acao: 'lixeira.restaurar', empresa_id: 'emp-1',
      resultado: 'parcial', ip: '200.1.2.3', user_agent: 'vitest',
    });
    expect(erroLogado).not.toHaveBeenCalled();
  });

  it('🔴 insert que DEVOLVE erro: false e alarme, sem lançar', async () => {
    sb.falharEm({ tabela: 'admin_audit_log', op: 'insert', mensagem: 'relation "admin_audit_log" does not exist' });

    await expect(logAdminAction(ENTRADA)).resolves.toBe(false);

    expect(erroLogado).toHaveBeenCalledTimes(1);
    const [dominio, , contexto] = erroLogado.mock.calls[0];
    expect(dominio).toBe('audit');
    expect(contexto).toMatchObject({ acao: 'lixeira.restaurar', empresaId: 'emp-1', erro: expect.stringMatching(/does not exist/) });
    // o alarme não carrega dado de pessoa
    expect(JSON.stringify(contexto)).not.toMatch(/Pessoa Real|master@vertho\.ai/);
  });

  it('exceção (cliente admin indisponível): false e alarme, sem lançar', async () => {
    adminQuebrado = true;
    await expect(logAdminAction(ENTRADA)).resolves.toBe(false);
    expect(erroLogado).toHaveBeenCalledTimes(1);
  });
});
