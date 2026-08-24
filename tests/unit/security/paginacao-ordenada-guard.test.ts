import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * ── B7 (auditoria de 22/08): `.range()` sem `.order()` ─────────────────────
 *
 * PostgREST pagina com LIMIT/OFFSET, e **LIMIT/OFFSET sem ORDER BY não garante
 * ordem nenhuma** — o planner pode devolver a mesma linha em duas páginas e
 * nenhuma numa terceira. O laço de paginação parece exaustivo e não é.
 *
 * Onde isso mordeu: `actions/radarempresas/scoring.ts` paginava 91.934 e 93.710
 * linhas assim, e o `priority_rank` (percentil) transformava a ordem de chegada
 * em nota de corte. `Medido em 24/08:` 74.285 elegíveis, corte em 69,4 e **237
 * empatados nele** — 185 dentro, 52 idênticos fora. A conta foi corrigida em
 * `lib/radarempresas/priority-rank.ts`; este guard cuida da varredura.
 *
 * ⚠️ Ressalva de escopo, para não vender mais do que se mediu: nas 10 execuções
 * gravadas (todas de 15/05/2026) **0 de 93.710 estabelecimentos ficaram sem
 * score**, então o SKIP da paginação não se materializou. O que estava vivo era
 * o empate. O guard fecha o risco antes que ele apareça — em varredura de 90 mil
 * linhas o sintoma seria um número levemente errado, não um erro.
 */

const RE_RANGE = /\.range\(/g;

/** Arquivos versionados de código (testes ficam de fora). */
function fontes(): string[] {
  return execSync('git ls-files "*.ts" "*.tsx"', { encoding: 'utf-8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('tests/'));
}

/**
 * `.range()` cuja CADEIA (do `.from(` até ele) não tem `.order()`.
 * Olha para trás até o `.from(` para não confundir com a query vizinha.
 */
function rangesSemOrdem(fonte: string, arquivo: string): string[] {
  const achados: string[] = [];
  for (const m of fonte.matchAll(RE_RANGE)) {
    const ini = fonte.lastIndexOf('.from(', m.index!);
    const cadeia = ini >= 0 && m.index! - ini < 900 ? fonte.slice(ini, m.index!) : fonte.slice(Math.max(0, m.index! - 400), m.index!);
    if (!cadeia.includes('.order(')) {
      achados.push(`${arquivo}:${fonte.slice(0, m.index!).split('\n').length}`);
    }
  }
  return achados;
}

/**
 * Dívida declarada — só encolhe. Cada entrada precisa do motivo pelo qual a
 * ordem não decide nada ali.
 */
const ALLOWLIST: Record<string, string> = {
  'app/admin/vertho/potencial-cidades/actions.ts:17':
    'agregação por município: soma tudo, e soma não depende de ordem',
  'app/admin/vertho/potencial-cidades/actions.ts:60':
    'idem — contagem por município, sem corte por posição',
  'lib/radar/queries.ts:33':
    'varredura para montar mapa por chave; nenhum percentil nem top-N sai daqui',
};

describe('paginação com `.range()` tem ordem definida', () => {
  it('há `.range()` no repo (senão o guard não prova nada)', () => {
    const total = fontes().reduce((n, f) => n + [...readFileSync(f, 'utf-8').matchAll(RE_RANGE)].length, 0);
    expect(total, 'nenhum `.range()` encontrado — a varredura quebrou').toBeGreaterThan(10);
  });

  it('🔴 todo `.range()` tem `.order()` na mesma cadeia (ou está na allowlist)', () => {
    const novos: string[] = [];
    for (const f of fontes()) {
      for (const achado of rangesSemOrdem(readFileSync(f, 'utf-8'), f)) {
        if (!ALLOWLIST[achado]) novos.push(achado);
      }
    }

    expect(
      novos,
      'paginação sem ORDER BY: LIMIT/OFFSET pode repetir uma linha em duas páginas e pular outra. '
      + 'Some `.order(\'id\')` (custo zero, torna a varredura reproduzível) — ou declare na ALLOWLIST '
      + 'dizendo por que a ordem não decide nada ali.',
    ).toEqual([]);
  });

  it('a allowlist não guarda entrada já corrigida (dívida só encolhe)', () => {
    const vivos = new Set<string>();
    for (const f of fontes()) for (const a of rangesSemOrdem(readFileSync(f, 'utf-8'), f)) vivos.add(a);

    const obsoletas = Object.keys(ALLOWLIST).filter((k) => !vivos.has(k));
    expect(
      obsoletas,
      'entrada da allowlist que não corresponde mais a nenhum `.range()` sem ordem — tire da lista '
      + '(deixá-la aberta faz a lista crescer sozinha na próxima renumeração de linha)',
    ).toEqual([]);
  });

  /**
   * O outro lado do B7: o `priority_rank` tinha DUAS implementações idênticas —
   * a action `rodarScores` e `scripts/radarempresas-score.ts`, este último
   * marcado "mantido em sincronia, alterar os dois juntos". O bug vivia nos dois.
   *
   * 🔑 E o que roda é o SCRIPT: `rodarScores` não é chamado por tela nenhuma, e
   * as 10 execuções gravadas em `radarempresas_jobs` (todas de 15/05/2026) saíram
   * dele. Corrigir só a action seria consertar o caminho que ninguém percorre.
   */
  it('🔴 o cálculo de priority_rank não voltou a ser duplicado', () => {
    const consumidores = ['actions/radarempresas/scoring.ts', 'scripts/radarempresas-score.ts'];

    for (const arq of consumidores) {
      const fonte = readFileSync(arq, 'utf-8');
      expect(
        fonte.includes('calcularPriorityRank'),
        `${arq} não usa a fonte única lib/radarempresas/priority-rank.ts`,
      ).toBe(true);
      expect(
        /idx\s*\/\s*\(ne\s*-\s*1\)/.test(fonte),
        `${arq} voltou a calcular o percentil por ÍNDICE — é o B7 de volta, e empates resolvem pela ordem de varredura`,
      ).toBe(false);
    }
  });
});
