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

describe('Fase 2 (IA4): respostas, roster e temporadas saem do recorte da turma', () => {
  const fase2 = ler('app/admin/empresas/[empresaId]/fase2/page.tsx');

  it('turma escolhida sem escopo carregado é lista VAZIA, nunca a empresa toda', () => {
    expect(fase2).toMatch(/const escopoEfetivo = turmaSel \? \(escopoTurma \?\? ESCOPO_TURMA_VAZIO\) : null;/);
  });

  it('as três listas que a tela lê são derivadas do recorte (o resto do código não muda)', () => {
    expect(fase2).toMatch(/respostasDaTurma\(respostasBrutas as any\[\], escopoEfetivo\)/);
    expect(fase2).toMatch(/trilhasDaTurma\(trilhasBrutas as any\[\], escopoEfetivo\)/);
    expect(fase2).toMatch(/pessoasDaTurma\(rosterBruto\.pessoas, escopoEfetivo\)/);
  });

  it('trocar de turma limpa a seleção do lote e as escolhas de cargo e de pessoa', () => {
    expect(fase2).toMatch(/\[filtroCargo, filtroColab, filtroStatus, filtroNota, turmaSel\]\);/);
    // Só o corpo de `escolherTurma`: o mesmo texto também existe em `limparFiltros`, e casar a
    // outra ocorrência deixaria passar a remoção desta.
    const corpo = fase2.match(/async function escolherTurma\(id: string\) \{([\s\S]*?)\r?\n  \}\r?\n/)?.[1] || '';
    expect(corpo).toContain("setFiltroCargo(''); setFiltroColab('');");
  });

  it('a resposta chega com o carimbo de quando foi dada (a janela depende dele)', () => {
    expect(ler('actions/fase3.ts')).toMatch(/feedback_ia4, created_at, timestamp_resposta'\)/);
  });
});

describe('Temporadas (admin): a trilha entra na turma pelo carimbo da participação', () => {
  it('a lista é recortada pela mesma régua e a action devolve o carimbo', () => {
    expect(ler('app/admin/temporadas/page.tsx')).toMatch(/trilhasDaTurma\(items as any\[\], escopoEfetivo\)/);
    expect(ler('app/admin/temporadas/page.tsx')).toMatch(/const escopoEfetivo = turmaSel \? \(escopoTurma \?\? ESCOPO_TURMA_VAZIO\) : null;/);
    expect(ler('actions/temporadas.ts')).toMatch(/programa_modo, turma_membro_id'\)/);
  });
});

describe('Lista de pessoas: o filtro de turma não adivinha', () => {
  const pagina = ler('app/admin/empresas/gerenciar/page.tsx');

  it('"Sem turma" é turma_id === null (lido e vazio); leitura que falhou (undefined) não casa com nada', () => {
    expect(pagina).toMatch(/\(turmaSel === SEM_TURMA \? c\.turma_id === null : c\.turma_id === turmaSel\)/);
    expect(ler('app/admin/empresas/gerenciar/actions.ts')).toMatch(/turma_id: turmaDe \? \(turmaDe\.get\(c\.id\)\?\.id \?\? null\) : undefined,/);
  });

  it('o seletor oferece só turmas com gente ATIVA (a lista mostra a turma de hoje, não o histórico)', () => {
    expect(pagina).toMatch(/const turmasAtivas = turmas\.filter\(\(turma\) => turma\.ativos > 0\);/);
    expect(pagina).toMatch(/<SeletorTurma turmas=\{turmasAtivas\}/);
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
