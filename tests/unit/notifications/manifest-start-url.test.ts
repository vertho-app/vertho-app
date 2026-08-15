// `start_url` do PWA (app/manifest.webmanifest/route.ts).
//
// 🔴 O CASO REAL (15/08/2026): o atalho salvo na tela de início abria e dizia
// "colaborador não encontrado". O manifest cravava `start_url: '/dashboard'`
// para todo mundo — e `/dashboard` resolve a pessoa pelo header do TENANT.
// Instalado a partir de `app.vertho.ai` (domínio da plataforma, sem tenant),
// não havia subdomínio para desempatar, e quem está em MAIS DE UM tenant — o
// caso de quem opera a plataforma — não era resolvido.
//
// O teste lê a fonte porque a rota depende de `headers()` e de resolução de
// tenant: montar esse ambiente custaria mais do que a garantia que dá. O que
// precisa ser verdade é simples — o destino não pode ser fixo.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const fonte = readFileSync('app/manifest.webmanifest/route.ts', 'utf-8');

describe('start_url do manifest', () => {
  it('🔴 NÃO é fixo em /dashboard — depende de haver tenant', () => {
    expect(/start_url:\s*'\/dashboard'/.test(fonte)).toBe(false);
    expect(fonte).toMatch(/start_url:\s*tenant\s*\?/);
  });

  it('com tenant vai para o dashboard; sem tenant, para a raiz que decide', () => {
    const linha = fonte.match(/start_url:.*/)?.[0] ?? '';
    expect(linha).toContain("'/dashboard'");
    expect(linha).toContain("'/'");
  });

  it('a raiz decide pela sessão em vez de mandar todo mundo ao login', () => {
    // Sem isso, o atalho da equipe cai no login e volta para lugar nenhum.
    const raiz = readFileSync('app/page.tsx', 'utf-8');
    expect(raiz).toMatch(/checarAcessoPlataforma\(\)/);
    expect(raiz).toMatch(/'\/admin-v2'/);
  });
});
