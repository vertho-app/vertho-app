import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { mockPOST } from '../helpers/mock-request';

/**
 * A tela "em qual organização você quer entrar?" e o que a resposta PÚBLICA
 * dela pode dizer.
 *
 * Histórico, porque os dois lados importam:
 *  · 24/08/2026: os 3 platform admins têm cadastro de colaborador em 2 a 4
 *    empresas, e nenhuma opção da lista levava ao painel. A correção da época
 *    pôs `painelPlataforma: true` na resposta do `/api/auth/check-email`, e a
 *    tela passou a oferecer "Administração Vertho".
 *  · 03/10/2026 (R-77): essa resposta é pública. Ela dizia, a quem não se
 *    autenticou, se um e-mail é admin de plataforma, e baixava o corte da lista
 *    para 1 empresa nesse caso. O bit saiu. O painel segue alcançável pela
 *    porta dele: `/admin` manda para `/login?redirect=/admin/dashboard`, a tela
 *    pede o link direto com esse destino, e o `/api/auth/magic-link` confere
 *    `platform_admins` NO SERVIDOR antes de trocar o host.
 *
 * O que estes testes travam:
 *  1. a resposta não diz quem é admin, nem pela presença do campo nem pela
 *     forma da lista (admin e não admin com as mesmas empresas recebem o mesmo);
 *  2. o corte é 2 para todo mundo: lista de tamanho 1 revelaria onde a pessoa
 *     trabalha em troca de nada;
 *  3. o corte é sobre a lista JÁ FILTRADA de demos;
 *  4. a porta do painel (`/admin` → `?redirect=`) é reconhecida pela tela e pela
 *     régua do magic-link que decide o HOST.
 */

let vinculos: any[] = [];
let empresas: any[] = [];
let adminDaPlataforma: any = null;
let slugDoHost: string | null = null;

const sb = criarSupabaseMock({
  lista: (tabela) =>
    tabela === 'colaboradores' ? vinculos : tabela === 'empresas' ? empresas : [],
  resolver: (tabela) => (tabela === 'platform_admins' ? adminDaPlataforma : null),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({ getTenantSlug: () => slugDoHost }));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null } }));

const URL_ROTA = 'http://localhost:3000/api/auth/check-email';

async function checar(email: string) {
  const { POST } = await import('@/app/api/auth/check-email/route');
  const res = await POST(mockPOST(URL_ROTA, { email }) as any);
  return res.json();
}

const QUATRO_EMPRESAS = () => {
  vinculos = [{ empresa_id: 'e1' }, { empresa_id: 'e2' }, { empresa_id: 'e3' }, { empresa_id: 'e4' }];
  empresas = [
    { slug: 'bett', nome: 'Bett', is_demo: false },
    { slug: 'elo', nome: 'Elo Consultoria Social', is_demo: false },
    { slug: 'ibipeba', nome: 'Secretaria Municipal de Ibipeba/BA', is_demo: false },
    { slug: 'teste-piloto', nome: 'Teste Piloto', is_demo: false },
  ];
};

beforeEach(() => {
  sb.reset();
  vinculos = [];
  empresas = [];
  adminDaPlataforma = null;
  slugDoHost = null; // endereço genérico (app.vertho.ai) — é lá que a tela existe
});

describe('POST /api/auth/check-email: a resposta pública não diz quem é admin (R-77)', () => {
  it('🔴 admin de plataforma com 4 empresas: a lista vem, o bit de admin não', async () => {
    QUATRO_EMPRESAS();
    adminDaPlataforma = { email: 'admin@vertho.ai' };

    const body = await checar('admin@vertho.ai');

    expect(body).not.toHaveProperty('painelPlataforma');
    expect(body.orgs).toHaveLength(4);
    // A rota nem pergunta: um bit que não é calculado não vaza por canal nenhum.
    expect(sb.chamadas.some((c) => c.tabela === 'platform_admins')).toBe(false);
  });

  it('🔴 admin e não admin com as MESMAS empresas recebem a MESMA resposta', async () => {
    QUATRO_EMPRESAS();
    adminDaPlataforma = { email: 'admin@vertho.ai' };
    const deAdmin = await checar('admin@vertho.ai');

    sb.reset();
    adminDaPlataforma = null;
    const deColaborador = await checar('colaborador@empresa.com');

    expect(deAdmin).toEqual(deColaborador);
  });

  it('🔴 admin com UMA empresa: nada a perguntar e nada a revelar (o corte não cai para 1)', async () => {
    vinculos = [{ empresa_id: 'e1' }];
    empresas = [{ slug: 'bett', nome: 'Bett', is_demo: false }];
    adminDaPlataforma = { email: 'admin@vertho.ai' };

    const body = await checar('admin@vertho.ai');

    expect(body.orgs).toEqual([]);
    expect(body).not.toHaveProperty('painelPlataforma');
  });

  it('🔒 quem tem uma empresa só: nada a perguntar, nada a revelar', async () => {
    vinculos = [{ empresa_id: 'e1' }];
    empresas = [{ slug: 'bett', nome: 'Bett', is_demo: false }];

    const body = await checar('colaborador@empresa.com');

    expect(body.orgs).toEqual([]);
  });

  it('🔒 duas empresas, uma de demonstração: o corte é sobre a lista JÁ filtrada', async () => {
    vinculos = [{ empresa_id: 'e1' }, { empresa_id: 'e2' }];
    empresas = [
      { slug: 'acme', nome: 'ACME (demo)', is_demo: true },
      { slug: 'bett', nome: 'Bett', is_demo: false },
    ];

    const body = await checar('colaborador@empresa.com');

    expect(body.orgs).toEqual([]);
  });

  it('num subdomínio de tenant a pergunta não existe', async () => {
    slugDoHost = 'bett';
    adminDaPlataforma = { email: 'admin@vertho.ai' };

    const body = await checar('admin@vertho.ai');

    expect(body.orgs).toBeUndefined();
    expect(body).not.toHaveProperty('painelPlataforma');
  });
});

describe('a porta do painel × a régua que escolhe o host', () => {
  const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('🔑 o destino que `/admin` manda para o login é reconhecido pela tela E pelo magic-link', () => {
    const layout = ler('app/admin/layout.tsx');
    const destino = layout.match(/redirect\('\/login\?redirect=([^']+)'\)/)?.[1];
    expect(destino, 'o /admin deixou de mandar para o login com destino').toBeTruthy();

    // O literal é remontado com `new RegExp` (corpo + flags), e não avaliado: o
    // que se quer daqui é a RÉGUA, não executar o arquivo.
    const login = ler('app/login/login-form.tsx');
    const daTela = login.match(/const ehDestinoDoPainel = \(path: string\) => \/(.+?)\/([gimsuy]*)\.test\(path\)/);
    expect(daTela, 'a régua do painel na tela mudou de forma').toBeTruthy();
    expect(new RegExp(daTela![1], daTela![2]).test(destino!)).toBe(true);

    const magic = ler('app/api/auth/magic-link/route.ts');
    const doServidor = magic.match(/const destinoEhPainelPlataforma = \/(.+?)\/([gimsuy]*)\.test\(nextPath\)/);
    expect(doServidor, 'a régua de host do magic-link mudou de forma').toBeTruthy();
    expect(new RegExp(doServidor![1], doServidor![2]).test(destino!)).toBe(true);
  });

  it('com destino de painel, a tela pede o link sem perguntar organização', () => {
    const login = ler('app/login/login-form.tsx');
    const i = login.indexOf('if (ehDestinoDoPainel(redirectTo))');
    const j = login.indexOf('setOrgs(listaOrgs)');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    // E a tela não lê mais o bit que saiu da resposta.
    expect(login).not.toContain('painelPlataforma');
  });
});
