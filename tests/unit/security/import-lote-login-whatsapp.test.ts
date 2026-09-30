import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Amazon Bowling, 30/09/2026 — quem digitou só o WhatsApp no login não recebeu o link.
 *
 * `phone-magic-link/request` filtra `.eq('login_por_whatsapp', true)` e é anti-enumeração:
 * com a flag `false` responde sucesso e NÃO envia nada. O import em lote só ligava a flag
 * para quem NÃO tinha e-mail; os 14 colaboradores entraram com e-mail + telefone e ficaram
 * com `false`. O gêmeo individual (`criarColaborador`) já fazia certo — só o lote ficou para trás.
 *
 * O outro lado: `uq_colab_wa_telefone (empresa_id, telefone) WHERE login_por_whatsapp` é único.
 * Ligar a flag para dois com o mesmo telefone derrubaria o INSERT do lote inteiro.
 */

const EMPRESA = '11111111-1111-4111-8111-111111111111';

let emailsNoBanco: string[] = [];
let telefonesComLoginNoBanco: string[] = [];

const sb = criarSupabaseMock({
  lista: (tabela: string, cols: string) => {
    if (tabela !== 'colaboradores') return [];
    if (cols.includes('telefone')) return telefonesComLoginNoBanco.map((telefone) => ({ telefone }));
    return emailsNoBanco.map((email) => ({ email }));
  },
  escrita: (tabela, op) => (tabela === 'colaboradores' && op === 'insert' ? [] : null),
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

const { importarColaboradoresLote } = await import('@/app/admin/empresas/gerenciar/actions');

function linhasInseridas(): any[] {
  return sb.escritas.filter((e) => e.tabela === 'colaboradores' && e.op === 'insert').flatMap((e) => e.payload);
}

beforeEach(() => {
  sb.reset();
  emailsNoBanco = [];
  telefonesComLoginNoBanco = [];
});

describe('import em lote × login por WhatsApp', () => {
  it('🔴 e-mail REAL + telefone liga login_por_whatsapp (era false: a rota de telefone não enviava nada)', async () => {
    await importarColaboradoresLote({
      empresaId: EMPRESA,
      colabs: [{ nome: 'Priscila', email: 'priscila@ab.com', telefone: '92985973968' }],
    });
    const [linha] = linhasInseridas();
    expect(linha.email).toBe('priscila@ab.com');
    expect(linha.telefone).toBe('5592985973968');
    expect(linha.login_por_whatsapp).toBe(true);
  });

  it('e-mail sem telefone continua só por e-mail', async () => {
    await importarColaboradoresLote({ empresaId: EMPRESA, colabs: [{ nome: 'Sem Fone', email: 'semfone@ab.com' }] });
    const [linha] = linhasInseridas();
    expect(linha.telefone).toBeNull();
    expect(linha.login_por_whatsapp).toBe(false);
  });

  it('só WhatsApp (sem e-mail) segue ligado, com e-mail proxy', async () => {
    await importarColaboradoresLote({ empresaId: EMPRESA, colabs: [{ nome: 'So Zap', telefone: '92981110845' }] });
    const [linha] = linhasInseridas();
    expect(linha.login_por_whatsapp).toBe(true);
    expect(linha.telefone).toBe('5592981110845');
  });

  it('🔴 mesmo telefone em duas linhas do arquivo: a 2ª NÃO liga a flag (o índice único derrubaria o lote)', async () => {
    const r: any = await importarColaboradoresLote({
      empresaId: EMPRESA,
      colabs: [
        { nome: 'Ana', email: 'ana@ab.com', telefone: '92984562758' },
        { nome: 'Ana Outra', email: 'outra@ab.com', telefone: '92984562758' },
      ],
    });
    const [a, b] = linhasInseridas();
    expect(a.login_por_whatsapp).toBe(true);
    expect(b.login_por_whatsapp).toBe(false);
    expect(r.success).toBe(true);
    expect(r.data.importados).toBe(2);
    expect(r.data.avisos.some((x: any) => x.linha === 3 && /já usado/.test(x.motivo))).toBe(true);
  });

  it('🔴 telefone que já loga por WhatsApp no banco: a linha nova NÃO liga a flag', async () => {
    telefonesComLoginNoBanco = ['5592984562758'];
    await importarColaboradoresLote({
      empresaId: EMPRESA,
      colabs: [{ nome: 'Ana Nova', email: 'nova@ab.com', telefone: '92984562758' }],
    });
    expect(linhasInseridas()[0].login_por_whatsapp).toBe(false);
  });

  it('linha descartada por e-mail duplicado NÃO segura o telefone de quem entra depois', async () => {
    emailsNoBanco = ['ja@ab.com'];
    await importarColaboradoresLote({
      empresaId: EMPRESA,
      colabs: [
        { nome: 'Dup', email: 'ja@ab.com', telefone: '92984562758' },
        { nome: 'Vale', email: 'vale@ab.com', telefone: '92984562758' },
      ],
    });
    const linhas = linhasInseridas();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].email).toBe('vale@ab.com');
    expect(linhas[0].login_por_whatsapp).toBe(true);
  });

  it('falha ao ler os telefones do banco ABORTA (não importa às cegas e depois quebra no índice)', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await importarColaboradoresLote({
      empresaId: EMPRESA,
      colabs: [{ nome: 'X', email: 'x@ab.com', telefone: '92984562758' }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timeout no pool/);
    expect(linhasInseridas()).toHaveLength(0);
  });
});
