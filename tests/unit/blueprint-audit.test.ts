import { describe, it, expect } from 'vitest';
import { montarRelatorioAuditoria, type BlueprintAuditCheck } from '@/lib/blueprint/audit';

const IDS_SEMANTICOS = ['cobre-o-que-promete', 'missao-evidencia', 'exigencia-nivel', 'avaliacao-mede', 'generico', 'tom-saude'];

const estrutural = (status: BlueprintAuditCheck['status'] = 'pass'): BlueprintAuditCheck[] =>
  ['pdi-coberto', 'pdi-existente', 'semana-vinculada', 'dentro-do-foco', 'calendario', 'carga-nivel']
    .map((id) => ({ id, categoria: 'estrutura', titulo: id, status, detalhe: '' }));

const semantico = (ids: string[], status: BlueprintAuditCheck['status'] = 'pass') => ({
  checks: ids.map((id) => ({ id, categoria: 'semantica' as const, titulo: id, status, detalhe: '' })),
  resumo: 'ok',
});

describe('montarRelatorioAuditoria — FMEA F-P1 (denominador fixo)', () => {
  it('auditoria completa (6 estruturais + 6 semânticos) mantém o score', () => {
    const r = montarRelatorioAuditoria(estrutural(), semantico(IDS_SEMANTICOS), '2026-07-27T00:00:00Z');
    expect(r.checks).toHaveLength(12);
    expect(r.score).toBe(100);
    expect(r.parcial).toBe(false);
  });

  it('auditoria completa com warn/fail mantém a régua antiga (warn = meio-ponto)', () => {
    const est = estrutural();
    est[0] = { ...est[0], status: 'warn' };
    est[1] = { ...est[1], status: 'fail' };
    const r = montarRelatorioAuditoria(est, semantico(IDS_SEMANTICOS), '2026-07-27T00:00:00Z');
    // 10 pass + 0.5 warn sobre 12 → 87.5 → 88 (mesmo valor do denominador variável)
    expect(r.score).toBe(88);
    expect(r.parcial).toBe(false);
    expect(r.drift).toBe(true);
  });

  it('2ª IA caída (extractJSON null): semânticos ausentes NÃO saem do denominador', () => {
    const r = montarRelatorioAuditoria(estrutural(), { checks: [], resumo: '' }, '2026-07-27T00:00:00Z');
    // Antes: 6/6 = 100 (INFLADO). Agora: 6/12 = 50 — a mesma auditoria completa daria 100.
    expect(r.score).toBe(50);
    expect(r.parcial).toBe(true);
  });

  it('semânticos parciais (3 de 6): os 3 faltantes continuam no denominador', () => {
    const r = montarRelatorioAuditoria(estrutural(), semantico(IDS_SEMANTICOS.slice(0, 3)), '2026-07-27T00:00:00Z');
    // 9 pass sobre denominador fixo 12 → 75
    expect(r.score).toBe(75);
    expect(r.parcial).toBe(true);
  });

  it('auditoria parcial nunca pontua mais que a mesma auditoria completa', () => {
    const completa = montarRelatorioAuditoria(estrutural(), semantico(IDS_SEMANTICOS), '2026-07-27T00:00:00Z');
    const semIA = montarRelatorioAuditoria(estrutural(), { checks: [], resumo: '' }, '2026-07-27T00:00:00Z');
    const pelaMetade = montarRelatorioAuditoria(estrutural(), semantico(IDS_SEMANTICOS.slice(0, 3)), '2026-07-27T00:00:00Z');
    expect(semIA.score).toBeLessThan(completa.score);
    expect(pelaMetade.score).toBeLessThan(completa.score);
  });

  it('parcial=false quando todos os ids semânticos estão presentes, mesmo com fails', () => {
    const r = montarRelatorioAuditoria(estrutural(), semantico(IDS_SEMANTICOS, 'fail'), '2026-07-27T00:00:00Z');
    expect(r.parcial).toBe(false);
    expect(r.drift).toBe(true);
    expect(r.score).toBe(50); // 6 pass estruturais / 12
  });
});
