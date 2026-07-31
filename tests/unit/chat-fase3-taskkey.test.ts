import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANTE: as chamadas de IA do chat da Fase 3 são ETIQUETADAS no ledger.
 *
 * Sem `taskKey`, `ia_usage_log` registra a chamada como `untagged` — e o
 * `untagged` sozinho concentrava **3306 chamadas e $97,88, 78% de todo o custo**
 * medido em 31/07. Ou seja: a etiqueta ausente não perde só um detalhe de
 * relatório, ela torna o fluxo inteiro invisível na conta.
 *
 * Isto virou teste porque a ausência é SILENCIOSA nos dois sentidos: nada falha
 * quando se esquece o `taskKey`, e o custo continua sendo cobrado — só que
 * anônimo. O caso concreto: uma proposta de redesenho para "baratear" este fluxo
 * foi discutida sem que ninguém pudesse dizer quanto ele custava.
 *
 * O chat da Fase 3 faz três chamadas: a conversa (até 10 por sessão), o EVAL e o
 * AUDIT (1 cada). As três precisam aparecer separadas para a conta fechar.
 */

const ROTAS = [
  path.join(process.cwd(), 'app', 'api', 'chat', 'route.ts'),
  path.join(process.cwd(), 'app', 'api', 'chat-simulador', 'route.ts'),
];

describe('chat fase 3 · chamadas de IA etiquetadas no ledger', () => {
  const src = ROTAS.map((r) => readFileSync(r, 'utf8')).join('\n');

  it('as taskKeys do bloco estão presentes', () => {
    for (const key of ['conversa_fase3', 'chat_fase3_eval', 'chat_fase3_audit', 'chat_simulador']) {
      expect(src, `taskKey '${key}' sumiu das rotas de chat`).toContain(`'${key}'`);
    }
  });

  it('nenhuma chamada callAI/callAIChat das rotas fica sem taskKey', () => {
    // Cada invocação até o fecha-parênteses da chamada seguinte: basta que o
    // trecho após o nome contenha `taskKey` antes da próxima invocação.
    const invocacoes = [...src.matchAll(/\bcallAI(?:Chat)?\s*\(/g)].map((m) => m.index!);
    expect(invocacoes.length).toBeGreaterThan(0);

    const semEtiqueta: number[] = [];
    invocacoes.forEach((inicio, i) => {
      const fim = invocacoes[i + 1] ?? src.length;
      if (!src.slice(inicio, fim).includes('taskKey')) {
        semEtiqueta.push(src.slice(0, inicio).split('\n').length); // nº da linha
      }
    });

    expect(semEtiqueta, `chamada(s) sem taskKey na(s) linha(s) ${semEtiqueta.join(', ')}`).toEqual([]);
  });
});
