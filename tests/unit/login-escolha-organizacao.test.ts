import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { mockPOST } from '../helpers/mock-request';

/**
 * A tela "em qual organização você quer entrar?" — e o destino que ela NÃO tinha.
 *
 * 🔴 O buraco, medido em 24/08/2026: a lista vinha só de `colaboradores`, e o
 * painel da plataforma não é uma empresa. Os **3** platform admins têm cadastro
 * de colaborador em 2 a 4 empresas cada — então todos caem nessa tela, e nenhuma
 * das opções levava ao painel. Pior: escolher qualquer uma faz a sessão nascer
 * no SUBDOMÍNIO do tenant (o cookie é host-only), e do dashboard não há link de
 * volta — o painel só era alcançável por URL digitada, e mesmo assim caindo
 * deslogada no host genérico.
 *
 * O que estes testes travam:
 *  1. quem administra a plataforma recebe `painelPlataforma: true` — sem esse
 *     campo a opção não tem como aparecer;
 *  2. o mínimo de organizações cai para 1 nesse caso (1 empresa + painel = 2
 *     escolhas de verdade), e continua 2 para todo mundo — a lista de tamanho 1
 *     revelaria onde a pessoa trabalha em troca de nada;
 *  3. o corte é sobre a lista JÁ FILTRADA de demos;
 *  4. o destino do botão do painel é reconhecido pela régua do `/api/auth/
 *     magic-link` que decide o HOST — se as duas divergirem, o botão volta a
 *     mandar a sessão para o tenant, calado.
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

beforeEach(() => {
  sb.reset();
  vinculos = [];
  empresas = [];
  adminDaPlataforma = null;
  slugDoHost = null; // endereço genérico (app.vertho.ai) — é lá que a tela existe
});

describe('POST /api/auth/check-email — as opções da tela de organização', () => {
  it('🔑 sócia da plataforma com 4 empresas: o painel vem como destino, além das 4', async () => {
    vinculos = [
      { empresa_id: 'e1' }, { empresa_id: 'e2' }, { empresa_id: 'e3' }, { empresa_id: 'e4' },
    ];
    empresas = [
      { slug: 'bett', nome: 'Bett', is_demo: false },
      { slug: 'elo', nome: 'Elo Consultoria Social', is_demo: false },
      { slug: 'ibipeba', nome: 'Secretaria Municipal de Ibipeba/BA', is_demo: false },
      { slug: 'teste-piloto', nome: 'Teste Piloto', is_demo: false },
    ];
    adminDaPlataforma = { email: 'juliane@vertho.ai' };

    const body = await checar('juliane@vertho.ai');

    expect(body.painelPlataforma).toBe(true);
    expect(body.orgs).toHaveLength(4);
  });

  it('admin com UMA empresa ainda escolhe: 1 organização + painel = 2 opções', async () => {
    vinculos = [{ empresa_id: 'e1' }];
    empresas = [{ slug: 'bett', nome: 'Bett', is_demo: false }];
    adminDaPlataforma = { email: 'samuel@vertho.ai' };

    const body = await checar('samuel@vertho.ai');

    expect(body.painelPlataforma).toBe(true);
    expect(body.orgs.map((o: any) => o.slug)).toEqual(['bett']);
  });

  it('🔒 quem NÃO administra a plataforma com uma empresa só: nada a perguntar, nada a revelar', async () => {
    vinculos = [{ empresa_id: 'e1' }];
    empresas = [{ slug: 'bett', nome: 'Bett', is_demo: false }];

    const body = await checar('colaborador@empresa.com');

    expect(body.painelPlataforma).toBe(false);
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

  it('num subdomínio de tenant a pergunta não existe — e o campo do painel também não', async () => {
    slugDoHost = 'bett';
    adminDaPlataforma = { email: 'juliane@vertho.ai' };

    const body = await checar('juliane@vertho.ai');

    expect(body.orgs).toBeUndefined();
    expect(body.painelPlataforma).toBeUndefined();
  });
});

describe('o destino do botão do painel × a régua que escolhe o host', () => {
  const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('🔑 `/api/auth/magic-link` reconhece o destino que o login manda — senão a sessão nasce no tenant', () => {
    const login = ler('app/login/login-form.tsx');
    const destino = login.match(/const DESTINO_PAINEL = '([^']+)'/)?.[1];
    expect(destino, 'DESTINO_PAINEL sumiu do login-form').toBeTruthy();

    // O literal é remontado com `new RegExp` (corpo + flags), e não avaliado: o
    // que se quer daqui é a RÉGUA, não executar o arquivo.
    const magic = ler('app/api/auth/magic-link/route.ts');
    const literal = magic.match(
      /const destinoEhPainelPlataforma = \/(.+?)\/([gimsuy]*)\.test\(nextPath\)/,
    );
    expect(literal, 'a régua de host do magic-link mudou de forma').toBeTruthy();

    const regra = new RegExp(literal![1], literal![2]);
    expect(regra.test(destino!)).toBe(true);
  });
});
