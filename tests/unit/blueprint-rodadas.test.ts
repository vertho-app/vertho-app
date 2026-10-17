import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { combinarRodadasBlueprint, montarRelatorioAuditoria, type BlueprintAuditCheck } from '@/lib/blueprint/audit';

/**
 * Blueprint com a RÉGUA DO PDI (decisão do dono, 16/10/2026): duas rodadas do auditor, reprovação só quando as duas
 * reprovam. O auditor de uma rodada trocava de veredito no mesmo blueprint (Amazon: 5 de 14 entre 3 auditorias).
 */
const ck = (id: string, status: 'pass' | 'warn' | 'fail', detalhe = id): BlueprintAuditCheck => ({ id, categoria: 'semantica', titulo: id, status, detalhe });
const rodada = (...checks: BlueprintAuditCheck[]) => ({ checks, resumo: checks.some((c) => c.status === 'fail') ? 'reprovou' : 'ok' });
const SEIS = ['cobre-o-que-promete', 'missao-evidencia', 'exigencia-nivel', 'avaliacao-mede', 'generico', 'tom-saude'];
const limpa = () => rodada(...SEIS.map((id) => ck(id, 'pass')));

describe('combinarRodadasBlueprint', () => {
  it('reprovação nas DUAS rodadas fica reprovação (mesmo em checks diferentes, como no PDI)', () => {
    const r = combinarRodadasBlueprint([
      rodada(ck('avaliacao-mede', 'fail'), ck('generico', 'pass')),
      rodada(ck('avaliacao-mede', 'pass'), ck('cobre-o-que-promete', 'fail')),
    ]);
    expect(r.checks.filter((c) => c.status === 'fail').map((c) => c.id).sort()).toEqual(['avaliacao-mede', 'cobre-o-que-promete']);
    expect(r.resumo).toBe('reprovou');
  });

  it('reprovação de UMA rodada com a outra limpa vira alerta, com o motivo escrito', () => {
    const r = combinarRodadasBlueprint([rodada(...SEIS.map((id) => ck(id, id === 'avaliacao-mede' ? 'fail' : 'pass'))), limpa()]);
    const am = r.checks.find((c) => c.id === 'avaliacao-mede')!;
    expect(am.status).toBe('warn');
    expect(am.detalhe).toMatch(/Reprovado em 1 de 2 rodadas/);
    expect(montarRelatorioAuditoria([], r, 'agora').ok).toBe(true);
  });

  it('alerta de uma rodada só, com a outra limpa, não vale', () => {
    const r = combinarRodadasBlueprint([rodada(...SEIS.map((id) => ck(id, id === 'generico' ? 'warn' : 'pass'))), limpa()]);
    expect(r.checks.find((c) => c.id === 'generico')!.status).toBe('pass');
  });

  it('rodada que não rodou não vota: vale a outra, com o aviso; nenhuma válida, sai vazio (o relatório fica parcial)', () => {
    const uma = combinarRodadasBlueprint([null, rodada(ck('avaliacao-mede', 'fail'))]);
    expect(uma.checks.find((c) => c.id === 'avaliacao-mede')!.status).toBe('fail');
    expect(uma.checks.some((c) => c.id === 'semantica-rodada-unica' && c.status === 'warn')).toBe(true);
    expect(combinarRodadasBlueprint([null, { checks: [], resumo: '' }])).toEqual({ checks: [], resumo: '' });
    expect(montarRelatorioAuditoria([], combinarRodadasBlueprint([null, null]), 'agora').parcial).toBe(true);
  });
});

// ─── auditarSemanticoEmRodadas chama o auditor 2 vezes e combina ─────────────────────────────────────────────────
const h = vi.hoisted(() => ({ respostas: [] as string[], chamadas: 0 }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => { h.chamadas++; return h.respostas.shift() ?? '{}'; }) }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (s: string) => { try { return JSON.parse(s); } catch { return null; } } }));

beforeEach(() => { h.chamadas = 0; h.respostas = []; });

describe('auditarSemanticoEmRodadas', () => {
  it('duas chamadas ao auditor; reprovação numa só não reprova o blueprint', async () => {
    const { auditarSemanticoEmRodadas } = await import('@/lib/blueprint/core');
    const resposta = (falha: boolean) => JSON.stringify({ resumo: 'r', checks: SEIS.map((id) => ({ id, status: falha && id === 'avaliacao-mede' ? 'fail' : 'pass', detalhe: id })) });
    h.respostas = [resposta(true), resposta(false)];
    const r = await auditarSemanticoEmRodadas({ trilha: { semanas: [] }, competencias: [] } as any, { empresaId: 'e1', colaboradorId: 'c1', modelo: 'm' });
    expect(h.chamadas).toBe(2);
    expect(r.checks.find((c) => c.id === 'avaliacao-mede')!.status).toBe('warn');
  });
});

describe('a régua está ligada na produção', () => {
  const core = readFileSync('lib/blueprint/core.ts', 'utf8');
  it('a auditoria de produção usa as duas rodadas; a gravação monta a avaliação final em código', () => {
    expect(core).toMatch(/const semantico = await auditarSemanticoEmRodadas\(blueprint, \{ empresaId, colaboradorId, modelo: auditorModel \}\)/);
    expect(core).toMatch(/const blueprint: DevelopmentBlueprint = montarSemanasDeAvaliacao\(doModelo\)/);
  });
  it('a correção guiada usa a mesma auditoria e monta a avaliação na candidata', () => {
    const corr = readFileSync('lib/blueprint/correcao.ts', 'utf8');
    expect(corr).toMatch(/auditarSemanticoEmRodadas\(bp,/);
    expect(corr).toMatch(/montarSemanasDeAvaliacao\(mesclarBlueprintCorrigido\(original,/);
  });
});
