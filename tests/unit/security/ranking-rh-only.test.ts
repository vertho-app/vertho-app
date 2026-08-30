import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('ranking de adequação exclusivo do RH', () => {
  it('protege a rota, as actions e a navegação — não apenas o ícone', () => {
    const page = read('app/dashboard/gestor/ranking/page.tsx');
    const actions = read('actions/ranking-adequacao.ts');
    const shell = read('app/dashboard/dashboard-shell.tsx');

    expect(page).toContain("requireRoleAction(['rh'])");
    expect(actions).toContain("ctx?.role !== 'rh'");
    expect(shell).toMatch(/href: '\/dashboard\/gestor\/ranking'.*rhOnly: true/);
    expect(shell).not.toMatch(/href: '\/dashboard\/gestor\/ranking'.*gestorOnly: true/);
  });

  it('abre o PDF no leitor da própria tela', () => {
    const view = read('components/ranking-adequacao-view.tsx');
    expect(view).toContain('<InAppPdfDocument');
    expect(view).toContain("setPdfUrl(r.url)");
    expect(view).not.toContain("window.open(r.url, '_blank')");
  });

  it('resolve o vídeo nominal no card e novamente no leitor interno', () => {
    const home = read('app/dashboard/home-actions.ts');
    const reader = read('app/dashboard/conteudo/[id]/page.tsx');
    expect(home).toContain('findReadyPersonalizedVideo');
    expect(reader).toContain('findReadyPersonalizedVideo');
  });
});
