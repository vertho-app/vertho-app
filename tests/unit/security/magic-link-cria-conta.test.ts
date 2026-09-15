// `/api/auth/magic-link` — CADASTRAR NÃO ERA DAR ACESSO.
//
// 🔴 O INVARIANTE DESTE ARQUIVO: **quem passou na checagem de elegibilidade tem
// conta.** `generateLink` não cria usuário, então quem estava em `colaboradores`
// mas não em `auth.users` recebia "Falha ao gerar link" — um sintoma que não
// fala de cadastro nenhum e que ninguém reporta, porque a pessoa simplesmente
// desiste de entrar.
//
// Por que existe (medido em 15/09/2026): `importarColaboradoresLote` é um INSERT
// em `colaboradores` e nada mais. 16 professores de `macae` e 20 pessoas da
// `4life-educacao` ficaram sem caminho NENHUM para entrar — a porta do WhatsApp
// (`phone-magic-link/request`) já criava a conta on-demand, a do e-mail não, e a
// assimetria só aparecia quando alguém tentava entrar e não conseguia.
//
// ⚠️ O PAR que não pode quebrar: criar a conta acontece DEPOIS do
// `recipient.eligible`. Criar antes transformaria esta rota numa fábrica de
// `auth.users` para qualquer e-mail digitado por qualquer um.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/** O e-mail tem cadastro de colaborador? Cada teste decide. */
let temColab = true;
/** O que o `createUser` devolve — o GoTrue erra quando a conta já existe. */
let erroCreateUser: { message: string } | null = null;

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'colaboradores') {
      return temColab ? { nome_completo: 'Geane', telefone: '5522997612255', empresa_id: 'emp-1' } : null;
    }
    if (tabela === 'empresas') return { id: 'emp-1', nome: 'Macaé', slug: 'macae' };
    if (tabela === 'platform_admins') return null;
    if (tabela === 'sales_representatives') return null;
    return null;
  },
});

const client = sb.client;
const createUser = vi.fn(async (_args: { email: string; email_confirm?: boolean }) => ({
  data: { user: null },
  error: erroCreateUser,
}));
client.auth = {
  admin: {
    createUser,
    generateLink: vi.fn(async () => ({
      data: { properties: { hashed_token: 'tok-abc123', action_link: 'https://projeto.supabase.co/auth/v1/verify?token=x' } },
      error: null,
    })),
  },
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null } }));

const enviado: any[] = [];
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (p: any) => { enviado.push(p); return { anySent: true, email: 'sent', whatsapp: 'sent' }; },
  recipientFromLookup: (colab: any, admin: any) => ({
    eligible: !!(colab || admin),
    nome: colab?.nome_completo || admin?.nome || '',
    telefone: colab?.telefone ?? null,
  }),
}));

const { POST } = await import('@/app/api/auth/magic-link/route');
const { NextRequest } = await import('next/server');

const HOST = 'macae.vertho.ai';

function pedir(email: string) {
  return POST(new NextRequest(`https://${HOST}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: HOST, 'x-forwarded-host': HOST, 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ email, redirectTo: `https://${HOST}/dashboard` }),
  }) as any);
}

beforeEach(() => {
  sb.reset();
  enviado.length = 0;
  createUser.mockClear();
  temColab = true;
  erroCreateUser = null;
});

describe('🔴 colaborador importado por CSV, sem conta no Auth', () => {
  it('a rota cria a conta antes de gerar o link', async () => {
    await pedir('geane@escola.rj.gov.br');
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser.mock.calls[0][0]).toEqual({
      email: 'geane@escola.rj.gov.br',
      // Ela entra POR magic link: exigir confirmação de um e-mail que este
      // fluxo não envia deixaria a conta criada e inútil.
      email_confirm: true,
    });
  });

  it('e o link sai mesmo assim — criar conta é passo auxiliar, não pré-condição', async () => {
    await pedir('geane@escola.rj.gov.br');
    expect(enviado).toHaveLength(1);
    expect(enviado[0].emailLink).toContain('token');
  });

  it('conta que JÁ existe não interrompe o login', async () => {
    erroCreateUser = { message: 'User already registered' };
    await pedir('quem-ja-entrava@escola.rj.gov.br');
    expect(enviado).toHaveLength(1);
  });

  it('falha inesperada do createUser não derruba quem já tem conta', async () => {
    erroCreateUser = { message: 'unexpected failure' };
    await pedir('quem-ja-entrava@escola.rj.gov.br');
    expect(enviado).toHaveLength(1);
  });
});

describe('⚠️ o par: anti-enumeração continua antes da criação', () => {
  it('e-mail que não é de ninguém NÃO vira conta no Auth', async () => {
    temColab = false;
    await pedir('estranho@qualquer.com');
    expect(createUser).not.toHaveBeenCalled();
    expect(enviado).toHaveLength(0);
  });

  it('e a resposta segue genérica, sem revelar que o e-mail não existe', async () => {
    temColab = false;
    const r: any = await pedir('estranho@qualquer.com');
    expect(await r.json()).toEqual({ success: true });
  });
});
