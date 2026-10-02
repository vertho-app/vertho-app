import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { empresaDaNavegacao, empresaDaRotaParaAdotar } from '@/app/admin/_shell/empresa-da-navegacao';

/**
 * A régua que torna SIMÉTRICA a sincronização entre a URL e o filtro do header.
 * O defeito que ela fecha (medido 14/09/2026): com `?empresa=A` na URL e o
 * filtro salvo em B, a tela carregava A (o `useEmpresaContexto` dá precedência
 * ao query) e o cabeçalho seguia escrito B. Nada corrigia e nada acusava.
 */
describe('empresaDaNavegacao', () => {
  const A = '455f9366-fb4f-4c58-a79e-f94193464744';
  const B = '9fb419ed-67b2-4706-a54c-6ef10f1c2274';

  it('o PATH escopado manda, e manda mesmo contra um query divergente', () => {
    expect(empresaDaNavegacao(`/admin/empresas/${A}`, null)).toBe(A);
    expect(empresaDaNavegacao(`/admin/empresas/${A}/configuracoes`, B)).toBe(A);
  });

  it('sem path escopado, o `?empresa=` responde: é o caso que faltava', () => {
    expect(empresaDaNavegacao('/admin/fit', A)).toBe(A);
    expect(empresaDaNavegacao('/admin/competencias', A)).toBe(A);
  });

  it('sem path e sem query não há pedido de navegação: quem decide é o filtro do header', () => {
    expect(empresaDaNavegacao('/admin/fit', null)).toBeNull();
    expect(empresaDaNavegacao('/admin/fit', '')).toBeNull();
    expect(empresaDaNavegacao('/admin/fit', '   ')).toBeNull();
    expect(empresaDaNavegacao(null, undefined)).toBeNull();
  });

  it('`/admin/empresas` sem id não é rota escopada', () => {
    expect(empresaDaNavegacao('/admin/empresas', null)).toBeNull();
    expect(empresaDaNavegacao('/admin/empresas/', A)).toBe(A);
  });
});

/**
 * Guard: o `AdminShell` tem que CONSUMIR a régua. Sem isto o arquivo puro fica
 * verde e o defeito continua na tela, que é exatamente a forma como ele nasceu
 * (a metade da ida existia, a da volta não).
 */
describe('AdminShell consome a régua', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'admin', '_shell', 'AdminShell.tsx'), 'utf8');

  it('deriva routeEmpresaId por `empresaDaNavegacao`, com o query da URL', () => {
    expect(src).toMatch(/import \{ empresaDaNavegacao\b/);
    expect(src).toMatch(/const routeEmpresaId = empresaDaNavegacao\(pathname, searchParams\?\.get\('empresa'\)\)/);
  });

  it('não voltou a casar o path na mão (era só metade da régua)', () => {
    expect(src).not.toMatch(/const routeEmpresaId = pathname\?\.match/);
  });
});

/**
 * "Todas as empresas" não podia ser escolhido numa tela escopada: o efeito comparava a
 * rota com o FILTRO e o devolvia à empresa da URL. Agora só a MUDANÇA da navegação adota.
 */
describe('empresaDaRotaParaAdotar', () => {
  const A = 'emp-a';
  const B = 'emp-b';

  it('rota nova e conhecida: adota', () => {
    expect(empresaDaRotaParaAdotar(A, null, [A, B])).toBe(A);
    expect(empresaDaRotaParaAdotar(B, A, [A, B])).toBe(B);
  });

  it('a rota já sincronizada NÃO re-adota, mesmo com o filtro em outro valor (o bug do "Todas")', () => {
    expect(empresaDaRotaParaAdotar(A, A, [A, B])).toBeNull();
  });

  it('sem pedido da rota, ou empresa desconhecida: não adota', () => {
    expect(empresaDaRotaParaAdotar(null, A, [A, B])).toBeNull();
    expect(empresaDaRotaParaAdotar('fantasma', null, [A, B])).toBeNull();
    expect(empresaDaRotaParaAdotar(A, null, [])).toBeNull();
  });
});

describe('AdminShell: "Todas as empresas" sai da rota escopada', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'admin', '_shell', 'AdminShell.tsx'), 'utf8');

  it('o efeito de volta usa a régua de mudança, não a divergência com o filtro', () => {
    expect(src).toMatch(/empresaDaRotaParaAdotar\(/);
    expect(src).not.toMatch(/routeEmpresaId !== empresaFiltro/);
  });

  it("escolher 'all' numa rota /admin/empresas/{id} navega para o painel global", () => {
    expect(src).toMatch(/id === 'all' && m\)[\s\S]{0,200}router\.replace\('\/admin\/dashboard'\)/);
  });
});
