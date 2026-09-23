import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `enviarMagicLinksWhatsApp` (aba "Magic Link WhatsApp" de /admin/whatsapp).
 *
 * Até 22/09/2026 o lote mandava o link em TEXTO LIVRE pela Z-API, desconectada
 * desde 11/08: último sucesso em 13/08, 113 falhas até 18/08, e o botão seguia
 * na tela. Pela API oficial o link de acesso só sai no BOTÃO do template
 * aprovado, empacotado como `<slug>~<token_hash>` para o `/entrar`.
 *
 * O que se prova aqui, com o contrato do template e a validação do parâmetro
 * REAIS (só as fronteiras são mockadas): o lote sai pela Cloud API com o
 * parâmetro que o `/entrar` lê, nunca encosta na Z-API, recusa ANTES de gerar
 * link quando o template está desligado, e quem não tem token vira erro dessa
 * pessoa em vez de botão para lugar nenhum.
 */

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8';
const COLABS = [
  { id: 'c1', nome_completo: 'Ana Souza', email: 'ana@escola.test', cargo: 'Professor', telefone: '(11) 99999-0001', perfil_dominante: 'D' },
  // sem telefone: fica de fora do lote antes de qualquer link
  { id: 'c2', nome_completo: 'Bia Lima', email: 'bia@escola.test', cargo: 'Professor', telefone: null, perfil_dominante: 'I' },
];

let sb = criarSupabaseMock({
  resolver: (t) => (t === 'empresas' ? { nome: 'Escola Teste', slug: 'escolateste' } : null),
  lista: (t) => (t === 'colaboradores' ? COLABS : []),
});
const generateLink = vi.fn(async (_o: any) => ({ data: { properties: { hashed_token: TOKEN, action_link: 'https://supabase.test/verify' } }, error: null as any }));
const createUser = vi.fn(async (_o: any) => ({ error: null }));
const publicarTemplate = vi.fn(async (_p: any, _d?: number) => {});
const publicarTexto = vi.fn(async (_p: any, _d?: number) => {});
const zapi = vi.fn(() => { throw new Error('a Z-API não pode ser usada por este lote'); });
const auditoria = vi.fn(async (..._a: any[]) => {});
let templateLigado: string | null = 'acesso_vertho';

function ligarAuth() {
  (sb.client as any).auth = { admin: { generateLink, createUser } };
}

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: vi.fn(async () => ({ blocked: false })) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...a: any[]) => auditoria(...(a as [])) }));
vi.mock('@/lib/turmas/escopo', () => ({ idsDoEscopoOuFalhar: vi.fn(async () => null), mensagemEscopoObrigatorio: () => null }));
vi.mock('@/lib/qstash-publish', () => ({
  publicarTemplateCloudCis: (p: any, d?: number) => publicarTemplate(p, d),
  publicarWhatsappCis: (p: any, d?: number) => publicarTexto(p, d),
}));
vi.mock('@/lib/zapi', () => ({ getZapiConfig: () => zapi(), assertZapiConnected: async () => zapi() }));
vi.mock('@/lib/whatsapp', () => ({ assertFilaDoProvedorLimpa: async () => zapi() }));
vi.mock('@/lib/whatsapp/cloud-api', async (orig) => ({ ...(await orig<any>()), cloudApiConfigurada: () => true }));
vi.mock('@/lib/notifications/pilula-template', async (orig) => ({
  ...(await orig<any>()),
  templateAtivo: (papel: string) => (papel === 'acesso' ? templateLigado : null),
}));

import { enviarMagicLinksWhatsApp } from '@/app/admin/whatsapp/actions';
import { lerParametroAcesso } from '@/lib/auth/magic-link-whatsapp';

describe('enviarMagicLinksWhatsApp: lote de magic links pela Cloud API', () => {
  beforeEach(() => {
    sb.reset(); ligarAuth();
    for (const f of [generateLink, createUser, publicarTemplate, publicarTexto, zapi, auditoria]) f.mockClear();
    templateLigado = 'acesso_vertho';
    process.env.QSTASH_TOKEN = 'qstash-teste';
  });

  it('enfileira o template de acesso com `<slug>~<token_hash>` no botão, sem texto livre e sem Z-API', async () => {
    const r = await enviarMagicLinksWhatsApp('emp-1');

    expect(r.success).toBe(true);
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(generateLink.mock.calls[0][0]).toMatchObject({ type: 'magiclink', email: 'ana@escola.test' });
    expect(publicarTemplate).toHaveBeenCalledTimes(1);
    const [payload] = publicarTemplate.mock.calls[0];
    expect(payload).toMatchObject({
      telefone: '5511999990001',
      template: 'acesso_vertho',
      templateParams: [],
      templateBotaoParam: `escolateste~${TOKEN}`,
      kindEnvio: 'magic_link',
      colaboradorId: 'c1',
      empresaId: 'emp-1',
    });
    // O que vai no botão é exatamente o que o `/entrar` desempacota.
    expect(lerParametroAcesso(payload.templateBotaoParam)).toEqual({ slug: 'escolateste', tokenHash: TOKEN });
    // Chave por lote e pessoa: estável na retentativa, nova no lote seguinte.
    expect(payload.templateDedupeKey).toMatch(/^magic_link:[a-z0-9]+:c1$/);
    expect(publicarTexto).not.toHaveBeenCalled();
    expect(zapi).not.toHaveBeenCalled();
    expect(auditoria.mock.calls.at(-1)?.[0]).toMatchObject({ acao: 'whatsapp.magic_links', detalhes: { via: 'cloud-api', template: 'acesso_vertho', enviados: 1 } });
  });

  it('template de acesso desligado: recusa ANTES de gerar link ou enfileirar, e audita o bloqueio', async () => {
    templateLigado = null;
    const r = await enviarMagicLinksWhatsApp('emp-1');

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Template de acesso/);
    expect(generateLink).not.toHaveBeenCalled();
    expect(publicarTemplate).not.toHaveBeenCalled();
    expect(publicarTexto).not.toHaveBeenCalled();
    expect(auditoria.mock.calls.at(-1)?.[0]).toMatchObject({ detalhes: { bloqueado: 'template_acesso_indisponivel' }, resultado: 'erro' });
  });

  it('link sem token_hash vira erro da pessoa, nunca um botão que não abre nada', async () => {
    generateLink.mockResolvedValueOnce({ data: { properties: { hashed_token: undefined as any, action_link: 'https://supabase.test/verify' } }, error: null });
    const r = await enviarMagicLinksWhatsApp('emp-1');

    expect(r.success).toBe(false);
    expect(publicarTemplate).not.toHaveBeenCalled();
    expect(r.error).toMatch(/0 magic links/);
  });
});
