/**
 * Trava dura de evidência (Tarefa B) — enforcement.
 * Uma frase de déficit SEM o traço medido + piso adjacentes NÃO passa.
 * Teste puro (sem DB/IA) — roda no CI.
 */
import { describe, test, expect } from 'vitest';
import { formatLinhaBloqueio, linhaAncorada, type KnockoutEvidencia } from '@/lib/adequacao-cargo/evidencia';

const evTraco: KnockoutEvidencia = {
  traco: 'Persistência', valorBruto: 18, piso: 41,
  consequencia: 'resiliência a rejeição em risco, comprometendo consistência diante de metas mensais',
  ehBloco: false,
};
const evBloco: KnockoutEvidencia = {
  traco: 'Liderança', valorBruto: null, piso: null, ehBloco: true, medidoPct: 32, minPct: 50,
  consequencia: 'aderência de liderança insuficiente para o cargo',
};

describe('evidência ancorada', () => {
  test('linha de bloqueio canônica tem traço + valor + piso na mesma sentença', () => {
    const linha = formatLinhaBloqueio(evTraco);
    expect(linha).toBe('Persistência 18 (piso do cargo: 41) — resiliência a rejeição em risco, comprometendo consistência diante de metas mensais');
    expect(linhaAncorada(linha, evTraco)).toBe(true);
  });

  test('linha de bloqueio de BLOCO tem bloco + medido% + mínimo%', () => {
    const linha = formatLinhaBloqueio(evBloco);
    expect(linha).toContain('Liderança 32% (mínimo do cargo: 50%)');
    expect(linhaAncorada(linha, evBloco)).toBe(true);
  });

  test('FALHA: construto nomeado sem o traço medido + piso (achismo)', () => {
    const fraseSemAncora = 'Resiliência insuficiente compromete o forecast e a credibilidade com a gestão.';
    expect(linhaAncorada(fraseSemAncora, evTraco)).toBe(false);
  });

  test('FALHA: cita o traço mas sem o piso quantificado', () => {
    const semPiso = 'Persistência 18 está baixa para o cargo.'; // falta o piso 41
    expect(linhaAncorada(semPiso, evTraco)).toBe(false);
  });
});
