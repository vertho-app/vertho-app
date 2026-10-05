/**
 * Análise de segurança de 05/10/2026: o auto-cadastro entregava ao telefone
 * DIGITADO o link de login da conta de OUTRA pessoa.
 *
 * A conta do Auth é global por e-mail e o formulário é anônimo. Quem informava o
 * e-mail da vítima e o próprio telefone recebia no WhatsApp o link de login da
 * conta dela (até de platform admin), e a linha gravada com esse telefone ainda
 * fazia o `magic-link` repetir o envio. A régua agora: telefone digitado por quem
 * não provou ser dono do e-mail NÃO é canal de acesso. Só vale em tenant de
 * demonstração, com a conta recém-criada neste pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

let empresa: any;
const sb = criarSupabaseMock({
  resolver: (tabela: string) => (tabela === 'empresas' ? empresa : null),
});
const client: any = sb.client;

let contaJaExiste = false;
const createUser = vi.fn(async (_a: any) => (
  contaJaExiste
    ? { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }
    : { data: { user: { id: 'u-novo' } }, error: null }
));
const generateLink = vi.fn(async (_a: any) => ({
  data: { properties: { hashed_token: 'tok-abc12345', action_link: 'https://p.supabase.co/v?x=1' } },
  error: null,
}));
client.auth = { admin: { createUser, generateLink } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-resolver', () => ({ getTenantSlug: () => 'bett' }));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null }, limitarPorDestino: async () => null }));

const enviados: any[] = [];
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (p: any) => { enviados.push(p); return { anySent: true, email: 'sent', whatsapp: 'skipped' }; },
}));

const cadastro = await import('@/app/api/auth/signup/route');
const { NextRequest } = await import('next/server');

const corpo = {
  email: 'vitima@empresa.com.br',
  nome_completo: 'Atacante Qualquer',
  telefone: '11987654321',
  redirectTo: 'https://bett.vertho.ai/dashboard',
};

function pedir() {
  return cadastro.POST(new NextRequest('https://bett.vertho.ai/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'bett.vertho.ai', 'x-forwarded-host': 'bett.vertho.ai', 'x-forwarded-proto': 'https' },
    body: JSON.stringify(corpo),
  }) as any);
}

const gravouTelefone = () => {
  const linha = sb.escritas.find((e) => e.tabela === 'colaboradores' && e.op === 'insert');
  expect(linha, 'a linha do colaborador foi gravada').toBeTruthy();
  return linha!.payload.telefone;
};

beforeEach(() => {
  sb.reset();
  enviados.length = 0;
  createUser.mockClear();
  generateLink.mockClear();
  contaJaExiste = false;
  empresa = { id: 'emp-bett', nome: 'Bett', slug: 'bett', is_demo: false, sys_config: { allow_open_signup: true } };
});

describe('auto-cadastro: telefone digitado não é canal de acesso', () => {
  it('🔴 tenant real, e-mail de conta que JÁ EXISTE: link só por e-mail, telefone não gravado', async () => {
    contaJaExiste = true;
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].channels).toEqual(['email']);
    expect(enviados[0].telefone).toBeNull();
    expect(enviados[0].whatsappLink).toBeNull();
    expect(gravouTelefone()).toBeNull();
  });

  it('🔴 tenant real, conta nova: também só por e-mail (o telefone não prova nada)', async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(enviados[0].channels).toEqual(['email']);
    expect(enviados[0].telefone).toBeNull();
    expect(enviados[0].whatsappLink).toBeNull();
    expect(gravouTelefone()).toBeNull();
  });

  it('🔴 tenant de demonstração, mas a conta JÁ EXISTIA: não vale o telefone digitado', async () => {
    empresa = { ...empresa, is_demo: true };
    contaJaExiste = true;
    await pedir();
    expect(enviados[0].channels).toEqual(['email']);
    expect(enviados[0].telefone).toBeNull();
    expect(gravouTelefone()).toBeNull();
  });

  it('tenant de demonstração com conta recém-criada: a degustação segue com WhatsApp', async () => {
    empresa = { ...empresa, is_demo: true };
    await pedir();
    expect(enviados[0].channels).toEqual(['email', 'whatsapp']);
    expect(enviados[0].telefone).toBe('5511987654321');
    expect(enviados[0].whatsappLink).toContain('/auth/callback?token_hash=');
    expect(gravouTelefone()).toBe('5511987654321');
  });

  it('falha ao ler a empresa vira 500 e nada é criado, em vez de "empresa não encontrada"', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const r = await pedir();
    expect(r.status).toBe(500);
    expect(createUser).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(0);
    expect(sb.escritas.filter((e) => e.tabela === 'colaboradores')).toHaveLength(0);
  });

  it('a conta é criada ANTES da linha: é ela que diz se o telefone vale', async () => {
    const ordem: string[] = [];
    createUser.mockImplementationOnce(async () => { ordem.push('createUser'); return { data: { user: { id: 'u' } }, error: null }; });
    const original = client.from.bind(client);
    client.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== 'colaboradores') return q;
      return new Proxy(q, { get: (t: any, k: string) => (k === 'insert' ? (...a: any[]) => { ordem.push('insert'); return t.insert(...a); } : t[k]) });
    };
    try {
      await pedir();
    } finally {
      client.from = original;
    }
    expect(ordem).toEqual(['createUser', 'insert']);
  });
});
