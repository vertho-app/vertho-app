import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda D, d-mail (04/10/2026): quando a leitura do idioma dos destinatários falha,
 * os três disparos do admin mandam os e-mails no padrão (o que saía antes da onda)
 * e DIZEM isso a quem opera. Fallback pode existir, nunca invisível.
 */

const h = vi.hoisted(() => ({
  idiomas: { padrao: null as any, falhou: true, motivo: 'colaboradores: timeout no pool', de: vi.fn((_id?: string | null) => 'pt-BR' as any) },
  sendEmail: vi.fn(async (_b: any) => ({ ok: true, provider: 'resend' })),
}));

vi.mock('@/lib/idioma-do-destinatario', () => ({ carregarIdiomasDaEmpresa: vi.fn(async () => h.idiomas) }));
vi.mock('@/lib/email-provider', () => ({
  sendEmail: (b: any) => h.sendEmail(b),
  emailConfigurationError: () => null,
  emailProviderName: () => 'resend',
}));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sbAtual.client),
  requireEmpresaSupabase: vi.fn(async () => sbAtual.client),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sbAtual.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: vi.fn(async () => ({ blocked: false })) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ assertWhatsappAvailable: vi.fn(), sendWhatsapp: vi.fn() }));
vi.mock('@/lib/turmas/escopo', () => ({ idsDoEscopoOuFalhar: vi.fn(async () => null), mensagemEscopoObrigatorio: () => null }));

let sbAtual = criarSupabaseMock({
  resolver: (t) => (t === 'empresas' ? { nome: 'Escola Teste', slug: 'escolateste' } : null),
  escritaUnica: (_t, _op, payload) => ({ ...payload, id: 'env-1' }),
  lista: (t) => (t === 'colaboradores'
    ? [{ id: 'c1', nome_completo: 'Ana Souza', email: 'ana@escola.test', cargo: 'Professora', telefone: null, perfil_dominante: 'D', d_natural: 60 }]
    : []),
});

import { enviarLinksPerfil } from '@/actions/fase5/relatorios-envios';
import { dispararEmails } from '@/actions/fase2';
import { dispararMensagemCustomizada } from '@/app/admin/whatsapp/actions';

describe('falha ao ler o idioma: o disparo sai no padrão e avisa quem opera', () => {
  beforeEach(() => {
    h.sendEmail.mockClear();
    h.idiomas.de.mockClear();
    h.idiomas.falhou = true;
  });

  it('perfil de evolução', async () => {
    const r: any = await enviarLinksPerfil('emp-1');
    expect(r.success).toBe(true);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(r.message).toContain('1 links enviados');
    expect(r.message).toContain('o idioma de cada pessoa não pôde ser lido');
    // o idioma é pedido POR PESSOA
    expect(h.idiomas.de).toHaveBeenCalledWith('c1');
  });

  it('convite de avaliação', async () => {
    const r: any = await dispararEmails('emp-1');
    expect(r.success).toBe(true);
    expect(r.message).toContain('idioma de cada pessoa não lido');
    expect(h.idiomas.de).toHaveBeenCalledWith('c1');
  });

  it('mensagem customizada', async () => {
    const r: any = await dispararMensagemCustomizada('emp-1', 'Oi {{nome}}', 'email', {}, 'Aviso');
    expect(r.success).toBe(true);
    expect(r.message).toContain('idioma de cada pessoa não lido');
    expect(h.idiomas.de).toHaveBeenCalledWith('c1');
  });

  it('leitura sem falha: nenhum aviso na mensagem', async () => {
    h.idiomas.falhou = false;
    expect(((await enviarLinksPerfil('emp-1')) as any).message).toBe('1 links enviados');
    expect(((await dispararEmails('emp-1')) as any).message).not.toContain('idioma');
    expect(((await dispararMensagemCustomizada('emp-1', 'Oi', 'email', {}, 'Aviso')) as any).message).not.toContain('idioma');
  });
});
