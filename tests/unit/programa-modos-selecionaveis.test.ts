import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getProgramaConfig,
  getProgramaConfigByModo,
  MODOS_OFERECIDOS,
  MODOS_DESCONTINUADOS,
  PROGRAMA_JORNADA,
  PROGRAMA_ONBOARDING,
  PROGRAMA_PILOTO,
  PROGRAMA_REGULAR,
  PROGRAMA_REGULAR_DUO,
} from '@/lib/season-engine/programa-config';

/**
 * Um modo do programa só existe de verdade quando as TRÊS pontas o conhecem:
 *
 *   1. a engine  (`getProgramaConfigByModo` / `getProgramaConfig`)
 *   2. a tela    (aba Programa + override por colaborador + turma no admin-v2)
 *   3. o servidor(`atualizarProgramaModo`, `salvarConfig`, actions de turma)
 *
 * Em 05/08/2026 a jornada entrou na engine e ficou INESCOLHÍVEL: a grade da
 * tela tinha a lista de opções escrita à mão e a action recusava o valor com
 * "Modo inválido". Nada no typecheck acusa.
 *
 * Em 03/10/2026 o contrato ganhou o lado oposto (decisão do dono): Regular
 * (14 semanas, DUO), Regular (single) e Piloto SAEM da escolha, e a engine
 * continua lendo os três, porque há trilhas carimbadas com eles. Esta suíte
 * cobra as duas metades: o que é oferecido é escolhível de ponta a ponta, e o
 * que saiu não aparece como opção, mas segue resolvendo no motor. O servidor
 * (recusa de gravação nova) é provado por comportamento em
 * `programa-modos-gravacao.test.ts`.
 */

const raiz = process.cwd();
const TELA = readFileSync(join(raiz, 'app/admin/empresas/[empresaId]/configuracoes/page.tsx'), 'utf-8');
const TURMAS = readFileSync(join(raiz, 'app/admin-v2/cliente/TurmasPanel.tsx'), 'utf-8');

describe('as listas do contrato', () => {
  it('oferecidos: Jornada, Onboarding e Personalizado, nada mais', () => {
    expect([...MODOS_OFERECIDOS]).toEqual(['jornada', 'onboarding', 'custom']);
  });

  it('descontinuados: os dois Regular, o Piloto e a grafia antiga do DUO', () => {
    expect([...MODOS_DESCONTINUADOS].sort()).toEqual(['piloto', 'regular', 'regular_duo', 'regular_single']);
  });

  it('nenhum rótulo está nas duas listas', () => {
    for (const m of MODOS_OFERECIDOS) expect(MODOS_DESCONTINUADOS as readonly string[]).not.toContain(m);
  });
});

describe('oferecidos: escolhíveis de ponta a ponta', () => {
  it('a engine resolve uma config própria para cada um', () => {
    expect(getProgramaConfigByModo('jornada')).toBe(PROGRAMA_JORNADA);
    expect(getProgramaConfigByModo('onboarding')).toBe(PROGRAMA_ONBOARDING);
    // Personalizado não tem constante: a config sai do `programa_custom`.
    const custom = getProgramaConfig({ programa_modo: 'custom', programa_custom: { semanas: 4, numCompetencias: 1, fechamento: true } });
    expect(custom.semanas).toBe(5);
    expect(custom.slotsConteudo).toEqual([1, 2, 3, 4]);
  });

  it.each([...MODOS_OFERECIDOS])('%s: aparece na aba Programa da tela', (modo) => {
    expect(TELA).toContain(`id: '${modo}'`);
  });

  it.each([...MODOS_OFERECIDOS])('%s: aparece no override por colaborador', (modo) => {
    expect(TELA).toContain(`<option value="${modo}">`);
  });

  it('a turma (admin-v2) oferece a mesma lista, lida do motor', () => {
    expect(TURMAS).toMatch(/OPCOES_MODO[^=]*=\s*\['',\s*\.\.\.MODOS_OFERECIDOS\]/);
  });
});

describe('descontinuados: fora da escolha, dentro do motor', () => {
  it('a engine segue resolvendo cada um para a SUA config (trilha carimbada não muda)', () => {
    expect(getProgramaConfigByModo('regular_duo')).toBe(PROGRAMA_REGULAR_DUO);
    expect(getProgramaConfigByModo('regular')).toBe(PROGRAMA_REGULAR_DUO);
    expect(getProgramaConfigByModo('regular_single')).toBe(PROGRAMA_REGULAR);
    expect(getProgramaConfigByModo('piloto')).toBe(PROGRAMA_PILOTO);
  });

  it.each(['regular_duo', 'regular_single', 'piloto'])('%s: NÃO é card da aba Programa', (modo) => {
    expect(TELA).not.toContain(`id: '${modo}'`);
  });

  it.each(['regular_duo', 'regular_single', 'piloto'])('%s: NÃO é opção do override por colaborador', (modo) => {
    expect(TELA).not.toContain(`<option value="${modo}">`);
  });

  it('quem já está gravado num descontinuado VÊ o valor, rotulado e não oferecido', () => {
    // Override: a opção do valor atual entra só quando ele é descontinuado, e
    // desabilitada (a pessoa vê o que está gravado, não consegue escolhê-lo).
    expect(TELA).toMatch(/ehModoDescontinuado\(c\.programa_modo\) && \(\s*<option value=\{c\.programa_modo\} disabled>/);
    // Aba Programa: aviso com o rótulo do formato atual.
    expect(TELA).toMatch(/ehModoDescontinuado\(config\.programa_modo\) && \(/);
    expect(TELA).toContain("t('program.legacyCurrent'");
  });

  it('a tela NÃO normaliza o valor gravado ao carregar (senão "Salvar" regravaria o programa)', () => {
    // Até 03/10/2026 o carregamento trocava 'regular' e ausente por
    // 'regular_duo' no estado, e o próximo salvamento de QUALQUER aba gravava
    // esse valor. Com o servidor recusando gravação nova de descontinuado, isso
    // travaria o salvamento da empresa inteira.
    expect(TELA).not.toMatch(/sysConf\.programa_modo\s*=\s*'regular_duo'/);
  });
});
