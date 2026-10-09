import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loginComDestino } from '@/lib/auth/login-com-destino';

/**
 * Quem fica sem sessão dentro do dashboard volta para a tela onde estava. Os dois
 * caminhos do shell (a carga da página e a sessão que cai no meio do uso) usam a
 * mesma função: até 09/10/2026 o segundo mandava para `/login` puro, e quem
 * respondia o mapeamento voltava pela home.
 */
describe('loginComDestino', () => {
  it('leva a tela atual no redirect', () => {
    expect(loginComDestino('/dashboard/assessment', '')).toBe('/login?redirect=%2Fdashboard%2Fassessment');
    expect(loginComDestino('/dashboard/temporada/semana/3', '?trilha=abc')).toBe('/login?redirect=%2Fdashboard%2Ftemporada%2Fsemana%2F3%3Ftrilha%3Dabc');
  });

  it('a home não precisa de redirect', () => {
    expect(loginComDestino('/dashboard', '')).toBe('/login');
  });

  it('caminho que não é local não vira destino', () => {
    expect(loginComDestino('https://outro.site/x', '')).toBe('/login');
    expect(loginComDestino('', '')).toBe('/login');
  });

  it('o shell usa a função nos DOIS caminhos (carga e sessão que cai)', () => {
    const shell = readFileSync('app/dashboard/dashboard-shell.tsx', 'utf8');
    const usos = shell.match(/loginComDestino\(window\.location\.pathname, window\.location\.search\)/g) || [];
    expect(usos.length).toBe(2);
    // o listener não manda mais para o login puro sem olhar se foi "Sair"
    expect(shell).not.toMatch(/if \(event === 'SIGNED_OUT' \|\| !session\) router\.replace\('\/login'\);/);
  });
});
