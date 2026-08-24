import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * ── C3, passo final (24/08): ligar `retry` tem CONTRATO ────────────────────
 *
 * Quatro das cinco tasks de lote ganharam `retry` depois de receberem os cinco
 * pré-requisitos de idempotência. Este guard existe para que a próxima pessoa
 * (ou eu, daqui a um mês) não ligue a retentativa sem o resto — e, sobretudo,
 * para que ninguém a ligue de uma vez para TODAS.
 *
 * As três regras, cada uma medida no código do SDK antes de virar asserção:
 *
 *  1. **`retries.default` no `trigger.config.ts` é proibido.** O executor faz
 *     `const retry = this.task.retry ?? retriesConfig?.default`
 *     (`@trigger.dev/core` workers/taskExecutor.js:676): um default no config
 *     alcança TODA task sem `retry` próprio. Hoje são 8 — inclusive
 *     `render-video`, `render-chunk` e `gerar-video-modulo`, que nunca passaram
 *     por auditoria de idempotência e onde repetir custa render e HeyGen.
 *
 *  2. **Task com `retry` grava a falha por `registrarFalhaDaTentativa`.** Um
 *     `status: 'error'` cru no `catch` roda em tentativas que não são a última,
 *     e aí (a) `jaTemLoteAtivo` deixa de barrar lote novo da mesma fase — ele só
 *     olha `queued`/`running` — e (b) as telas param o polling e anunciam
 *     "Lote falhou" para um lote que ainda vai terminar bem.
 *
 *  3. **Task com `retry` recebe o `ctx`.** Sem o 2º parâmetro no `run`, a régua
 *     de (2) não tem como saber em que tentativa está e trata toda falha como
 *     final — o guard passaria verde protegendo nada.
 *
 * ⚠️ Varre o DIRETÓRIO, não `git ls-files`: task nova ainda não commitada tem
 * que ser conferida também, senão o guard só vê o que já passou.
 */

const DIR_TRIGGER = join(process.cwd(), 'trigger');

function tasksDoRepo(): Array<{ arquivo: string; fonte: string }> {
  return readdirSync(DIR_TRIGGER)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ arquivo: f, fonte: readFileSync(join(DIR_TRIGGER, f), 'utf-8') }))
    .filter((t) => /\btask\(\{/.test(t.fonte));
}

/** Declara `retry:` como opção da própria task (não a palavra num comentário). */
function declaraRetry(fonte: string): boolean {
  return /^\s{2}retry:\s*\{/m.test(fonte);
}

describe('trigger: `retry` só com o contrato que o torna seguro', () => {
  it('há tasks para conferir (senão este guard não prova nada)', () => {
    const tasks = tasksDoRepo();
    expect(tasks.length, 'nenhuma task encontrada — a varredura quebrou').toBeGreaterThanOrEqual(10);
    expect(
      tasks.filter((t) => declaraRetry(t.fonte)).length,
      'nenhuma task declara retry — as regras abaixo passariam por vacuidade',
    ).toBeGreaterThanOrEqual(5);
  });

  /**
   * A regra que protege as tasks que NÃO foram auditadas. Ligar o default é uma
   * linha; descobrir que `render-video` rodou três vezes é uma fatura.
   */
  it('🔴 `trigger.config.ts` NÃO define `retries.default`', () => {
    const config = readFileSync(join(process.cwd(), 'trigger.config.ts'), 'utf-8');
    const semComentarios = config.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(
      /\bretries\s*:/.test(semComentarios),
      'o config passou a definir `retries` — isso alcança TODA task sem retry próprio '
      + '(this.task.retry ?? retriesConfig?.default), incluindo as de render/HeyGen. '
      + 'Conceda por task, depois de dar a ela os pré-requisitos de idempotência.',
    ).toBe(false);
  });

  it('🔴 toda task com `retry` grava a falha por `registrarFalhaDaTentativa`', () => {
    const faltando = tasksDoRepo()
      .filter((t) => declaraRetry(t.fonte))
      // A CHAMADA, nao a palavra: medido por mutacao (24/08) que trocar o uso
      // pelo `patch` cru deixava o import para tras e este teste passava verde.
      .filter((t) => !/registrarFalhaDaTentativa\s*\(/.test(t.fonte))
      // As três tasks anteriores ao C3 (acumulada-piloto, estruturar-material,
      // extrair-video) não escrevem em `ia_jobs` — a régua é sobre esse status.
      .filter((t) => t.fonte.includes("from('ia_jobs')") || t.fonte.includes('criarPatchJob'))
      .map((t) => t.arquivo);

    expect(
      faltando,
      'task com retry gravando o status da falha à mão: em tentativa que não é a última, '
      + '`status: error` solta o guard anti-duplicata e a tela anuncia falha de um lote que vai terminar bem',
    ).toEqual([]);
  });

  it('🔴 nenhuma task de `ia_jobs` grava `status: \'error\'` cru no catch', () => {
    const cruas = tasksDoRepo()
      .filter((t) => t.fonte.includes('criarPatchJob'))
      .filter((t) => /patch\(\{\s*status:\s*'error'/.test(t.fonte))
      .map((t) => t.arquivo);

    expect(
      cruas,
      'o `patch({ status: \'error\' })` voltou — use registrarFalhaDaTentativa, que só grava `error` na última tentativa',
    ).toEqual([]);
  });

  it('🔴 toda task com `retry` recebe o `ctx` no `run`', () => {
    const semCtx = tasksDoRepo()
      .filter((t) => declaraRetry(t.fonte))
      .filter((t) => t.fonte.includes('registrarFalhaDaTentativa'))
      .filter((t) => !/run:\s*async\s*\([^)]*\{[^)]*\bctx\b/.test(t.fonte))
      .map((t) => t.arquivo);

    expect(
      semCtx,
      'a task não recebe `ctx`: sem ele a régua da última tentativa não tem em que se basear e o guard acima protege nada',
    ).toEqual([]);
  });

  /**
   * O backoff default do SDK é `minTimeoutInMs: 1000` com `factor: 2` — as três
   * tentativas cabem em ~3 s. Para lote de IA a falha típica é FORNECEDOR fora
   * do ar, e três tentativas dentro do mesmo minuto são uma só.
   */
  it('as tasks de lote esperam de verdade entre tentativas (≥ 30 s)', () => {
    const curtas = tasksDoRepo()
      .filter((t) => declaraRetry(t.fonte) && t.fonte.includes('criarPatchJob'))
      .filter((t) => {
        const m = t.fonte.match(/minTimeoutInMs:\s*([0-9_]+)/);
        return !m || Number(m[1].replace(/_/g, '')) < 30_000;
      })
      .map((t) => t.arquivo);

    expect(
      curtas,
      'backoff curto num lote de IA: as 3 tentativas caberiam na mesma indisponibilidade do fornecedor',
    ).toEqual([]);
  });
});
