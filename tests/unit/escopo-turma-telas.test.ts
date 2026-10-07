import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard de CONTRATO (07/10/2026) da fiação do escopo de turma nas telas de acompanhamento.
 * Teste de TEXTO: prova que o código chama a coisa certa, não que a tela funciona (a conta é
 * dos testes de unidade ao lado, e a experiência é da imagem).
 */

const ler = (...partes: string[]) => readFileSync(join(__dirname, '../..', ...partes), 'utf8');

describe('Engajamento: o seletor de turma chega nas duas leituras', () => {
  const painel = ler('components/engajamento/engagement-panel.tsx');

  it('a visão atual recebe a turma escolhida', () => {
    expect(painel).toMatch(/await loadRollup\(semanaSel, cargoSel \|\| null, turmaSel \|\| null\);/);
  });

  it('a evolução semanal recebe a MESMA turma (a identidade do carregador muda com ela)', () => {
    expect(painel).toMatch(/loadEvolution=\{loadEvolutionDaTurma\}/);
    expect(painel).toMatch(/\(area\) => loadEvolution\(area \?\? null, turmaSel \|\| null\),/);
  });

  it('o seletor só aparece com 2 ou mais turmas (empresa de uma turma só segue como antes)', () => {
    expect(painel).toMatch(/\{empresaId && turmas\.length >= 2 && \(/);
  });

  it('trocar de turma limpa semana, função e as listas guardadas da turma anterior', () => {
    const corpo = painel.match(/const trocarTurma = \(id: string\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
    for (const limpeza of ['setSemanaSel(null)', "setCargoSel('')", 'setSemanasDisponiveis([])', 'setCargosDisponiveis([])']) {
      expect(corpo).toContain(limpeza);
    }
  });

  it('o admin e o RH passam o carregador de turmas; o RELATÓRIO do RH segue com a empresa inteira', () => {
    expect(ler('app/admin/engajamento/page.tsx')).toMatch(/loadEvolution=\{loadEvolution\} loadTurmas=\{loadTurmas\} \/>/);
    expect(ler('components/engajamento/rh-panel.tsx')).toMatch(/loadTurmas=\{report \? undefined : listarTurmasEngajamentoRh\} \/>/);
  });
});

describe('Central de relatórios do RH: o panorama da turma é o da jornada dela', () => {
  it('com turma escolhida, o panorama recebe o escopo de leitura', () => {
    expect(ler('lib/relatorios/rh-center.ts')).toMatch(/carregarPanoramaRH\(empresaId, \{ colaboradorIds, escopoTurma \}\),/);
  });
});

describe('Home do RH: o panorama da turma nunca cai nos números da empresa', () => {
  const home = ler('app/dashboard/home-rh.tsx');

  it('com turma escolhida, a leitura é a da turma (falha vira "indisponível", não o total da empresa)', () => {
    expect(home).toMatch(/const p: Panorama = \(turmaSel \? doRecorte : panorama\) \?\? \{/);
  });

  it('o seletor só aparece com 2 ou mais turmas', () => {
    expect(home).toMatch(/\{turmas\.length >= 2 && \(/);
  });
});
