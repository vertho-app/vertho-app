import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `dispararMensagemCustomizada` só envia e-mail (23/09/2026).
 *
 * O ramo de WhatsApp (texto livre, PDF e anexo pela Z-API, desconectada desde
 * 11/08) saiu: a tela já fixava `canal = 'email'`, e o ramo só era alcançável por
 * POST direto na action. Aqui se prova que outro canal é recusado ANTES de
 * qualquer leitura de banco, e que o e-mail continua saindo com a variável
 * substituída.
 */

let sb = criarSupabaseMock({
  resolver: (t) => (t === 'empresas' ? { nome: 'Escola Teste', slug: 'escolateste' } : null),
  lista: (t) => (t === 'colaboradores'
    ? [{ id: 'c1', nome_completo: 'Ana Souza', email: 'ana@escola.test', cargo: 'Professora', telefone: '11999990001', perfil_dominante: 'D' }]
    : []),
});
const gateSupabase = vi.fn(async (_p?: string) => sb.client);
const sendEmail = vi.fn(async (_b: any) => ({ ok: true }));

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: (p?: string) => gateSupabase(p) }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: vi.fn(async () => ({ blocked: false })) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/lib/turmas/escopo', () => ({ idsDoEscopoOuFalhar: vi.fn(async () => null), mensagemEscopoObrigatorio: () => null }));
vi.mock('@/lib/email-provider', () => ({
  sendEmail: (b: any) => sendEmail(b),
  emailConfigurationError: () => null,
}));

import { dispararMensagemCustomizada } from '@/app/admin/whatsapp/actions';

describe('dispararMensagemCustomizada: só e-mail', () => {
  beforeEach(() => { sb.reset(); gateSupabase.mockClear(); sendEmail.mockClear(); });

  it('canal WhatsApp é recusado antes de abrir o banco e sem enviar nada', async () => {
    const r: any = await dispararMensagemCustomizada('emp-1', 'Olá {{nome}}', 'whatsapp');
    expect(r).toMatchObject({ success: false, code: 'CANAL_INDISPONIVEL' });
    expect(r.error).toMatch(/template aprovado/);
    expect(gateSupabase).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('e-mail continua saindo, com a variável substituída', async () => {
    const r: any = await dispararMensagemCustomizada('emp-1', 'Olá {{nome}}, da {{empresa}}', 'email', {}, 'Aviso');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'ana@escola.test', subject: 'Aviso', html: 'Olá Ana, da Escola Teste' });
  });
});
