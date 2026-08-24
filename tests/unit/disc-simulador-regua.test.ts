import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { gerarMapeamentoSimulado, sortearDisc, DOMINANTE_MIN, DOMINANTE_MAX } from '@/lib/disc-simulador';
import { normalizarDisc, computeLeadership, deriveProfile, DISC_SOMA_ALVO } from '@/lib/disc-mapeamento';
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';

/**
 * O simulador precisa produzir dado INDISTINGUÍVEL em estrutura do mapeamento
 * real. Até 24/08/2026 ele tinha régua própria nas quatro coisas (soma 100 ×
 * 200, liderança por mistura × DISC/2, competências por ruído × regressão,
 * perfil de uma letra × combo) e populou `projetomacae` (13 pessoas) e `acme`
 * (4) com números que a plataforma real nunca gera.
 *
 * Estes testes falham se alguém reintroduzir uma régua paralela.
 */
describe('Simulador DISC — mesma régua do mapeamento real', () => {
  const AMOSTRAS = 300;

  it('o DISC sorteado soma exatamente 200 e o dominante fica na faixa real', () => {
    for (let i = 0; i < AMOSTRAS; i++) {
      const d = sortearDisc();
      const vals = [d.D, d.I, d.S, d.C];
      expect(vals.reduce((a, b) => a + b, 0)).toBe(DISC_SOMA_ALVO);
      const maior = Math.max(...vals);
      expect(maior).toBeGreaterThanOrEqual(DOMINANTE_MIN);
      expect(maior).toBeLessThanOrEqual(DOMINANTE_MAX);
      expect(Math.min(...vals)).toBeGreaterThanOrEqual(0);
    }
  });

  it('liderança é metade do fator DISC correspondente', () => {
    for (let i = 0; i < AMOSTRAS; i++) {
      const p = gerarMapeamentoSimulado();
      expect(p.lid_executivo).toBeCloseTo(p.d_natural / 2, 1);
      expect(p.lid_motivador).toBeCloseTo(p.i_natural / 2, 1);
      expect(p.lid_metodico).toBe(Math.round(p.s_natural / 2));
      expect(p.lid_sistematico).toBe(Math.round(p.c_natural / 2));
      // Os 4 estilos somam ~100 porque o DISC soma 200.
      const somaLid = p.lid_executivo + p.lid_motivador + p.lid_metodico + p.lid_sistematico;
      expect(somaLid).toBeGreaterThan(97);
      expect(somaLid).toBeLessThan(103);
    }
  });

  it('competências saem da regressão canônica, não de ruído aleatório', () => {
    // Mesmo DISC → MESMAS competências. O simulador antigo usava `biased()`,
    // que devolvia valor diferente a cada chamada para a mesma entrada.
    const disc = { D: 70, I: 50, S: 45, C: 35 };
    const a = gerarMapeamentoSimulado(disc);
    const b = gerarMapeamentoSimulado(disc);
    const esperado = computeDiscCompetenciesNatural(normalizarDisc(disc, DISC_SOMA_ALVO));

    expect(a.comp_ousadia).toBe(b.comp_ousadia);
    expect(a.comp_organizacao).toBe(b.comp_organizacao);
    expect(a.comp_ousadia).toBe(esperado.Ousadia);
    expect(a.comp_persistencia).toBe(esperado['Persistência']);
    expect(a.comp_prudencia).toBe(esperado['Prudência']);
    expect(a.comp_concentracao).toBe(esperado['Concentração']);
  });

  it('o perfil dominante usa o combo (todas ≥ 50), como o mapeamento real', () => {
    const p = gerarMapeamentoSimulado({ D: 20, I: 30, S: 70, C: 80 });
    expect(p.perfil_dominante).toBe(deriveProfile({ D: p.d_natural, I: p.i_natural, S: p.s_natural, C: p.c_natural }));
    expect(p.perfil_dominante.length).toBeGreaterThan(1); // CS — combo, não letra só

    // E numa população, o combo tem que ser o caso COMUM (no banco real:
    // 137 de 201). Sem isso o simulado se denuncia de longe.
    let comCombo = 0;
    for (let i = 0; i < AMOSTRAS; i++) {
      if (gerarMapeamentoSimulado().perfil_dominante.length >= 2) comCombo++;
    }
    expect(comCombo / AMOSTRAS).toBeGreaterThan(0.5);
  });

  it('marca a origem como simulada e invalida os caches de relatório', () => {
    const p = gerarMapeamentoSimulado();
    expect(JSON.parse(p.disc_resultados).origem).toBe('simulado');
    expect(p.report_texts).toBeNull();
    expect(p.comportamental_pdf_path).toBeNull();
    expect(p.insights_executivos).toBeNull();
  });

  it('as derivações vêm da fonte única (mesma função da tela do mapeamento)', () => {
    const disc = { D: 66, I: 54, S: 42, C: 38 };
    const p = gerarMapeamentoSimulado(disc);
    const lead = computeLeadership(normalizarDisc(disc, DISC_SOMA_ALVO));
    expect(p.lid_executivo).toBe(lead.Executivo);
    expect(p.lid_motivador).toBe(lead.Motivador);
  });
});

describe('Guard: régua do mapeamento não pode ser recopiada', () => {
  // As três funções viviam DENTRO da tela do mapeamento — foi por isso que o
  // simulador nasceu com régua própria. Quem precisar delas importa de
  // `lib/disc-mapeamento`; redefinir localmente reabre a divergência.
  const FONTE = 'lib/disc-mapeamento.ts';
  const PROIBIDO = [
    /function\s+computeLeadership\s*\(/,
    /function\s+deriveProfile\s*\(/,
    /function\s+normalizarDisc\s*\(/,
  ];

  function arquivos(): string[] {
    try {
      const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.split('\0').filter(Boolean);
    } catch {
      return [];
    }
  }

  it('nenhum arquivo além da fonte única define essas funções', () => {
    const violacoes: string[] = [];
    for (const rel of arquivos()) {
      if (!['.ts', '.tsx'].includes(extname(rel))) continue;
      if (rel === FONTE || rel.includes('/tests/') || rel.startsWith('tests/')) continue;
      let conteudo: string;
      try { conteudo = readFileSync(rel, 'utf-8'); } catch { continue; }
      for (const padrao of PROIBIDO) {
        if (padrao.test(conteudo)) violacoes.push(`${rel} → ${padrao.source}`);
      }
    }
    expect(violacoes, `Régua do mapeamento redefinida fora de ${FONTE}:\n  ${violacoes.join('\n  ')}\nImporte de '@/lib/disc-mapeamento'.`).toEqual([]);
  });
});
