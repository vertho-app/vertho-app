import { describe, it, expect } from 'vitest';
import { resolveTheme, fundoEscuroDoDashboard } from '@/lib/ui-resolver';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
};

// Amazon Bowling (30/09/2026): fundo claro do login chegou ao dashboard (só escuro) → título branco sobre amarelo.
describe('resolveTheme — dashboard só aceita fundo escuro', () => {
  const amazon = { bg_gradient_start: '#fefefe', bg_gradient_end: '#e1a701', primary_color: '#D95700', accent_color: '#65BC7B' };
  it('fundo claro vira escuro derivado da cor de marca (mesmo matiz)', () => {
    const t = resolveTheme(amazon);
    expect(lum(t.bgStart)).toBeLessThan(0.05);
    expect(lum(t.bgEnd)).toBeLessThan(0.05);
    expect(t.bgStart).not.toBe('#fefefe');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.bgStart.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g); expect(g).toBeGreaterThan(b); // laranja escuro
  });
  it('fundo escuro configurado passa intocado', () => {
    const t = resolveTheme({ bg_gradient_start: '#001A55', bg_gradient_end: '#002A70' });
    expect([t.bgStart, t.bgEnd]).toEqual(['#001A55', '#002A70']);
  });
  it('sem branding = Vertho exato', () => {
    const t = resolveTheme(null);
    expect([t.bgStart, t.bgEnd]).toEqual(['#091D35', '#0F2A4A']);
  });
  it('claro sem cor de marca válida cai no Vertho; hex inválido não quebra', () => {
    expect(fundoEscuroDoDashboard({ bg_gradient_start: '#ffffff', bg_gradient_end: '#eeeeee' })).toEqual({ bgStart: '#091D35', bgEnd: '#0F2A4A' });
    expect(() => resolveTheme({ bg_gradient_start: 'red', bg_gradient_end: 'blue' })).not.toThrow();
  });
});
