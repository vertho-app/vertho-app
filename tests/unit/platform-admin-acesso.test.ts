import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Cadastrar admin de plataforma tem DUAS metades: o PAPEL (`platform_admins`) e
 * o ACESSO (a conta no Supabase Auth). Só a primeira existia.
 *
 * `Medido 04/09/2026:` `simone@vertho.ai` foi cadastrada como sócia e tinha zero
 * contas no Auth. O login por e-mail chama `generateLink` SEM criar usuário, e o
 * sintoma que ela receberia ("Falha ao gerar link") não fala de cadastro nenhum.
 * Quem cadastrou não tinha como desconfiar: a tela dizia "adicionado".
 *
 * É a mesma família de "importar colaborador não é dar acesso" do CLAUDE.md, na
 * porta de cima.
 */

let adminExistente: any = null;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'platform_admins' ? adminExistente : null),
});

const createUser = vi.fn();
sb.client.auth = { admin: { createUser } };

const audits: any[] = [];

vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({
  requirePermissionAction: async () => ({ email: 'rodrigo@vertho.ai' }),
}));
vi.mock('@/lib/audit', () => ({
  logAdminAction: async (entrada: any) => { audits.push(entrada); },
}));

import { adicionarAdmin } from '@/app/admin/platform-admins/actions';

describe('cadastro de admin de plataforma', () => {
  beforeEach(() => {
    sb.reset();
    adminExistente = null;
    audits.length = 0;
    createUser.mockReset();
    createUser.mockResolvedValue({ data: { user: { id: 'auth-novo' } }, error: null });
  });

  it('concede o papel E cria o acesso, na mesma operação', async () => {
    const r: any = await adicionarAdmin('simone@vertho.ai', 'Simone', 'socio');

    expect(r.success).toBe(true);
    expect(sb.escritas).toContainEqual({
      tabela: 'platform_admins',
      op: 'insert',
      payload: { email: 'simone@vertho.ai', nome: 'Simone', role: 'socio' },
    });
    // e-mail JÁ confirmado: a entrada é por magic link e este fluxo não envia
    // e-mail de confirmação nenhum. Sem isso a conta nasce inerte.
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'simone@vertho.ai',
      email_confirm: true,
    }));
    expect(r.acesso).toBe('criada');
  });

  it('quem JÁ tem conta não vira erro: o papel é novo, o acesso não', async () => {
    createUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'email_exists', message: 'A user with this email address has already been registered' },
    });

    const r: any = await adicionarAdmin('juliane@vertho.ai', 'Juliane', 'socio');

    expect(r.success).toBe(true);
    expect(r.acesso).toBe('existente');
  });

  it('reconhece o "já registrado" pela MENSAGEM, não só pelo código', async () => {
    // o supabase-js nem sempre traz `code`; sem o par mensagem+código, um provedor
    // que responde só com texto empurraria a pessoa para o ramo de falha
    createUser.mockResolvedValueOnce({
      data: null,
      error: { message: 'A user with this email address has already been registered' },
    });

    const r: any = await adicionarAdmin('rodrigo@vertho.ai', 'Rodrigo', 'master');
    expect(r.acesso).toBe('existente');
  });

  it('🔴 acesso que falha NÃO passa por sucesso silencioso', async () => {
    // este é o caso que a rodada inteira existe para eliminar: papel concedido,
    // pessoa sem conseguir entrar, e a tela dizendo que deu certo
    createUser.mockResolvedValueOnce({ data: null, error: { message: 'Auth fora do ar' } });
    const erroLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r: any = await adicionarAdmin('nova@vertho.ai', 'Nova', 'master');

    expect(r.acesso).toBe('falhou');
    expect(r.message).toContain('Auth fora do ar');
    expect(r.message).toContain('não vai conseguir entrar');
    // e a auditoria registra a metade que faltou, em vez de um "ok" liso
    expect(audits[0]).toMatchObject({
      acao: 'platform_admin.adicionar',
      resultado: 'parcial',
      detalhes: { role: 'master', acesso: 'falhou' },
    });
    erroLog.mockRestore();
  });

  it('exceção do Auth não derruba o cadastro já gravado', async () => {
    createUser.mockRejectedValueOnce(new Error('conexão interrompida'));
    const erroLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r: any = await adicionarAdmin('outra@vertho.ai', 'Outra', 'master');

    // o papel já foi concedido quando isto roda; lançar aqui deixaria o estado
    // pela metade sem dizer QUAL metade
    expect(r.success).toBe(true);
    expect(r.acesso).toBe('falhou');
    expect(sb.escritas.some((e) => e.tabela === 'platform_admins' && e.op === 'insert')).toBe(true);
    erroLog.mockRestore();
  });

  it('a auditoria registra o acesso junto do papel, no caminho feliz', async () => {
    await adicionarAdmin('simone@vertho.ai', 'Simone', 'socio');

    expect(audits[0]).toMatchObject({
      adminEmail: 'rodrigo@vertho.ai',
      acao: 'platform_admin.adicionar',
      alvo: 'simone@vertho.ai',
      detalhes: { role: 'socio', acesso: 'criada' },
      resultado: 'ok',
    });
  });

  it('e-mail já cadastrado é recusado ANTES de mexer no Auth', async () => {
    adminExistente = { id: 'pa-1' };

    const r: any = await adicionarAdmin('simone@vertho.ai', 'Simone', 'socio');

    expect(r).toEqual({ success: false, error: 'Este email ja e admin' });
    expect(createUser).not.toHaveBeenCalled();
    expect(sb.escritas).toEqual([]);
  });

  it('falha ao gravar o papel não cria conta órfã no Auth', async () => {
    sb.falharEm({ tabela: 'platform_admins', op: 'insert', mensagem: 'timeout no pool' });

    const r: any = await adicionarAdmin('nova@vertho.ai', 'Nova', 'master');

    expect(r).toEqual({ success: false, error: 'timeout no pool' });
    expect(createUser).not.toHaveBeenCalled();
  });
});
