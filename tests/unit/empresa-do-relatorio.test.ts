import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolverEmpresaDoRelatorio } from '@/lib/auth/empresa-do-relatorio';

/**
 * 🔴 O defeito que esta régua existe para não repetir (14/09/2026): o botão
 * "Consolidado em PDF" da tela de admin respondeu `{"error":"sessão sem
 * empresa"}` com a empresa escolhida na URL. A guarda `if (!auth.empresaId)`
 * rodava ANTES de ler o parâmetro, e o platform admin desta base tem
 * `empresaId` NULO na sessão: a guarda media a sessão, a decisão era do
 * parâmetro, e as duas nunca se encontravam.
 */

const EMPRESA_DA_ROTA = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const EMPRESA_DA_SESSAO = 'aaaaaaaa-1111-2222-3333-444444444444';

describe('de qual empresa é o relatório', () => {
  it('platform admin SEM empresa na sessão usa a empresa da rota (o caso que quebrou)', () => {
    expect(resolverEmpresaDoRelatorio({ empresaId: null, isPlatformAdmin: true }, EMPRESA_DA_ROTA))
      .toBe(EMPRESA_DA_ROTA);
  });

  it('platform admin COM empresa na sessão ainda respeita o filtro da tela', () => {
    // A tela de admin tem um seletor de empresa; se a sessão vencesse, o botão
    // baixaria o PDF de um tenant enquanto a tela mostra outro.
    expect(resolverEmpresaDoRelatorio({ empresaId: EMPRESA_DA_SESSAO, isPlatformAdmin: true }, EMPRESA_DA_ROTA))
      .toBe(EMPRESA_DA_ROTA);
  });

  it('gestor e RH IGNORAM o parâmetro: a empresa é a da sessão', () => {
    // O documento é nominal (nomes, cargos, notas). Aceitar `empresaId` do
    // cliente seria leitura cross-tenant de PII a um parâmetro de distância.
    for (const auth of [{ empresaId: EMPRESA_DA_SESSAO }, { empresaId: EMPRESA_DA_SESSAO, isPlatformAdmin: false }]) {
      expect(resolverEmpresaDoRelatorio(auth, EMPRESA_DA_ROTA)).toBe(EMPRESA_DA_SESSAO);
    }
  });

  it('sem sessão e sem parâmetro não inventa tenant', () => {
    expect(resolverEmpresaDoRelatorio({ empresaId: null }, null)).toBeNull();
    expect(resolverEmpresaDoRelatorio({ empresaId: null, isPlatformAdmin: true }, null)).toBeNull();
    // Parâmetro vazio ou em branco não vale como escolha.
    expect(resolverEmpresaDoRelatorio({ empresaId: null, isPlatformAdmin: true }, '   ')).toBeNull();
    expect(resolverEmpresaDoRelatorio({ empresaId: null, isPlatformAdmin: true }, undefined)).toBeNull();
  });

  it('cliente sem empresa na sessão não herda o parâmetro', () => {
    // O `||` no lugar do ternário abriria exatamente aqui: sessão sem empresa
    // passaria a aceitar o tenant que o browser mandar.
    expect(resolverEmpresaDoRelatorio({ empresaId: null, isPlatformAdmin: false }, EMPRESA_DA_ROTA)).toBeNull();
  });
});

describe('a rota do consolidado usa a régua e guarda o valor resolvido', () => {
  const ROTA = readFileSync('app/api/relatorios/evolucao/pdf/route.ts', 'utf8');

  it('resolve antes de guardar, e guarda o que vai ser usado', () => {
    expect(ROTA).toContain('resolverEmpresaDoRelatorio(auth, searchParams.get(\'empresa\'))');
    expect(ROTA).not.toContain("if (!auth.empresaId)");
    const iResolve = ROTA.indexOf('const empresaId = resolverEmpresaDoRelatorio');
    const iGuarda = ROTA.indexOf('if (!empresaId)');
    expect(iResolve).toBeGreaterThan(-1);
    expect(iGuarda).toBeGreaterThan(iResolve);
  });

  it('nenhuma leitura sobra na empresa da SESSÃO depois da resolução', () => {
    // `tenantDb`, o nome da empresa, o recorte de turma, o agregado e a marca
    // têm que usar o mesmo `empresaId`; um resíduo de `auth.empresaId` aqui
    // baixaria o PDF de um tenant com o nome de outro.
    const corpo = ROTA.slice(ROTA.indexOf('const empresaId = resolverEmpresaDoRelatorio'));
    expect(corpo).not.toContain('auth.empresaId');
  });
});
