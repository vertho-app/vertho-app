import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  platformAdmin: true,
  /** Linhas de `notification_deliveries` com chave `beto-acesso:*`. */
  anteriores: [] as any[],
  /** Recebidas deste telefone nas últimas 24 h (elo wamid → chave). */
  recebidas: [] as any[],
  chavesConsultadas: [] as any[],
  empresa: { id: 'emp-tenant', nome: 'Empresa Teste', slug: 'empresa-teste' } as any,
  colaborador: null as any,
  erroLeitura: null as string | null,
  erroUpdate: null as string | null,
  updates: [] as any[],
  generateData: { properties: { hashed_token: 'hash-secreto-123' } } as any,
  generateError: null as any,
  accessResult: { whatsapp: 'sent', email: 'skipped' } as any,
  accessCalls: [] as any[],
  createCalls: [] as any[],
  generateCalls: [] as any[],
}));

vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (entrada: any) => {
    h.accessCalls.push(entrada);
    return h.accessResult;
  },
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantDb: (empresaId: string) => {
    const builder = (tabela: string) => {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.in = (coluna: string, valores: any[]) => {
        if (coluna === 'dedupe_key') h.chavesConsultadas.push(...valores);
        return b;
      };
      b.like = () => b;
      b.gte = () => b;
      b.order = () => b;
      b.update = (valores: any) => {
        const u: any = {};
        u.eq = async (coluna: string, valor: string) => {
          h.updates.push({ empresaId, tabela, valores, coluna, valor });
          return { error: h.erroUpdate ? { message: h.erroUpdate } : null };
        };
        return u;
      };
      b.maybeSingle = async () => {
        if (h.erroLeitura) return { data: null, error: { message: h.erroLeitura } };
        if (tabela === 'platform_admins') {
          return { data: h.platformAdmin ? { id: 'admin-1' } : null, error: null };
        }
        if (tabela === 'empresas') return { data: h.empresa, error: null };
        if (tabela === 'colaboradores') return { data: h.colaborador, error: null };
        return { data: null, error: null };
      };
      b.limit = async () => {
        if (h.erroLeitura) return { data: null, error: { message: h.erroLeitura } };
        if (tabela === 'whatsapp_mensagens_recebidas') return { data: h.recebidas, error: null };
        if (tabela === 'notification_deliveries') return { data: h.anteriores, error: null };
        return { data: [], error: null };
      };
      return b;
    };
    return {
      from: (tabela: string) => builder(tabela),
      raw: { from: (tabela: string) => builder(tabela) },
      auth: {
        admin: {
          createUser: async (entrada: any) => {
            h.createCalls.push(entrada);
            return { data: {}, error: null };
          },
          generateLink: async (entrada: any) => {
            h.generateCalls.push(entrada);
            return { data: h.generateData, error: h.generateError };
          },
        },
      },
    };
  },
}));

import {
  decidirDestinoLinkBeto,
  enviarLinkAcessoBeto,
  identidadeDeAcessoDoColaborador,
  type EntradaLinkAcessoBeto,
} from '@/lib/whatsapp/beto-access-link';
import { proxyEmailFromPhone } from '@/lib/phone-otp';

const entrada: EntradaLinkAcessoBeto = {
  empresaBaseId: 'emp-acme',
  email: 'rodrigo@vertho.ai',
  nome: 'Rodrigo Navarro',
  telefone: '5511973882303',
  numeroId: 'numero-cloud-1',
  waMessageId: 'wamid.NOVO',
  vinculos: [{ id: 'col-1', empresaId: 'emp-tenant', loginPorWhatsapp: true }],
};

const AGORA = Date.parse('2026-09-22T15:00:00Z');

beforeEach(() => {
  h.platformAdmin = true;
  h.anteriores = [];
  h.recebidas = [];
  h.chavesConsultadas = [];
  h.empresa = { id: 'emp-tenant', nome: 'Empresa Teste', slug: 'empresa-teste' };
  h.colaborador = {
    id: 'col-ana',
    nome_completo: 'Ana Souza',
    email: 'ana@escola.gov.br',
    telefone: '5574999225966',
    whatsapp: null,
    login_por_whatsapp: true,
  };
  h.erroLeitura = null;
  h.erroUpdate = null;
  h.updates = [];
  h.generateData = { properties: { hashed_token: 'hash-secreto-123' } };
  h.generateError = null;
  h.accessResult = { whatsapp: 'sent', email: 'skipped' };
  h.accessCalls = [];
  h.createCalls = [];
  h.generateCalls = [];
});

describe('destino do link pedido ao Beto', () => {
  it('admin da plataforma vai ao painel genérico', () => {
    expect(decidirDestinoLinkBeto(true, entrada.vinculos)).toEqual({
      tipo: 'plataforma', empresaId: null, colaboradorId: null,
    });
  });

  it('colaborador precisa de exatamente um tenant habilitado', () => {
    expect(decidirDestinoLinkBeto(false, entrada.vinculos)).toEqual({
      tipo: 'tenant', empresaId: 'emp-tenant', colaboradorId: 'col-1',
    });
    expect(decidirDestinoLinkBeto(false, [
      ...entrada.vinculos,
      { id: 'col-2', empresaId: 'emp-2', loginPorWhatsapp: true },
    ]).tipo).toBe('ambiguo');
  });
});

describe('emissão determinística do acesso', () => {
  it('admin recebe template para app.vertho.ai/admin-v2 sem expor o token à IA', async () => {
    const r = await enviarLinkAcessoBeto(entrada, AGORA);
    expect(r).toEqual({ enviou: true, motivo: 'link-plataforma' });
    expect(h.generateCalls[0]).toEqual(expect.objectContaining({
      type: 'magiclink',
      email: 'rodrigo@vertho.ai',
      options: { redirectTo: 'https://app.vertho.ai/admin-v2' },
    }));
    expect(h.accessCalls[0]).toEqual(expect.objectContaining({
      channels: ['whatsapp'],
      acessoParam: 'plataforma~hash-secreto-123',
      whatsappDedupeKey: 'beto-acesso:wamid.NOVO',
      whatsappOrigem: 'suporte-auto',
      numeroId: 'numero-cloud-1',
      whatsappTemplateRequired: true,
    }));
    const callback = new URL(h.accessCalls[0].whatsappLink);
    expect(callback.host).toBe('app.vertho.ai');
    expect(callback.searchParams.get('next')).toBe('/admin-v2');
  });

  it('não-admin recebe link do único tenant com login por WhatsApp', async () => {
    h.platformAdmin = false;
    const r = await enviarLinkAcessoBeto(entrada, AGORA);
    expect(r).toEqual({ enviou: true, motivo: 'link-tenant' });
    expect(h.generateCalls[0].options.redirectTo).toBe('https://empresa-teste.vertho.ai/dashboard');
    expect(h.accessCalls[0]).toEqual(expect.objectContaining({
      empresaId: 'emp-tenant',
      colaboradorId: 'col-1',
      tenantSlug: 'empresa-teste',
      acessoParam: 'empresa-teste~hash-secreto-123',
    }));
  });

  it('interno só aceita @vertho.ai', async () => {
    const r = await enviarLinkAcessoBeto({ ...entrada, email: 'ana@escola.gov.br' }, AGORA);
    expect(r).toEqual({ enviou: false, motivo: 'email-interno-invalido' });
    expect(h.generateCalls).toHaveLength(0);
  });
});

describe('teto de links: a chave vive em notification_deliveries', () => {
  // 🔴 A versão anterior procurava `beto-acesso:*` em
  // `whatsapp_mensagens_enviadas`, onde só o inbox grava `dedupe_key`: o
  // intervalo e o teto nunca seguravam nada.
  it('a consulta usa as chaves dos wamids que ESTE telefone mandou', async () => {
    h.recebidas = [{ wa_message_id: 'wamid.A' }, { wa_message_id: 'wamid.B' }];
    await enviarLinkAcessoBeto(entrada, AGORA);
    expect(h.chavesConsultadas).toEqual([
      'beto-acesso:wamid.NOVO', 'beto-acesso:wamid.A', 'beto-acesso:wamid.B',
    ]);
  });

  it('intervalo de 5 min impede gerar vários links em sequência', async () => {
    h.recebidas = [{ wa_message_id: 'wamid.ANTIGO' }];
    h.anteriores = [{
      dedupe_key: 'beto-acesso:wamid.ANTIGO',
      status: 'sucesso',
      created_at: '2026-09-22T14:58:00Z',
    }];
    const r = await enviarLinkAcessoBeto(entrada, AGORA);
    expect(r).toEqual({ enviou: false, motivo: 'link-recente' });
    expect(h.generateCalls).toHaveLength(0);
    expect(h.accessCalls).toHaveLength(0);
  });

  it('teto de 3 links por dia; tentativa que falhou não conta', async () => {
    h.anteriores = ['A', 'B', 'C'].map((w) => ({
      dedupe_key: `beto-acesso:wamid.${w}`, status: 'sucesso', created_at: '2026-09-22T10:00:00Z',
    }));
    expect(await enviarLinkAcessoBeto(entrada, AGORA)).toEqual({ enviou: false, motivo: 'teto-diario' });

    h.anteriores[2].status = 'falha';
    expect((await enviarLinkAcessoBeto(entrada, AGORA)).enviou).toBe(true);
  });

  it('reentrega do mesmo wamid é idempotente', async () => {
    h.anteriores = [{
      dedupe_key: 'beto-acesso:wamid.NOVO',
      status: 'sucesso',
      created_at: '2026-09-22T12:00:00Z',
    }];
    const r = await enviarLinkAcessoBeto(entrada, AGORA);
    expect(r).toEqual({ enviou: false, motivo: 'reentrega' });
    expect(h.generateCalls).toHaveLength(0);
  });
});

describe('colaborador comum (Beto aberto para todos)', () => {
  const colab: EntradaLinkAcessoBeto = {
    ...entrada,
    empresaBaseId: 'emp-tenant',
    email: 'ana@escola.gov.br',
    nome: 'Ana Souza',
    telefone: '5574999225966',
    vinculos: [{ id: 'col-ana', empresaId: 'emp-tenant', loginPorWhatsapp: true }],
    origem: 'colaborador',
  };

  it('recebe o link do próprio tenant', async () => {
    h.platformAdmin = false;
    const r = await enviarLinkAcessoBeto(colab, AGORA);
    expect(r).toEqual({ enviou: true, motivo: 'link-tenant' });
    expect(h.createCalls[0]).toEqual({ email: 'ana@escola.gov.br', email_confirm: true });
    expect(h.accessCalls[0]).toEqual(expect.objectContaining({
      empresaId: 'emp-tenant', colaboradorId: 'col-ana', tenantSlug: 'empresa-teste',
    }));
    expect(h.updates).toHaveLength(0);
  });

  it('se o e-mail for de admin da plataforma, vai ao painel (invariante do magic-link)', async () => {
    h.platformAdmin = true;
    const r = await enviarLinkAcessoBeto(colab, AGORA);
    expect(r).toEqual({ enviou: true, motivo: 'link-plataforma' });
  });

  it('phone-only: grava o proxy no cadastro ANTES de criar a conta', async () => {
    h.platformAdmin = false;
    const proxy = proxyEmailFromPhone('emp-tenant', '5574999225966');
    const r = await enviarLinkAcessoBeto({ ...colab, email: proxy, gravarEmailProxyEm: 'col-ana' }, AGORA);
    expect(r.enviou).toBe(true);
    expect(h.updates).toEqual([{
      empresaId: 'emp-tenant', tabela: 'colaboradores', valores: { email: proxy }, coluna: 'id', valor: 'col-ana',
    }]);
  });

  it('falha ao gravar o proxy: não cria conta nem manda link', async () => {
    h.platformAdmin = false;
    h.erroUpdate = 'violação de índice';
    const proxy = proxyEmailFromPhone('emp-tenant', '5574999225966');
    const r = await enviarLinkAcessoBeto({ ...colab, email: proxy, gravarEmailProxyEm: 'col-ana' }, AGORA);
    expect(r).toEqual({ enviou: false, motivo: 'falha-gravar-email-proxy', detalhe: 'violação de índice' });
    expect(h.createCalls).toHaveLength(0);
    expect(h.accessCalls).toHaveLength(0);
  });

  it('e-mail real nunca é sobrescrito, mesmo se pedirem', async () => {
    h.platformAdmin = false;
    await enviarLinkAcessoBeto({ ...colab, gravarEmailProxyEm: 'col-ana' }, AGORA);
    expect(h.updates).toHaveLength(0);
  });
});

describe('identidade de acesso do colaborador', () => {
  it('cadastro com e-mail real: usa o e-mail, sem gravar nada', async () => {
    const r = await identidadeDeAcessoDoColaborador('emp-tenant', 'col-ana', '557499225966');
    expect(r).toEqual({
      ok: true,
      email: 'ana@escola.gov.br',
      nome: 'Ana Souza',
      vinculos: [{ id: 'col-ana', empresaId: 'emp-tenant', loginPorWhatsapp: true }],
      gravarEmailProxyEm: null,
    });
  });

  it('phone-only: proxy do telefone de LOGIN, marcado para gravação', async () => {
    h.colaborador = { ...h.colaborador, email: null };
    const r = await identidadeDeAcessoDoColaborador('emp-tenant', 'col-ana', '557499225966');
    expect(r).toEqual(expect.objectContaining({
      ok: true,
      email: proxyEmailFromPhone('emp-tenant', '5574999225966'),
      gravarEmailProxyEm: 'col-ana',
    }));
  });

  it('login por WhatsApp desabilitado: sem acesso por aqui (mesma regra das rotas de telefone)', async () => {
    h.colaborador = { ...h.colaborador, login_por_whatsapp: false };
    expect(await identidadeDeAcessoDoColaborador('emp-tenant', 'col-ana', '5574999225966'))
      .toEqual({ ok: false, motivo: 'login-whatsapp-desabilitado' });
  });

  it('telefone que escreveu não é o do cadastro: sem acesso', async () => {
    expect(await identidadeDeAcessoDoColaborador('emp-tenant', 'col-ana', '5511900000000'))
      .toEqual({ ok: false, motivo: 'telefone-divergente' });
  });

  it('colaborador fora deste tenant não é encontrado', async () => {
    h.colaborador = null;
    expect(await identidadeDeAcessoDoColaborador('emp-tenant', 'col-outro', '5574999225966'))
      .toEqual({ ok: false, motivo: 'colaborador-nao-encontrado' });
  });
});
