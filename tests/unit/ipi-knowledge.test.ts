import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ipiPlanSchema, safeIpiHref } from '@/lib/ipi/contracts';
import { searchKnowledge } from '@/lib/ipi/search';

describe('Ipi — conhecimento e navegação', () => {
  it('recusa ferramentas ou instruções de banco fora do catálogo de leitura', () => {
    expect(ipiPlanSchema.safeParse({ searches: [], data: ['sql'], person: '' }).success).toBe(false);
    expect(ipiPlanSchema.safeParse({ searches: [], data: [], person: '', command: 'deploy' }).success).toBe(false);
  });
  it('encontra a tela de relatório no extrato real do manual', () => {
    const manual = JSON.parse(readFileSync('docs/ipi/manual.json', 'utf8'));
    const chunks = manual.pages.flatMap(page => page.sections.map(text => ({ kind: 'manual', title: page.title, reference: page.route, route: page.route, text })));
    const result = searchKnowledge(chunks, 'onde baixar PDF relatório comportamental DISC', '/admin/dashboard');
    expect(result.some(item => item.route.includes('perfis-comportamentais'))).toBe(true);
  });
  it('nenhum email, UUID ou screenshot real entra no manual distribuído', () => {
    const manual = readFileSync('docs/ipi/manual.json', 'utf8');
    expect(manual).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(manual).not.toMatch(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i);
    expect(/\b\d{11,14}\b/.test(manual)).toBe(false);
    expect(/img-web|alvos\.json|"(?:screenshot|captura|imagem)"\s*:/.test(manual)).toBe(false);
  });
  it('só oferece rotas locais resolvidas', () => {
    expect(safeIpiHref('https://evil.example', null)).toBeUndefined();
    expect(safeIpiHref('//evil.example', null)).toBeUndefined();
    expect(safeIpiHref('/admin/empresas/[empresaId]/relatorios', null)).toBeUndefined();
    expect(safeIpiHref('/admin/relatorios', null)).toBe('/admin/relatorios');
  });
});
