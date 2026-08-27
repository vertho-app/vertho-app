/**
 * A IA4 síncrona DELEGA ao lote acima do limiar — e o ledger passa a saber
 * quanto tempo cada contexto tinha.
 *
 * Por que existe (26/08/2026): `rodarIA4` avalia em laço sequencial dentro de
 * uma Server Action, e cada volta é uma chamada com p95 de 156 s (medido, 388
 * chamadas em `ia_usage_log`). Duas voltas já passam dos 300 s. Não é hipótese:
 * em 11/08 a action estourou no meio de um lote e deixou **58 de 72** respostas
 * com avaliação gravada e SEM check — estado que nenhuma tela alcançava depois.
 *
 * O caminho com orçamento (`gerar-ia4-batch`, 3600 s + Batch API) já existia. O
 * que faltava era esta porta parar de convidar para a que trava.
 *
 * A segunda metade do arquivo cobre o motivo de a premissa errada ter durado
 * tanto: o ledger registrava `latency_ms` sem registrar o ORÇAMENTO, então
 * "perto do timeout?" não tinha denominador e virava opinião.
 */
import { describe, expect, it } from 'vitest';
import { IA4_MAX_SINCRONO } from '@/lib/ia4-avaliacao';
import { comContexto, contextoAtual, fracaoDoOrcamento } from '@/lib/execucao-contexto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fase3 = readFileSync(join(process.cwd(), 'actions/fase3.ts'), 'utf-8');

describe('limiar do síncrono', () => {
  it('é pequeno o bastante para caber no orçamento medido', () => {
    // p95 de 156 s por chamada; abaixo de 300 s só cabe UMA volta com margem.
    const P95_POR_CHAMADA_S = 156;
    const ORCAMENTO_ACTION_S = 300;
    expect(IA4_MAX_SINCRONO * P95_POR_CHAMADA_S).toBeLessThan(ORCAMENTO_ACTION_S);
    // E o limiar seguinte NÃO caberia — é isto que o número está protegendo.
    expect((IA4_MAX_SINCRONO + 1) * P95_POR_CHAMADA_S).toBeGreaterThan(ORCAMENTO_ACTION_S);
  });

  it('a action compara o TAMANHO DA FILA com o limiar antes de entrar no laço', () => {
    expect(fase3).toMatch(/if \(respostas\.length > IA4_MAX_SINCRONO\)/);
    // A comparação tem de vir ANTES do `for` — senão delega depois de já ter
    // gasto o tempo que a delegação existe para não gastar.
    const iCond = fase3.indexOf('respostas.length > IA4_MAX_SINCRONO');
    const iLoop = fase3.indexOf('for (const resp of respostas)');
    expect(iCond).toBeGreaterThan(-1);
    expect(iLoop).toBeGreaterThan(-1);
    expect(iCond, 'a delegação está DEPOIS do laço — não protege nada').toBeLessThan(iLoop);
  });

  it('quando o enfileiramento falha, NÃO cai no laço síncrono', () => {
    // Cair no síncrono seria escolher o caminho que sabemos que trunca,
    // justamente no volume em que ele trunca.
    const bloco = fase3.slice(
      fase3.indexOf('respostas.length > IA4_MAX_SINCRONO'),
      fase3.indexOf('for (const resp of respostas)'),
    );
    expect(bloco).toMatch(/if \(!r\.success\)/);
    expect(bloco).toMatch(/return \{\s*\n?\s*success: false/);
    expect(bloco, 'há um caminho que segue para o laço após falhar')
      .not.toMatch(/\/\/ *fallback|cair no s[ií]ncrono/i);
  });

  it('delega para o caminho que TEM orçamento, não para outro laço', () => {
    expect(fase3).toMatch(/enqueueIA4Batch/);
  });
});

describe('contexto de execução no ledger', () => {
  it('sem declaração, é `desconhecido` — nunca um palpite', () => {
    expect(contextoAtual().runtime).toBe('desconhecido');
    expect(contextoAtual().orcamentoMs).toBeUndefined();
  });

  it('a declaração atravessa a pilha assíncrona', async () => {
    const visto = await comContexto(
      { runtime: 'trigger', orcamentoMs: 3600_000, onde: 'teste' },
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        // Duas camadas abaixo, como `callAI` está de `run`.
        return await (async () => contextoAtual())();
      },
    );
    expect(visto.runtime).toBe('trigger');
    expect(visto.orcamentoMs).toBe(3600_000);
  });

  it('não vaza para fora do escopo', async () => {
    await comContexto({ runtime: 'rota', orcamentoMs: 300_000 }, async () => {});
    expect(contextoAtual().runtime).toBe('desconhecido');
  });

  it('a fração é null quando o orçamento é desconhecido — e null ≠ 0', () => {
    // O ponto: "sem orçamento declarado" não pode ser lido como "sobra tempo".
    expect(fracaoDoOrcamento(250_000, { runtime: 'desconhecido' })).toBeNull();
    expect(fracaoDoOrcamento(250_000, { runtime: 'rota', orcamentoMs: 300_000 })).toBeCloseTo(0.833, 2);
    expect(fracaoDoOrcamento(120_000, { runtime: 'trigger', orcamentoMs: 3600_000 })).toBeCloseTo(0.033, 2);
  });

  it('o caso que motivou tudo: 227s parecem 76% numa rota de 300s e 6% no Trigger', () => {
    // Foi exatamente esta confusão que segurou o teto de `modulo_base_autor`.
    const latencia = 227_000;
    expect(fracaoDoOrcamento(latencia, { runtime: 'rota', orcamentoMs: 300_000 })!).toBeCloseTo(0.757, 2);
    expect(fracaoDoOrcamento(latencia, { runtime: 'trigger', orcamentoMs: 3600_000 })!).toBeCloseTo(0.063, 2);
  });
});

describe('as tasks de lote DECLARAM o próprio orçamento', () => {
  const TASKS = ['trigger/gerar-ia4-batch.ts', 'trigger/gerar-modulos-manuscrito.ts'];

  it.each(TASKS)('%s envolve o run em comContexto com o maxDuration declarado', (arq) => {
    const src = readFileSync(join(process.cwd(), arq), 'utf-8');
    const maxDur = Number(src.match(/maxDuration:\s*(\d+)/)?.[1]);
    expect(maxDur, `${arq} sem maxDuration`).toBeGreaterThan(0);
    expect(src, `${arq} não declara contexto — as chamadas dele entram como 'desconhecido'`)
      .toMatch(/comContexto\(\{\s*runtime: 'trigger'/);
    // O orçamento declarado tem de bater com o maxDuration REAL da task, senão
    // o denominador do ledger mente — que é pior que não ter denominador.
    const declarado = Number(src.match(/orcamentoMs:\s*(\d+)\s*\*\s*1000/)?.[1]);
    expect(declarado, `${arq}: orçamento declarado (${declarado}) ≠ maxDuration (${maxDur})`).toBe(maxDur);
  });
});
