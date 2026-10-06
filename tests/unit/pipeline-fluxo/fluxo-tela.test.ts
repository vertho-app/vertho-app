import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contrato da tela do Fluxo completo que nenhum teste de lógica enxerga (composição de tela, lida do fonte):
 *  - sem estimativa de custo (o dono pediu para tirar, 06/10/2026): nada de US$, "custo" nem faixa;
 *  - a confirmação antes de rodar CONTINUA existindo (só os números saíram dela), e o botão vira "Rodar mesmo assim" com crítico;
 *  - cada pré-requisito mostra os seus links, abrindo em outra aba (a pessoa resolve e volta para "Atualizar").
 */
const pagina = readFileSync(join(process.cwd(), 'app', 'admin', 'empresas', '[empresaId]', 'fluxo', 'page.tsx'), 'utf8');

describe('tela do Fluxo completo', () => {
  it('não mostra custo estimado em lugar nenhum', () => {
    expect(pagina).not.toMatch(/US\$/);
    expect(pagina).not.toMatch(/custo/i);
    expect(pagina).not.toMatch(/custoUsd|custoTotalUsd/);
  });

  it('mantém a confirmação antes de rodar, e o "Rodar mesmo assim" quando há crítico', () => {
    expect(pagina).toContain('Confirmar?');
    expect(pagina).toContain('Rodar mesmo assim');
    expect(pagina).toContain('Sim, rodar');
  });

  it('os links dos pré-requisitos abrem em outra aba, sem passar o opener', () => {
    const trecho = pagina.slice(pagina.indexOf('linksDoPrerequisito(i.id, empresaId)'));
    expect(trecho.slice(0, 700)).toMatch(/target="_blank"/);
    expect(trecho.slice(0, 700)).toMatch(/rel="noopener noreferrer"/);
  });
});
