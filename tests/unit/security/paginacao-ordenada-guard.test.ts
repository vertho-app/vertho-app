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
 * `.range()` cuja cadeia não tem `.order()`.
 *
 * Duas formas, porque o código usa as duas:
 *
 *  1. **cadeia literal** — `sb.from(x).select(y).order(z).range(...)`: basta
 *     olhar do `.from(` até o `.range(`;
 *  2. **cadeia montada em variável** — `let q = sb.from(x)…`, dezenas de linhas
 *     de filtro no meio, e `q.range(...)` lá embaixo. Aqui a proximidade textual
 *     não diz nada: é preciso seguir a VARIÁVEL.
 *
 * 🔑 A forma (2) não estava aqui, e o guard acusou o primeiro código correto que
 * encontrou — o `listarModulos` paginado, escrito na mesma rodada (24/08). Guard
 * que dá falso positivo não fica só chato: ele empurra código certo para a
 * allowlist, e a allowlist é justamente o que deveria medir a dívida real.
 */
/**
 * Apaga comentários preservando as QUEBRAS DE LINHA (troca por espaço), para que
 * os números de linha continuem valendo.
 *
 * Necessário porque um guard sobre um padrão de código encontra o padrão nos
 * comentários que EXPLICAM o padrão — inclusive nos deste próprio commit, que
 * escrevem `.range()` sem `.order()` ao descrever o bug.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (bloco) =>
    bloco.replace(/[^\n]/g, ' '));
}

function rangesSemOrdem(fonteBruta: string, arquivo: string): string[] {
  const fonte = semComentarios(fonteBruta);
  const achados: string[] = [];
  for (const m of fonte.matchAll(RE_RANGE)) {
    const linha = fonte.slice(0, m.index!).split('\n').length;

    // (1) cadeia literal, a partir do `.from(` mais próximo.
    const ini = fonte.lastIndexOf('.from(', m.index!);
    const cadeia = ini >= 0 && m.index! - ini < 900
      ? fonte.slice(ini, m.index!)
      : fonte.slice(Math.max(0, m.index! - 400), m.index!);
    if (cadeia.includes('.order(')) continue;

    // (2) receptor é variável? A ordem pode ter sido aplicada em qualquer
    // atribuição a ela — inclusive antes de todos os filtros.
    const nome = fonte.slice(Math.max(0, m.index! - 120), m.index!).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
    if (nome && new RegExp(`\\b${nome}\\s*=[\\s\\S]{0,400}?\\.order\\(`).test(fonte)) continue;

    achados.push(`${arquivo}:${linha}`);
  }
  return achados;
}

/**
 * Dívida declarada — só encolhe. Cada entrada precisa do motivo pelo qual a
 * ordem não decide nada ali.
 *
 * 🔑 Ela nasceu com TRÊS entradas e ficou com uma. Duas eram menções a
 * `.range()` dentro de COMENTÁRIO — dívida que não existia, declarada porque o
 * detector ainda não descartava comentários. Allowlist que registra fantasma é
 * pior que allowlist grande: ela faz o número parecer medido.
 */
const ALLOWLIST: Record<string, string> = {
  'lib/radar/queries.ts:33':
    'helper genérico `fetchAllRows(buildQuery)`: quem monta a query é o chamador, '
    + 'e é lá que a ordem tem que estar — conferido pelo teste dos CHAMADORES abaixo',
};

/**
 * Helpers de paginação que recebem a query montada por callback. O `.range()`
 * deles é genérico e legítimo; a ordem é responsabilidade de quem chama.
 */
const HELPERS_DE_PAGINACAO = [
  { arquivo: 'lib/radar/queries.ts', fn: 'fetchAllRows' },
  { arquivo: 'app/admin/vertho/potencial-cidades/actions.ts', fn: 'fetchAll' },
];

/** Argumentos de cada chamada a `fn(` — balanceando parênteses. */
function chamadasDe(fonte: string, fn: string): Array<{ linha: number; corpo: string }> {
  const out: Array<{ linha: number; corpo: string }> = [];
  const re = new RegExp(`\\b${fn}\\s*(?:<[^(]*?>)?\\s*\\(`, 'g');
  for (const m of fonte.matchAll(re)) {
    let prof = 1;
    let i = m.index! + m[0].length;
    while (i < fonte.length && prof > 0) {
      if (fonte[i] === '(') prof++;
      else if (fonte[i] === ')') prof--;
      i++;
    }
    out.push({ linha: fonte.slice(0, m.index!).split('\n').length, corpo: fonte.slice(m.index! + m[0].length, i) });
  }
  return out;
}

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
   * 🔴 A dívida que se escondia ATRÁS do helper.
   *
   * `lib/radar/queries.ts:33` entrou na allowlist como UM site. Mas ali o
   * `.range()` é genérico (`buildQuery().range(...)`), e quem monta a query — com
   * ou sem ordem — é o chamador. Ao abrir: **5 dos 7 chamadores de `fetchAllRows`
   * paginavam `diag_escolas` e `diag_mv_docentes_agg` sem `.order()`** (medido em
   * 24/08). A allowlist media 1; o real era 5.
   *
   * É a mesma lição do denominador: uma linha declarada como dívida pode
   * esconder N sites, e um guard que conta a linha diz que está tudo medido.
   */
  it('🔴 quem chama um helper de paginação monta a query com `.order()`', () => {
    const semOrdem: string[] = [];

    for (const { arquivo, fn } of HELPERS_DE_PAGINACAO) {
      const fonte = semComentarios(readFileSync(arquivo, 'utf-8'));
      const chamadas = chamadasDe(fonte, fn);
      // A própria definição do helper aparece aqui — ela não monta query.
      const reais = chamadas.filter((c) => c.corpo.includes('.from('));

      expect(reais.length, `nenhuma chamada a ${fn}() encontrada em ${arquivo} — a varredura quebrou`)
        .toBeGreaterThan(0);

      for (const c of reais) {
        if (!c.corpo.includes('.order(')) semOrdem.push(`${arquivo}:${c.linha}`);
      }
    }

    expect(
      semOrdem,
      'query paginada por helper e montada SEM ordem: o `.range()` do helper está na allowlist '
      + 'justamente porque a ordem é sua responsabilidade aqui',
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
