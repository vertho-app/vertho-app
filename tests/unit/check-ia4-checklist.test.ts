import { describe, it, expect } from 'vitest';
import { processCheckResult, CHECK_ITENS } from '@/lib/check-ia4-core';

const todos = (ok: boolean) =>
  Object.fromEntries(CHECK_ITENS.map((i) => [i.id, { ok, obs: ok ? '' : 'falhou' }]));

const comFalhas = (ids: string[]) => {
  const v = todos(true);
  for (const id of ids) v[id] = { ok: false, obs: `problema em ${id}` };
  return v;
};

describe('processCheckResult — nota derivada do checklist', () => {
  it('tudo certo = 100 e aprovado', () => {
    const { status, check } = processCheckResult({ verificacoes: todos(true) });
    expect(check.nota).toBe(100);
    expect(status).toBe('aprovado');
    expect(check.erro_grave).toBe(false);
  });

  it('tudo errado = 0 e revisar', () => {
    const { status, check } = processCheckResult({ verificacoes: todos(false) });
    expect(check.nota).toBe(0);
    expect(status).toBe('revisar');
  });

  it('UMA discordância move só o peso do item — não 25 pontos', () => {
    // Era este o defeito medido: `60 · 84 · 88` na mesma entrada, porque o
    // erro_grave grampeava em 60. Um item de 7 pontos tem que custar 7.
    const leve = CHECK_ITENS.find((i) => !i.critico && i.peso === 7)!;
    const { check } = processCheckResult({ verificacoes: comFalhas([leve.id]) });
    expect(check.nota).toBe(93);
    expect(100 - check.nota).toBe(leve.peso);
  });

  it('UM crítico isolado NÃO segura o veredito — é onde o julgamento oscila', () => {
    // Medido em 12/08: F1 reprovado em 2 de 3 rodadas IDÊNTICAS. Com um crítico
    // bastando, o veredito virava moeda.
    const soCritico = CHECK_ITENS.find((i) => i.critico && !i.fatal)!;
    const { status, check } = processCheckResult({ verificacoes: comFalhas([soCritico.id]) });
    expect(status).not.toBe('revisar');
    expect(check.criticos_falhos).toContain(soCritico.id);
    expect(check.erro_grave).toBe(false);
  });

  it('DOIS críticos seguram em revisar mesmo com nota alta', () => {
    const criticos = CHECK_ITENS.filter((i) => i.critico && !i.fatal).slice(0, 2);
    const { status, check } = processCheckResult({ verificacoes: comFalhas(criticos.map((i) => i.id)) });
    expect(check.nota).toBeGreaterThanOrEqual(80); // a nota mal cai...
    expect(status).toBe('revisar');                // ...mas não passa
    expect(check.erro_grave).toBe(true);
  });

  it('o item FATAL segura SOZINHO — alucinação não passa em hipótese nenhuma', () => {
    const fatal = CHECK_ITENS.find((i) => i.fatal)!;
    const { status, check } = processCheckResult({ verificacoes: comFalhas([fatal.id]) });
    expect(check.nota).toBe(100 - fatal.peso); // perde só o peso do item...
    expect(status).toBe('revisar');            // ...mas não passa
    expect(check.erro_grave).toBe(true);
  });

  it('item AUSENTE não pune — normaliza pelos respondidos', () => {
    const v = todos(true);
    delete (v as any)[CHECK_ITENS[0].id];
    const { check } = processCheckResult({ verificacoes: v });
    expect(check.nota).toBe(100);
    expect(check.itens_respondidos).toBeLessThan(100);
  });

  it('resposta sem nenhuma verificação utilizável vira erro, não nota zero', () => {
    expect(processCheckResult({ verificacoes: {} }).status).toBe('erro');
    expect(processCheckResult({ verificacoes: { A1: { ok: 'sim' } } }).check).toBeNull();
    expect(processCheckResult(null).status).toBe('erro');
  });

  it('formato ANTIGO continua legível, com a régua de então', () => {
    const { status, check } = processCheckResult({ nota: 87, erro_grave: false });
    expect(check.nota).toBe(87);
    expect(status).toBe('aprovado_com_ajustes');
    // e o teto antigo do erro_grave segue valendo para esses payloads
    expect(processCheckResult({ nota: 95, erro_grave: true }).check.nota).toBe(60);
  });

  it('os pesos somam 100 — senão a nota não é comparável com o histórico', () => {
    expect(CHECK_ITENS.reduce((s, i) => s + i.peso, 0)).toBe(100);
  });

  it('itens falhos viram lista acionável', () => {
    const { check } = processCheckResult({ verificacoes: comFalhas(['C1', 'E2']) });
    expect(check.itens_falhos).toHaveLength(2);
    expect(check.itens_falhos[0]).toContain('C1');
  });
});
