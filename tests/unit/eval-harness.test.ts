import { describe, expect, it } from 'vitest';
import { computarSinais, jsonValido, notaNaRegua, respostaGenerica } from '@/lib/ia-sinais';
import { rodarEval, GATES_PADRAO, type GoldenCase } from '@/lib/eval-harness';

describe('ia-sinais — sinais derivados em código', () => {
  it('jsonValido tolera cercas ```json e pega quebrado', () => {
    expect(jsonValido('{"a":1}')).toBe(true);
    expect(jsonValido('```json\n{"a":1}\n```')).toBe(true);
    expect(jsonValido('{a:')).toBe(false);
    expect(jsonValido('')).toBe(false);
  });

  it('notaNaRegua respeita 1..4', () => {
    expect(notaNaRegua(1)).toBe(true);
    expect(notaNaRegua(4)).toBe(true);
    expect(notaNaRegua(0)).toBe(false);
    expect(notaNaRegua(5)).toBe(false);
    expect(notaNaRegua('3' as any)).toBe(false);
  });

  it('respostaGenerica pega curta/template, não julga qualidade', () => {
    expect(respostaGenerica('ok')).toBe(true);
    expect(respostaGenerica('Desculpe, não entendi sua pergunta.')).toBe(true);
    expect(respostaGenerica('Você observou o professor aplicar a rubrica em sala e...')).toBe(false);
  });

  it('computarSinais NÃO confia em auto-relato — nota fora da régua = baixa confiança', () => {
    const s = computarSinais({ raw: '{"nivel":7}', parsed: { nivel: 7 }, notas: [7] });
    expect(s.notaForaDaRegua).toBe(true);
    expect(s.baixaConfianca).toBe(true);
  });

  it('divergência alta com o determinístico dispara baixa confiança', () => {
    const s = computarSinais({ raw: '{"nota":4}', parsed: { nota: 4 }, notaModelo: 4, notaDeterministica: 1 });
    expect(s.divergenteDoDeterministico).toBe(true);
    expect(s.baixaConfianca).toBe(true);
  });
});

// Baseline sintético: 3 casos, notas [3,3,4].
function golden(id: string, nivel: number): GoldenCase {
  const parsed = { avaliacao_acumulada: [{ nivel }] };
  return { id, taskKey: 'acumulada_primaria', input: {}, baseline: { raw: JSON.stringify(parsed), parsed, notas: [nivel] }, camposObrigatorios: [] };
}
const GOLDENS = [golden('c1', 3), golden('c2', 3), golden('c3', 4)];

describe('eval-harness — gates + validação por MUTAÇÃO', () => {
  it('candidato IGUAL ao baseline é PROMOVIDO', async () => {
    const rel = await rodarEval(GOLDENS, async (g) => g.baseline.raw);
    expect(rel.promovido).toBe(true);
    expect(rel.jsonValidRate).toBe(1);
    expect(rel.regressaoNivelRate).toBe(0);
  });

  // MUTAÇÃO 1: candidato devolve JSON quebrado → gate json_valid REPROVA.
  it('mutação: JSON quebrado reprova (json_valid)', async () => {
    const rel = await rodarEval(GOLDENS, async () => '{quebrado');
    expect(rel.promovido).toBe(false);
    expect(rel.reprovadoPor.some((r) => r.startsWith('json_valid'))).toBe(true);
  });

  // MUTAÇÃO 2: candidato muda a nota de todos os casos (N3→N1) → regressão de nível REPROVA.
  it('mutação: notas erradas reprovam (regressao_nivel)', async () => {
    const rel = await rodarEval(GOLDENS, async () => JSON.stringify({ avaliacao_acumulada: [{ nivel: 1 }] }));
    expect(rel.promovido).toBe(false);
    expect(rel.reprovadoPor.some((r) => r.startsWith('regressao_nivel'))).toBe(true);
  });

  // MUTAÇÃO 3: candidato devolve nota fora da régua (N7) → baixa confiança REPROVA.
  it('mutação: nota fora da régua reprova (baixa_confianca)', async () => {
    const rel = await rodarEval(GOLDENS, async () => JSON.stringify({ avaliacao_acumulada: [{ nivel: 7 }] }));
    expect(rel.promovido).toBe(false);
    expect(rel.reprovadoPor.some((r) => r.startsWith('baixa_confianca'))).toBe(true);
  });

  it('gates padrão são estritos (json ≥99,5%)', () => {
    expect(GATES_PADRAO.jsonValidMin).toBeGreaterThanOrEqual(0.995);
  });
});
