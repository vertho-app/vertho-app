/**
 * R-119 (revisão de 02/10/2026): o entorno dos simuladores divergia.
 *
 * - Três avisos de "não altera" diferentes, um deles citando uma "avaliação
 *   comportamental" que não existe no produto. Agora é UM aviso
 *   (`SimuladoresRelatorio.naoAltera`, e a variante da equipe), usado pelos
 *   três simuladores.
 * - O formato "Simulador" da preferência de aprendizagem confundia com os
 *   simuladores: virou "Exercício prático".
 * - Em en-US o mesmo simulador era "Customer service simulator" no menu e
 *   "Service simulator" no topo da tela.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const MENSAGENS: Record<string, any> = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]),
);

describe('R-119: aviso único e nomes alinhados nos simuladores', () => {
  it('os três simuladores usam o mesmo aviso', () => {
    const usos = {
      'components/recepcao/treino.tsx': /tRelatorio\('naoAltera'\)/,
      'components/simulador-vendas/relatorio.tsx': /tRelatorio\(equipe \? 'naoAlteraEquipe' : 'naoAltera'\)/,
      'components/simulador-lideranca/treino.tsx': /tRelatorio\('naoAltera'\)/,
    };
    for (const [arquivo, uso] of Object.entries(usos)) {
      const fonte = readFileSync(arquivo, 'utf8');
      expect(fonte, arquivo).toMatch(uso);
      expect(fonte, arquivo).toMatch(/useTranslations\('SimuladoresRelatorio'\)/);
      expect(fonte, arquivo).not.toMatch(/'reportDisclaimer'|'disclaimerTeam'|'disclaimer'/);
    }
  });

  it('o aviso existe nos quatro idiomas e os antigos saíram', () => {
    for (const l of LOCALES) {
      const m = MENSAGENS[l];
      expect(m.SimuladoresRelatorio.naoAltera, l).toBeTruthy();
      expect(m.SimuladoresRelatorio.naoAlteraEquipe, l).toBeTruthy();
      expect(m.SimuladorAtendimento.reportDisclaimer, l).toBeUndefined();
      expect(m.SimuladorVendas.disclaimer, l).toBeUndefined();
      expect(m.SimuladorVendas.disclaimerTeam, l).toBeUndefined();
    }
    expect(JSON.stringify(MENSAGENS['pt-BR'])).not.toMatch(/avaliação comportamental/);
  });

  it('a preferência de aprendizagem não chama o formato de "Simulador"', () => {
    for (const l of LOCALES) {
      expect(MENSAGENS[l].BehavioralMapping.learning.formats.exercise, l).not.toMatch(/simula/i);
    }
  });

  it('en-US: o topo da tela do atendimento usa o nome do menu', () => {
    const en = MENSAGENS['en-US'];
    expect(en.SimuladorAtendimento.eyebrow.split(' · ')[0]).toBe(en.DashboardShell.nav.receptionTraining);
  });
});
