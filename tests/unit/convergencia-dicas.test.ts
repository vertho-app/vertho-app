import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { DICA_VEREDITO } from '@/lib/season-engine/convergencia-dicas';
import { semComentarios } from '../helpers/fonte';

/**
 * A descrição de cada veredito é UMA só: o relatório de evolução (PDF) e a tela
 * Evolução da equipe leem a mesma frase (pedido do dono em 17/09/2026).
 *
 * Desde 21/09/2026 o PDF compara só o cenário inicial com o final e não mostra
 * veredito (`relatorio-evolucao-pdf.test.ts` trava isso); a frase ficou na tela.
 * A varredura de cópia à mão, abaixo, continua cobrindo o PDF.
 */
const RAIZ = path.resolve(__dirname, '../..');
const FONTE = 'lib/season-engine/convergencia-dicas.ts';

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

describe('descrição dos vereditos', () => {
  it('todo veredito tem uma frase', () => {
    const vereditos = Object.values(CONVERGENCIA);
    expect(vereditos).toHaveLength(3);
    for (const veredito of vereditos) expect(DICA_VEREDITO[veredito]?.length ?? 0).toBeGreaterThan(20);
  });

  it.each([
    ['app/dashboard/gestor/equipe-evolucao/page.tsx'],
  ])('%s lê as três frases da fonte única', (arquivo) => {
    const fonte = semComentarios(readFileSync(path.join(RAIZ, arquivo), 'utf8'));
    expect(fonte).toContain('convergencia-dicas');
    for (const chave of ['CONFIRMADA', 'PARCIAL', 'ESTAVEL']) {
      expect(fonte, `${arquivo} sem DICA_VEREDITO[CONVERGENCIA.${chave}]`).toContain(`DICA_VEREDITO[CONVERGENCIA.${chave}]`);
    }
  });

  it('🔴 nenhuma frase é copiada à mão em outro arquivo', () => {
    const copias: string[] = [];
    const frases = Object.values(DICA_VEREDITO);
    for (const dir of ['app', 'components', 'lib']) {
      for (const arquivo of arquivos(path.join(RAIZ, dir))) {
        const relativo = path.relative(RAIZ, arquivo).split(path.sep).join('/');
        if (relativo === FONTE) continue;
        const fonte = readFileSync(arquivo, 'utf8');
        for (const frase of frases) if (fonte.includes(frase)) copias.push(`${relativo}: "${frase}"`);
      }
    }
    expect(copias).toEqual([]);
  });
});
