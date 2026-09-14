import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizarResumoAvaliacao } from '@/lib/season-engine/resumo-avaliacao';

/**
 * O card da pessoa em /admin/evolucao passou a abrir o relatório dela.
 *
 * 🔴 A armadilha estava no `resumo_avaliacao`, que existe em DUAS FORMAS na base
 * (`Medido: 14/09/2026`, 39 Evolution Reports): **objeto** nos 2 relatórios de
 * tenant REAL e **string** crua nos 37 dos três tenants de DEMO, porque o
 * fixture da demo declara `resumo_avaliacao: string`.
 *
 * Renderizar a forma da demo quebra a produção ("Objects are not valid as a
 * React child"); ler `.mensagem_geral` deixa a demo MUDA, sem erro nenhum. É o
 * caso em que a fixture não prova a entrada real, e as duas chegam à mesma tela.
 */

const TELA = readFileSync('app/admin/evolucao/page.tsx', 'utf8');

describe('resumo do fechamento: as duas formas que existem na base', () => {
  it('a forma dos tenants de DEMO é string crua', () => {
    expect(normalizarResumoAvaliacao('Reconheceu o que deveria ser feito e descreveu o caminho.')).toEqual({
      mensagem: 'Reconheceu o que deveria ser feito e descreveu o caminho.',
      avanco: null,
      atencao: null,
      evidencias: [],
    });
  });

  it('a forma dos tenants REAIS é objeto, e os quatro campos chegam à tela', () => {
    const real = {
      mensagem_geral: 'Ao longo das 8 semanas do programa, você construiu algo real.',
      principal_avanco: 'Nomear o que pesa antes de reorganizar o trabalho.',
      principal_ponto_de_atencao: 'Metas ainda sem critério de conclusão.',
      evidencias_citadas: ['a prioridade será finalizar a prestação de contas do PDDE'],
    };

    expect(normalizarResumoAvaliacao(real)).toEqual({
      mensagem: 'Ao longo das 8 semanas do programa, você construiu algo real.',
      avanco: 'Nomear o que pesa antes de reorganizar o trabalho.',
      atencao: 'Metas ainda sem critério de conclusão.',
      evidencias: ['a prioridade será finalizar a prestação de contas do PDDE'],
    });
  });

  it('objeto sem mensagem não vira bloco vazio na tela', () => {
    // Título de seção com nada embaixo é pior que seção ausente.
    expect(normalizarResumoAvaliacao({ evidencias_citadas: ['trecho'] })).toBeNull();
    expect(normalizarResumoAvaliacao({ mensagem_geral: '   ' })).toBeNull();
  });

  it('o que não é resumo devolve null em vez de explodir na renderização', () => {
    for (const entrada of [null, undefined, '', '  ', 42, true, ['a'], {}]) {
      expect(normalizarResumoAvaliacao(entrada)).toBeNull();
    }
  });

  it('evidências só entram se forem texto', () => {
    const r = normalizarResumoAvaliacao({
      mensagem_geral: 'texto',
      evidencias_citadas: ['vale', null, 7, { t: 'x' }, '  ', 'vale também'],
    });
    expect(r?.evidencias).toEqual(['vale', 'vale também']);
  });

  it('evidências em formato inesperado não viram lista quebrada', () => {
    expect(normalizarResumoAvaliacao({ mensagem_geral: 'texto', evidencias_citadas: 'um trecho só' })?.evidencias)
      .toEqual([]);
  });
});

describe('o card abre o relatório da pessoa', () => {
  it('o card é um botão, não uma div clicável', () => {
    // Quem navega por teclado precisa alcançar e acionar o card.
    const card = TELA.slice(TELA.indexOf('function ColabRow'), TELA.indexOf('const TINTA_VEREDITO'));
    expect(card).toContain('<button');
    expect(card).toContain('onClick={onAbrir}');
    expect(card).toContain("aria-label={t('detail.open'");
  });

  it('o detalhe é um diálogo que fecha no Esc e no fundo', () => {
    const detalhe = TELA.slice(TELA.indexOf('function DetalheDaPessoa'));
    expect(detalhe).toContain('role="dialog"');
    expect(detalhe).toContain('aria-modal="true"');
    expect(detalhe).toContain("evento.key === 'Escape'");
    expect(detalhe).toContain('onClick={onClose}');
    // O clique dentro do painel não pode fechar o que a pessoa está lendo.
    expect(detalhe).toContain('e.stopPropagation()');
  });

  /**
   * 🔴 Quem rola é o PAINEL. Com `overflow-y-auto` no backdrop, o cabeçalho
   * `sticky` para na borda de conteúdo do container e o padding dele (`p-2
   * md:p-6`) vira uma faixa por onde o texto do relatório aparece ACIMA do nome
   * da pessoa, cortado. Visto no harness em 14/09/2026, nas duas telas (a de
   * admin herdou o padrão da do gestor).
   */
  it('o scroll fica no painel, não no fundo', () => {
    const gestor = readFileSync('app/dashboard/gestor/equipe-evolucao/page.tsx', 'utf8');
    for (const tela of [TELA, gestor]) {
      const dialogo = tela.slice(tela.indexOf('role="dialog"'));
      const backdrop = tela.slice(tela.lastIndexOf('fixed inset-0 z-[60]', tela.indexOf('role="dialog"')), tela.indexOf('role="dialog"'));
      expect(backdrop).not.toContain('overflow-y-auto');
      expect(dialogo).toContain('max-h-full');
      expect(dialogo).toContain('overflow-y-auto');
    }
  });

  /**
   * Nota absoluta fora, avanço dentro (decisão do dono, 14/09/2026): "2,0 → 2,3"
   * e "nota média no fechamento: 2,2" convidam a comparar pessoas por um ponto
   * de partida que ninguém escolheu, e a diferença negativa afirma piora que a
   * régua não sustenta. Sobra o que a leitura pede: quanto andou e o veredito.
   */
  it('o detalhe mostra o avanço e o veredito, não o par de notas', () => {
    // A âncora é o TRECHO do detalhe: `media_pre.toFixed(1)` do agregado por
    // competência (a média da população, outra leitura) contém a mesma
    // substring e faria este teste passar ou falhar pelo motivo errado.
    const detalhe = TELA.slice(TELA.indexOf('function DetalheDaPessoa'));
    expect(detalhe).toContain('formatarAvanco(d.nota_pre, d.nota_pos)');
    expect(detalhe).not.toContain('nota_pre.toFixed');
    expect(detalhe).not.toContain('nota_pos.toFixed');
    expect(detalhe).not.toContain('nota_media_pos');
    expect(TELA).not.toContain('averagePost');
  });

  it('o detalhe lê as réguas em vez de reimplementá-las', () => {
    expect(TELA).toContain("from '@/lib/season-engine/convergencia'");
    expect(TELA).toContain("from '@/lib/season-engine/resumo-avaliacao'");
    expect(TELA).toContain('rotuloConvergencia(d.convergencia)');
    expect(TELA).toContain('normalizarResumoAvaliacao(report.resumo_avaliacao)');
    expect(TELA).toContain('qualitativaSustenta(d)');
    // Ler `.mensagem_geral` direto é o que apaga o bloco nos tenants de demo.
    expect(TELA).not.toContain('resumo_avaliacao.mensagem_geral');
    expect(TELA).not.toContain("d.convergencia === 'estagnacao'");
  });

  /**
   * Os dois PDFs de evolução existiam e não tinham botão nesta tela: o
   * individual só no painel do gestor do tenant, o consolidado só em
   * /dashboard/relatorios. Quem estava no /admin tinha que sair da tela.
   */
  it('a tela oferece o PDF individual e o consolidado', () => {
    expect(TELA).toContain('/api/temporada/concluida/pdf?email=');
    expect(TELA).toContain('/api/relatorios/evolucao/pdf?empresa=');
    expect(TELA).toContain("t('detail.pdf')");
    expect(TELA).toContain("t('consolidatedPdf')");
    // O email do alvo vem do payload da lista, não montado na tela.
    expect(TELA).toContain('trilha.colab?.email');
    const acao = readFileSync('actions/evolution-report.ts', 'utf8');
    expect(acao).toContain("select('id, nome_completo, email, cargo, area_depto')");
  });

  /**
   * 🔴 Marca dos PDFs baixados pela PLATAFORMA: Vertho (decisão do dono,
   * 14/09/2026). Não é só política: `auth.empresaId` de um platform admin é a
   * empresa do cadastro DELE, então resolver a marca por ali imprimiria o logo
   * de um tenant no relatório de outro. O download do CLIENTE não muda: segue a
   * flag `pdf_sem_marca`, que é o combinado com Macaé desde 17/08.
   */
  it('o PDF baixado pela plataforma sai com a marca Vertho, e o do cliente não muda', () => {
    const individual = readFileSync('app/api/temporada/concluida/pdf/route.ts', 'utf8');
    const consolidado = readFileSync('app/api/relatorios/evolucao/pdf/route.ts', 'utf8');
    for (const rota of [individual, consolidado]) {
      expect(rota).toContain('marcaVertho()');
      expect(rota).toContain('isPlatformAdmin');
      expect(rota).toContain('resolverMarcaPdf(');
    }
    // Quem decide de que empresa é o consolidado é `resolverEmpresaDoRelatorio`
    // (régua e casos em `empresa-do-relatorio.test.ts`): `?empresa=` só vale
    // para a plataforma, e a guarda mede o valor RESOLVIDO, não a sessão.
    expect(consolidado).toContain("resolverEmpresaDoRelatorio(auth, searchParams.get('empresa'))");
  });

  it('não vai ao banco para abrir o detalhe: o relatório já vem na lista', () => {
    const acao = readFileSync('actions/evolution-report.ts', 'utf8');
    expect(acao).toContain('evolution_report');
    expect(acao).toContain('trilhas: trilhasComColab');
    expect(TELA).not.toContain('loadEvolutionReportDe');
  });
});
