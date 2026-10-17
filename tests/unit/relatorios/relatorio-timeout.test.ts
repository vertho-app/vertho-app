import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TIMEOUT_RELATORIO_MS } from '@/lib/relatorios/gestor-rh-core';

/**
 * O fluxo completo da Amazon Bowling (16/10/2026) falhou na etapa RH com "Request was aborted": a chamada do relatório
 * (64 mil tokens de saída, longo por desenho) caía no padrão de 120 s do cliente de IA. O PDI já tinha passado por isso
 * e usa 300 s; os relatórios do Gestor e do RH passam a usar o mesmo teto.
 */
describe('teto de tempo dos relatórios do Gestor e do RH', () => {
  it('é o mesmo do PDI (300 s), acima do padrão de 120 s', () => {
    expect(TIMEOUT_RELATORIO_MS).toBe(300000);
  });
  it('as DUAS chamadas de IA dos relatórios passam o teto', () => {
    const f = readFileSync('lib/relatorios/gestor-rh-core.ts', 'utf8');
    expect(f).toMatch(/callAI\(RELATORIO_GESTOR_SYSTEM[\s\S]{0,200}timeoutMs: TIMEOUT_RELATORIO_MS/);
    expect(f).toMatch(/callAI\(RELATORIO_RH_SYSTEM[\s\S]{0,200}timeoutMs: TIMEOUT_RELATORIO_MS/);
  });
});
