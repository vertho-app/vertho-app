import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  IA3_MAX_TOKENS_GERACAO, IA3_TIMEOUT_GERACAO_MS, IA3_LIMIAR_FALLBACK_LOTE, fallbackDoLoteExcessivo,
} from '@/lib/ia3-cenarios';

/**
 * 30/09/2026 (Amazon Bowling): o lote de geração do IA3 tinha `maxTokens: 6144` fixo,
 * o cenário do `claude-sonnet-5` sai com ~7.900 tokens (máx. 10.000) e 58 de 66
 * respostas pararam no teto. O caminho síncrono usava 10000, em OUTRO arquivo — os
 * dois números divergiram quando o modelo mudou. Estes testes travam a fonte única.
 */
const lerFonte = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf8');

describe('teto de saída da geração do IA3 — fonte única', () => {
  it('o teto comporta a cauda medida (3 de 32 síncronas truncaram EXATAMENTE em 10.000)', () => {
    expect(IA3_MAX_TOKENS_GERACAO).toBeGreaterThan(10000);
  });

  it('o relógio do síncrono comporta encher o teto (~100 tokens/s medido) com folga', () => {
    const segundosParaEncher = IA3_MAX_TOKENS_GERACAO / 100;
    // Sem a folga, o teto maior só troca truncamento por timeout do callAI (default 120 s).
    expect(IA3_TIMEOUT_GERACAO_MS / 1000).toBeGreaterThan(segundosParaEncher * 1.25);
    expect(IA3_TIMEOUT_GERACAO_MS).toBeGreaterThan(120_000);
  });

  it('o lote (trigger) usa a constante, sem literal próprio', () => {
    const fonte = lerFonte('trigger/gerar-ia3-batch.ts');
    expect(fonte).toMatch(/maxTokens:\s*IA3_MAX_TOKENS_GERACAO/);
    // Nenhum `maxTokens` numérico na geração: o 4096 que sobra é o do CHECK, que é outra onda.
    const literais = [...fonte.matchAll(/maxTokens:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(literais).toEqual([4096]);
  });

  it('o caminho síncrono da geração usa a MESMA constante (nenhum 10000 solto)', () => {
    const fonte = lerFonte('lib/ia3-cenarios.ts');
    const usos = fonte.match(/aiConfig,\s*IA3_MAX_TOKENS_GERACAO,\s*\{\s*taskKey:\s*'ia3_cenarios'/g) || [];
    expect(usos.length).toBe(3); // geração, retry da geração, regeneração com trava
    // E as três passam o relógio: teto maior sem timeout maior é o timeout do callAI (120 s).
    const comRelogio = fonte.match(/IA3_MAX_TOKENS_GERACAO,\s*\{\s*taskKey:\s*'ia3_cenarios',\s*timeoutMs:\s*IA3_TIMEOUT_GERACAO_MS/g) || [];
    expect(comRelogio.length).toBe(3);
    expect(fonte).not.toMatch(/aiConfig,\s*10000,/);
  });
});

describe('fallbackDoLoteExcessivo — fallback síncrono deixa de ser exceção', () => {
  it('o caso medido (58 de 66 cortados) dispara', () => {
    expect(fallbackDoLoteExcessivo(66, 58)).toBe(true);
  });

  it('respeita a fronteira: exatamente no limiar NÃO dispara, um acima dispara', () => {
    const total = 50;
    const noLimiar = Math.round(total * IA3_LIMIAR_FALLBACK_LOTE); // 10
    expect(fallbackDoLoteExcessivo(total, noLimiar)).toBe(false);
    expect(fallbackDoLoteExcessivo(total, noLimiar + 1)).toBe(true);
  });

  it('lote saudável (poucos caídos) e lote vazio não disparam', () => {
    expect(fallbackDoLoteExcessivo(66, 3)).toBe(false);
    expect(fallbackDoLoteExcessivo(66, 0)).toBe(false);
    expect(fallbackDoLoteExcessivo(0, 0)).toBe(false);
  });
});

describe('a task registra o alarme quando o fallback passa do limiar', () => {
  it('chama registrarDegradacao com o tipo canônico, chaveado pelo job', () => {
    const fonte = lerFonte('trigger/gerar-ia3-batch.ts');
    expect(fonte).toMatch(/fallbackDoLoteExcessivo\(foramAoLote\.size,\s*caidosNoFallback\)/);
    expect(fonte).toMatch(/tipo:\s*DEGRADACAO\.LOTE_IA_FALLBACK_EXCESSIVO,\s*chave:\s*payload\.jobId/);
    // Os DOIS caminhos de fallback contam (resposta inválida E resposta ausente).
    expect((fonte.match(/caidosNoFallback\+\+/g) || []).length).toBe(2);
  });
});
