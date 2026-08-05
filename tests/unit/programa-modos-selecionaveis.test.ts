import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProgramaConfigByModo, PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';

/**
 * Um modo do programa só existe de verdade quando as TRÊS pontas o conhecem:
 *
 *   1. a engine  (`getProgramaConfigByModo`)
 *   2. a tela    (aba Programa + override por colaborador)
 *   3. o servidor(allowlist de `atualizarProgramaModo`)
 *
 * Em 05/08/2026 a jornada entrou na engine e ficou INESCOLHÍVEL: a grade da
 * tela tinha a lista de opções escrita à mão e a action recusava o valor com
 * "Modo inválido". Nada no typecheck acusa — o modo existe, compila, e não há
 * caminho para ligá-lo.
 */

const raiz = process.cwd();
const TELA = readFileSync(join(raiz, 'app/admin/empresas/[empresaId]/configuracoes/page.tsx'), 'utf-8');
const ACTIONS = readFileSync(join(raiz, 'app/admin/empresas/[empresaId]/configuracoes/actions.ts'), 'utf-8');

/** Modos que um admin precisa conseguir escolher na tela. */
const SELECIONAVEIS = ['jornada', 'regular_duo', 'regular_single', 'onboarding', 'piloto'];

describe('modos do programa são escolhíveis de ponta a ponta', () => {
  it.each(SELECIONAVEIS)('%s: a engine resolve uma config própria', (modo) => {
    const cfg = getProgramaConfigByModo(modo);
    expect(cfg.semanas, `${modo} sem duração`).toBeGreaterThan(0);
    // 'regular_duo' é o default de fallback; os outros têm que resolver para si
    // mesmos, senão escolher o modo não muda nada.
    if (modo !== 'regular_duo') {
      expect(cfg, `${modo} caiu no default`).not.toBe(getProgramaConfigByModo('inexistente'));
    }
  });

  it.each(SELECIONAVEIS)('%s: aparece na aba Programa da tela', (modo) => {
    expect(TELA).toContain(`id: '${modo}'`);
  });

  it.each(SELECIONAVEIS)('%s: aparece no override por colaborador', (modo) => {
    expect(TELA).toContain(`<option value="${modo}">`);
  });

  it.each(SELECIONAVEIS)('%s: a action de salvar aceita', (modo) => {
    const lista = ACTIONS.match(/const validos = \[(.*?)\];/s)?.[1] ?? '';
    expect(lista, `'${modo}' fora da allowlist de atualizarProgramaModo`).toContain(`'${modo}'`);
  });

  it('a jornada resolve para 7 semanas — não para o default de 14', () => {
    expect(getProgramaConfigByModo('jornada')).toBe(PROGRAMA_JORNADA);
    expect(getProgramaConfigByModo('jornada').semanas).toBe(7);
  });
});
