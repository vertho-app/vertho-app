import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  platformAdmin: true,
  anteriores: [] as any[],
  empresa: { id: 'emp-tenant', nome: 'Empresa Teste', slug: 'empresa-teste' } as any,
  erroLeitura: null as string | null,
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
  tenantDb: () => {
    const builder = (tabela: string) => {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.in = () => b;
      b.like = () => b;
      b.gte = () => b;
      b.order = () => b;
      b.maybeSingle = async () => {
        if (h.erroLeitura) return { data: null, error: { message: h.erroLeitura } };
        if (tabela === 'platform_admins') {
          return { data: h.platformAdmin ? { id: 'admin-1' } : null, error: null };
        }
        if (tabela === 'empresas') return { data: h.empresa, error: null };
        return { data: null, error: null };
      };
      b.limit = async () => h.erroLeitura
        ? { data: null, error: { message: h.erroLeitura } }
        : { data: tabela === 'whatsapp_mensagens_enviadas' ? h.anteriores : [], error: null };
      return b;
    };
    return {
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
  type EntradaLinkAcessoBeto,
} from '@/lib/whatsapp/beto-access-link';

const entrada: EntradaLinkAcessoBeto = {
  empresaAcmeId: 'emp-acme',
  email: 'rodrigo@vertho.ai',
  nome: 'Rodrigo Navarro',
  telefone: '5511973882303',
  numeroId: 'numero-cloud-1',
  waMessageId: 'wamid.NOVO',
  vinculos: [{ id: 'col-1', empresaId: 'emp-tenant', loginPorWhatsapp: true }],
};

beforeEach(() => {
  h.platformAdmin = true;
  h.anteriores = [];
  h.empresa = { id: 'emp-tenant', nome: 'Empresa Teste', slug: 'empresa-teste' };
  h.erroLeitura = null;
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
    const r = await enviarLinkAcessoBeto(entrada, Date.parse('2026-09-22T15:00:00Z'));
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
    const r = await enviarLinkAcessoBeto(entrada, Date.parse('2026-09-22T15:00:00Z'));
    expect(r).toEqual({ enviou: true, motivo: 'link-tenant' });
    expect(h.generateCalls[0].options.redirectTo).toBe('https://empresa-teste.vertho.ai/dashboard');
    expect(h.accessCalls[0]).toEqual(expect.objectContaining({
      empresaId: 'emp-tenant',
      colaboradorId: 'col-1',
      tenantSlug: 'empresa-teste',
      acessoParam: 'empresa-teste~hash-secreto-123',
    }));
  });

  it('cooldown impede gerar vários links em sequência', async () => {
    h.anteriores = [{
      dedupe_key: 'beto-acesso:wamid.ANTIGO',
      erro: null,
      enviada_em: '2026-09-22T14:58:00Z',
    }];
    const r = await enviarLinkAcessoBeto(entrada, Date.parse('2026-09-22T15:00:00Z'));
    expect(r).toEqual({ enviou: false, motivo: 'link-recente' });
    expect(h.generateCalls).toHaveLength(0);
    expect(h.accessCalls).toHaveLength(0);
  });

  it('reentrega do mesmo wamid é idempotente', async () => {
    h.anteriores = [{
      dedupe_key: 'beto-acesso:wamid.NOVO',
      erro: null,
      enviada_em: '2026-09-22T12:00:00Z',
    }];
    const r = await enviarLinkAcessoBeto(entrada, Date.parse('2026-09-22T15:00:00Z'));
    expect(r).toEqual({ enviou: false, motivo: 'reentrega' });
    expect(h.generateCalls).toHaveLength(0);
  });
});
