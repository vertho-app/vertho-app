/**
 * O que a pessoa leva para casa da temporada: o PDF e a tela de onde ele sai.
 *
 * 🔴 POR QUE (16/09/2026). O dono abriu um PDF real e encontrou o que as
 * telas de admin e do gestor tinham deixado de mostrar em 14/09: um card
 * "Regressões", o par "de 2,0 para 3,2" em cada descritor, a nota média do
 * fechamento e o rótulo "Estagnação". A régua não tem veredito de regressão
 * desde 01/09 e a decisão de mostrar só o AVANÇO (com piso em zero) já existia
 * em `avancoExibido`; faltava valer nestes quatro lugares, que são justamente os
 * do colaborador. E a lista de descritores corria sem dizer a qual das duas
 * competências da trilha DUO cada um pertence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isValidElement, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import RelatorioTemporadaConcluida from '@/components/temporada/relatorio-temporada-concluida';
import { avancoDoPdf, avancoValorPdf, contadoresDoPdf, TemporadaConcluidaPDF } from '@/lib/temporada-concluida-pdf';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';
import { semComentarios } from '../helpers/fonte';

/**
 * O texto do PDF na ordem em que vai para o papel, lido da ÁRVORE que o
 * componente monta, sem renderizar: o render baixa a fonte da CDN, e teste de
 * unidade não depende de rede.
 */
function textos(no: any, out: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return out;
  if (typeof no === 'string' || typeof no === 'number') { out.push(String(no)); return out; }
  if (Array.isArray(no)) { for (const n of no) textos(n, out); return out; }
  if (isValidElement(no)) {
    const { type, props } = no as any;
    return typeof type === 'function' ? textos(type(props), out) : textos(props?.children, out);
  }
  return out;
}

/** A TELA equivalente, renderizada com as traduções reais e sem sessão. */
function htmlDaTela(locale: string, data: any) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale, messages, timeZone: 'America/Sao_Paulo',
    children: createElement(RelatorioTemporadaConcluida, { data }),
  }));
}

describe('avanço no PDF', () => {
  it('só o avanço, com vírgula decimal', () => {
    expect(avancoDoPdf(2.0, 3.2)).toBe('+1,2');
    expect(avancoDoPdf(2.1, 2.4)).toBe('+0,3');
  });

  it('queda vira 0,0: o PDF não afirma piora', () => {
    expect(avancoDoPdf(2.3, 2.1)).toBe('0,0');
    expect(avancoDoPdf(2, 2)).toBe('0,0');
  });

  it('nota ausente não vira avanço inventado', () => {
    expect(avancoDoPdf(null, 2.5)).toBeNull();
    expect(avancoDoPdf(2.5, undefined)).toBeNull();
  });
});

describe('contadores do topo', () => {
  it('são três, e regressão de relatório antigo conta como estável', () => {
    expect(contadoresDoPdf({ confirmadas: 1, parciais: 5, estagnacoes: 3, regressoes: 2 }))
      .toEqual({ confirmadas: 1, parciais: 5, estaveis: 5 });
    expect(contadoresDoPdf(undefined)).toEqual({ confirmadas: 0, parciais: 0, estaveis: 0 });
  });
});

describe('descritores agrupados por competência', () => {
  it('mantém a ordem do relatório e separa as duas competências da trilha DUO', () => {
    const grupos = agruparPorCompetencia([
      { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Leitura de avaliações externas' },
      { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Definição de metas' },
      { competencia: 'Apoio técnico e monitoramento das unidades', descritor: 'Orientação técnico-pedagógica' },
    ]);
    expect(grupos.map((g) => [g.competencia, g.descritores.length])).toEqual([
      ['Avaliação e monitoramento de resultados', 2],
      ['Apoio técnico e monitoramento das unidades', 1],
    ]);
  });

  it('descritor sem competência não some: fica num grupo sem título', () => {
    const grupos = agruparPorCompetencia([{ descritor: 'X' }, { competencia: '  ', descritor: 'Y' }]);
    expect(grupos).toEqual([{
      competencia: null, descritores: [{ descritor: 'X' }, { competencia: '  ', descritor: 'Y' }],
      avancoMedio: null, nivelInicial: null, nivelFinal: null, subiuDeNivel: false,
    }]);
    expect(agruparPorCompetencia(null)).toEqual([]);
  });

  /**
   * 🔴 O caso que o dono apontou (16/09/2026): "Apoio técnico" listava +0,1, 0,0,
   * +0,3, +0,3 e 0,0 e o cabeçalho dizia "Avanço médio 0,0", porque a conta era
   * média das notas finais menos média das iniciais, e as quedas de Registro e
   * devolutiva (2,0 → 1,4) e Presença (2,9 → 2,2) entravam escondidas. Notas
   * REAIS de um relatório de produção.
   */
  it('avanço da competência é a média dos avanços EXIBIDOS (notas reais)', () => {
    const [avaliacao, apoio] = agruparPorCompetencia([
      { competencia: 'Avaliação', nota_pre: 2, nota_pos: 3.2 },
      { competencia: 'Avaliação', nota_pre: 2, nota_pos: 2.5 },
      { competencia: 'Avaliação', nota_pre: 2.5, nota_pos: 2.1 },
      { competencia: 'Avaliação', nota_pre: 2.5, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 2.1 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 1.4 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2.9, nota_pos: 2.2 },
    ]);
    expect(avancoValorPdf(apoio.avancoMedio)).toBe('+0,1');     // (0,1 + 0 + 0,3 + 0,3 + 0) / 5
    expect(avancoValorPdf(avaliacao.avancoMedio)).toBe('+0,4'); // (1,2 + 0,5 + 0 + 0) / 4
  });

  it('nível final é o da MÉDIA das notas; subiu só quando o nível da média sobe', () => {
    // Caso real, Planejamento: média 1,70 (N1) → 2,53 (N2).
    const [subiu] = agruparPorCompetencia([
      { competencia: 'P', nota_pre: 1.5, nota_pos: 2.4 },
      { competencia: 'P', nota_pre: 1.9, nota_pos: 2.66 },
    ]);
    expect(subiu).toMatchObject({ nivelInicial: 1, nivelFinal: 2, subiuDeNivel: true });
    // Caso real, Avaliação: 2,25 (N2) → 2,53 (N2): mesmo nível, sem parabéns.
    const [manteve] = agruparPorCompetencia([
      { competencia: 'A', nota_pre: 2.25, nota_pos: 2.53 },
    ]);
    expect(manteve).toMatchObject({ nivelFinal: 2, subiuDeNivel: false });
    // N4 abre acima de 3,5 (régua oficial), não em 4,0.
    const [n4] = agruparPorCompetencia([{ competencia: 'X', nota_pre: 3.2, nota_pos: 3.6 }]);
    expect(n4).toMatchObject({ nivelInicial: 3, nivelFinal: 4, subiuDeNivel: true });
  });

  it('nível que CAI permanece o de partida: sem regressão também na competência (16/09/2026)', () => {
    // Média 3,10 (N3) → 2,80 (N2): o papel diz "Nível final N3", sem parabéns.
    const [caiu] = agruparPorCompetencia([
      { competencia: 'C', nota_pre: 3.1, nota_pos: 2.8 },
    ]);
    expect(caiu).toMatchObject({ nivelInicial: 3, nivelFinal: 3, subiuDeNivel: false });
  });

  it('descritor sem nota fica fora do avanço e do nível em vez de contar como zero', () => {
    const [g] = agruparPorCompetencia([
      { competencia: 'C', nota_pre: 2, nota_pos: 2.4 },
      { competencia: 'C', nota_pre: null, nota_pos: 3 },
    ]);
    expect(g.avancoMedio).toBe(0.4);
    expect(g).toMatchObject({ nivelInicial: 2, nivelFinal: 2 });
    const [vazio] = agruparPorCompetencia([{ competencia: 'C', nota_pre: null, nota_pos: null }]);
    expect(avancoValorPdf(vazio.avancoMedio)).toBeNull();
    expect(vazio.nivelFinal).toBeNull();
  });
});

/**
 * Âncoras EXATAS do que foi removido, em vez de regex larga: o mesmo arquivo
 * tem `nota_media_pos` legítimo (dado carregado, variante piloto) e uma regex
 * sobre "nota" casaria outra coisa.
 */
const SUPERFICIES: Array<[string, string[]]> = [
  ['lib/temporada-concluida-pdf.tsx', ['label="Regressões"', 'transicao(', 'Nota média pós-temporada', "label: 'Regressão'", "label: 'Estagnação'"]],
  ['components/temporada/relatorio-temporada-concluida.tsx', ["t('stats.regressions')", "labelKey: 'regression'", "t('final.postAverage')", '→ {d.nota_pos}']],
  ['app/dashboard/temporada/page.tsx', ["label: 'Regressão'", "label: 'Estagnação'", '{d.nota_pre} →', 'consolidado.pre.toFixed']],
  ['app/dashboard/temporada/sem14/page.tsx', ["t('done.pre')", "t('done.post')", '{avaliacao.delta_medio}']],
];

describe('superfícies do colaborador sem regressão e sem nota absoluta', () => {
  it.each(SUPERFICIES)('%s', (arquivo, proibidos) => {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
    for (const p of proibidos) expect(fonte, `"${p}" voltou em ${arquivo}`).not.toContain(p);
    // e o avanço passa pela régua única, não por conta feita na tela
    expect(fonte).toMatch(/formatarAvanco|avancoDoPdf/);
  });
});

describe('traduções', () => {
  for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
    it(`${loc}: sem rótulo de regressão e com "estável" no lugar de estagnação`, () => {
      const j = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      expect(j.SeasonDone.stats.regressions).toBeUndefined();
      expect(j.SeasonDone.classification.regression).toBeUndefined();
      expect(j.SeasonDone.final.postAverage).toBeUndefined();
      expect(j.SeasonFinal.done.pre).toBeUndefined();
      expect(j.SeasonFinal.done.progress).toBeTruthy();
      expect(j.SeasonDone.competencyProgress).toBeTruthy();
      expect(String(j.SeasonDone.classification.stagnation)).toMatch(/^(Estável|Stable|Estable)$/);
    });
  }
});

/**
 * A ORDEM do documento (pedido do dono, 16/09/2026, olhando um PDF real):
 * abre com a devolutiva da avaliação final sob "<nome>, veja o que mudou em
 * você"; logo depois as competências em destaque, com nível e "Avanço" (sem
 * "médio"), que são o indicador da régua de maturidade; o `insight_geral`, que
 * abria o documento, fecha como "Mensagem final".
 *
 * Lê o texto da ÁRVORE que o componente monta, na ordem em que vai para o papel,
 * sem renderizar: o render baixa a fonte da CDN, e teste de unidade não depende
 * de rede.
 */
describe('ordem do PDF da temporada', () => {
  const dados = {
    colab: { nome: 'Pessoa Teste', cargo: 'Gestão Escolar' },
    trilha: { competencia: 'Planejamento + Autocuidado', numeroTemporada: 1, totalSemanas: 9 },
    evolutionReport: {
      insight_geral: 'TEXTO-DO-INSIGHT-GERAL',
      resumo: { confirmadas: 0, parciais: 2, estagnacoes: 1 },
      descritores: [
        { competencia: 'Planejamento', descritor: 'Organização do plano', nota_pre: 1.5, nota_pos: 2.7, convergencia: 'evolucao_parcial' },
        { competencia: 'Planejamento', descritor: 'Gestão de riscos', nota_pre: 1.9, nota_pos: 2.8, convergencia: 'evolucao_parcial' },
        { competencia: 'Autocuidado', descritor: 'Limites profissionais', nota_pre: 2.2, nota_pos: 2.1, convergencia: 'estagnacao' },
      ],
    },
    momentos: [],
    missoes: [{ semana: 4, modo: 'pratica', compromisso: 'COMPROMISSO', sintese: 'A colab conduziu o Conselho de Classe.' }],
    sem14: { resumo_avaliacao: { mensagem_geral: 'TEXTO-DA-DEVOLUTIVA' } },
  };
  const marca = { logoBase64: null, mostrarVertho: true } as any;
  const texto = () => textos(TemporadaConcluidaPDF({ dados, marca })).join('\n');

  it('devolutiva, competências em destaque, descritores e, por último, a mensagem final', () => {
    const t = texto();
    const ordem = ['veja o que mudou em você', 'TEXTO-DA-DEVOLUTIVA', 'Suas competências', 'Avanço',
      'Comportamentos observáveis', 'Mensagem final', 'TEXTO-DO-INSIGHT-GERAL'];
    const posicoes = ordem.map((trecho) => t.indexOf(trecho));
    for (const [i, p] of posicoes.entries()) expect(p, `"${ordem[i]}" não está no PDF`).toBeGreaterThanOrEqual(0);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it('o destaque traz nível e avanço de cada competência, e o parabéns aparece uma vez só', () => {
    const t = texto();
    expect(t).toContain('Nível 1\nNível 2'); // Planejamento: média 1,70 → 2,75
    expect(t).toContain('+1,1');              // (1,2 + 0,9) / 2 → 1,05 → 1,1
    expect(t.split('Parabéns! Você melhorou seu nível nesta competência')).toHaveLength(2);
    expect(t).not.toMatch(/médio/i);
    // a devolutiva saiu do fim do documento: sem a seção antiga
    expect(t).not.toContain('Avaliação final');
    expect(t).not.toContain('Devolutiva');
  });

  /**
   * Revisão de 17/09/2026: dizer de qual competência é o resultado, de onde a
   * pessoa partiu e aonde chegou "de 4 níveis possíveis"; o que é cada quadro e
   * o que o número mede; o que é cada contador, sem desvalorizar a parcial; e
   * "colaborador(a)" por extenso. Os textos são os MESMOS da tela (pt-BR).
   */
  it('explica nível, avanço e os três contadores com os textos da tela', () => {
    const t = texto();
    const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')).SeasonDone;
    expect(t).toContain('Em Planejamento, você estava no Nível 1 e avançou para o Nível 2, de 4 níveis possíveis.');
    // Cada grupo de comportamentos diz de qual competência é (dono, 17/09/2026).
    expect(t).toContain('Competência: Planejamento');
    expect(t).toContain('Competência: Autocuidado');
    // Quem não subiu "se manteve" no nível (dono, 17/09/2026), não "está".
    expect(t).toContain('Em Autocuidado, você se manteve no Nível 2, de 4 níveis possíveis.');
    for (const chave of ['competenciesIntro', 'behaviorsIntro']) expect(t).toContain(pt[chave]);
    for (const chave of ['confirmed', 'partial', 'stable']) expect(t).toContain(pt.legend[chave]);
    expect(t).toContain('Dos 3 comportamentos observados nesta temporada:');
    // a régua de 4 níveis inteira aparece em cada competência
    expect(t.split('Nível 4')).toHaveLength(3);
  });

  it('cada contador tem um texto BREVE, sem detalhar a régua (dono, 17/09/2026)', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const { legend } = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8')).SeasonDone;
      for (const texto of Object.values(legend) as string[]) {
        expect(texto.length, `${loc}: "${texto}"`).toBeLessThanOrEqual(30);
        expect(texto).not.toMatch(/apenas|só um pouco|insuficiente|fraca|piora|conversa/i);
      }
      expect(legend.confirmed).toMatch(/0[,.]5/);
    }
  });

  it('🔴 o código da matriz NUNCA aparece no PDF (dono, 17/09/2026)', () => {
    const comCodigo = {
      ...dados,
      momentos: [{ semana: 2, descritor: 'COO03_D6 — Busca de apoio', insight: 'INSIGHT' }],
      evolutionReport: {
        ...dados.evolutionReport,
        descritores: [
          { competencia: 'Autocuidado', descritor: 'COO03_D1 — Consciência de limites', nota_pre: 1.3, nota_pos: 3.0, convergencia: 'evolucao_confirmada' },
          ...dados.evolutionReport.descritores,
        ],
      },
    };
    const t = textos(TemporadaConcluidaPDF({ dados: comCodigo, marca })).join('\n');
    expect(t).toContain('Consciência de limites');
    expect(t).toContain('Busca de apoio');
    expect(t).not.toMatch(/[A-Z]{2,5}\d{1,3}_[A-Z]\d+/);
  });

  it('síntese com "colab" sai por extenso, e o rodapé é Vertho.ai', () => {
    const t = texto();
    expect(t).toContain('O(a) colaborador(a) conduziu o Conselho de Classe.');
    expect(t).not.toMatch(/colab(?![\p{L}])/u);
    expect(t).toContain('Vertho.ai');
    expect(t).not.toContain('Vertho Mentor IA');
  });
});

/**
 * A TELA segue a mesma ordem do PDF (dono, 16/09/2026: "espelhar"). Renderiza o
 * componente real com as traduções reais, sem sessão, e confere a ordem no HTML.
 */
describe('ordem da tela Temporada Concluída', () => {
  const dadosTela = {
    colab: { nome: 'Pessoa Teste' },
    trilha: { competencia: 'Planejamento + Autocuidado', numeroTemporada: 1, totalSemanas: 9 },
    evolutionReport: {
      insight_geral: 'TEXTO-DO-INSIGHT-GERAL',
      resumo: { confirmadas: 0, parciais: 2, estagnacoes: 1 },
      descritores: [
        { competencia: 'Planejamento', descritor: 'Organização do plano', nota_pre: 1.5, nota_pos: 2.7, convergencia: 'evolucao_parcial' },
        { competencia: 'Planejamento', descritor: 'Gestão de riscos', nota_pre: 1.9, nota_pos: 2.8, convergencia: 'evolucao_parcial' },
        { competencia: 'Autocuidado', descritor: 'Limites profissionais', nota_pre: 2.2, nota_pos: 2.1, convergencia: 'estagnacao' },
      ],
    },
    momentos: [],
    missoes: [],
    sem14: { cenario: 'CENARIO', resposta: 'RESPOSTA', resumo_avaliacao: { mensagem_geral: 'TEXTO-DA-DEVOLUTIVA' } },
  };

  function textoDaTela(locale: string) {
    return htmlDaTela(locale, dadosTela).replace(/<[^>]+>/g, '\n').replace(/&gt;/g, '>').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  }

  it('devolutiva, competências em destaque, descritores e, por último, a mensagem final', () => {
    const t = textoDaTela('pt-BR');
    const ordem = ['Pessoa, veja o que mudou em você', '9 semanas dedicadas a', 'TEXTO-DA-DEVOLUTIVA',
      'Suas competências', 'Avanço', 'Comportamentos observáveis', 'Confirmadas', 'Mensagem final', 'TEXTO-DO-INSIGHT-GERAL'];
    const posicoes = ordem.map((trecho) => t.indexOf(trecho));
    for (const [i, p] of posicoes.entries()) expect(p, `"${ordem[i]}" não está na tela`).toBeGreaterThanOrEqual(0);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    expect(t).not.toMatch(/médio/i);
    expect(t).not.toContain('14 semanas');
    expect(t.split('Parabéns! Você melhorou seu nível nesta competência')).toHaveLength(2);
    // a devolutiva aparece uma vez só: saiu do card do cenário
    expect(t.split('TEXTO-DA-DEVOLUTIVA')).toHaveLength(2);
  });

  it('explica nível, avanço e contadores com os mesmos textos do PDF, e a vírgula decimal', () => {
    const t = textoDaTela('pt-BR');
    const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')).SeasonDone;
    expect(t).toContain('Em Planejamento, você estava no Nível 1 e avançou para o Nível 2, de 4 níveis possíveis.');
    for (const chave of ['competenciesIntro', 'behaviorsIntro']) expect(t).toContain(pt[chave]);
    for (const chave of ['confirmed', 'partial', 'stable']) expect(t).toContain(pt.legend[chave]);
    expect(t).toContain('Competência: Planejamento');
    expect(t).toContain('+1,1');
    expect(t).not.toContain('+1.1');
    // e no quadro de cada comportamento, não só no destaque da competência
    expect(t).toContain('+1,2');
    expect(t).not.toContain('+1.2');
    expect(textoDaTela('en-US')).toContain('+1.1');
  });

  it('🔴 o código da matriz NUNCA aparece na tela', () => {
    const comCodigo = {
      ...dadosTela,
      momentos: [{ semana: 2, descritor: 'COO03_D6 — Busca de apoio', insight: 'INSIGHT' }],
      evolutionReport: {
        ...dadosTela.evolutionReport,
        descritores: [
          { competencia: 'Autocuidado', descritor: 'COO03_D1 — Consciência de limites', nota_pre: 1.3, nota_pos: 3.0, convergencia: 'evolucao_confirmada' },
          ...dadosTela.evolutionReport.descritores,
        ],
      },
    };
    const html = htmlDaTela('pt-BR', comCodigo);
    expect(html).toContain('Consciência de limites');
    expect(html).not.toMatch(/[A-Z]{2,5}\d{1,3}_[A-Z]\d+/);
  });

  it('uma competência no singular, nos 4 idiomas', () => {
    const uma = { ...dadosTela, evolutionReport: { ...dadosTela.evolutionReport, descritores: dadosTela.evolutionReport.descritores.slice(0, 2) } };
    const esperado: Record<string, string> = { 'pt-BR': 'Sua competência', 'pt-PT': 'A sua competência', 'en-US': 'Your competency', 'es-ES': 'Tu competencia' };
    for (const [loc, titulo] of Object.entries(esperado)) {
      expect(htmlDaTela(loc, uma), loc).toContain(`>${titulo}<`);
    }
  });
});

/**
 * 🔴 RELATO SEM BASE NA CONVERSA NÃO VAI PARA O DOCUMENTO DA PESSOA
 * (dono, 17/09/2026).
 *
 * Os dados são o caso real que o dono abriu: "Rituais formativos", do relatório
 * de 16/09 em Ibipeba. O avanço de +0,3 vem do cenário do fechamento; o
 * "Antes/Depois" vem da conversa da semana anterior, e ali o extrator tinha
 * escrito "Não abordado na conversa" nos dois campos. O card afirmava um avanço
 * e, na linha seguinte, que não houve conversa sobre ele.
 *
 * O veredito NÃO muda (é só pelo avanço desde 17/09) e o texto continua gravado
 * no `evolution_report` — some do papel e da tela da pessoa, não da auditoria.
 */
describe('Antes/Depois só quando a conversa sustenta', () => {
  const COMPETENCIA = 'Colaboração docente e cultura formativa';
  const BASE_FRACA = {
    competencia: COMPETENCIA, descritor: 'Rituais formativos',
    nota_pre: 1.5, nota_pos: 1.8, convergencia: 'evolucao_parcial',
    forca_evidencia: 'fraca',
    antes: 'Não abordado na conversa', depois: 'Não abordado na conversa',
  };
  const COM_BASE = {
    competencia: COMPETENCIA, descritor: 'Segurança para aprender',
    nota_pre: 2.0, nota_pos: 2.8, convergencia: 'evolucao_parcial',
    forca_evidencia: 'moderada',
    antes: 'ANTES-COM-BASE', depois: 'DEPOIS-COM-BASE',
  };
  // Sem o campo: relatório anterior ao carimbo de 03/09 e os fixtures das demos.
  const SEM_CARIMBO = {
    competencia: COMPETENCIA, descritor: 'Troca de práticas',
    nota_pre: 2.0, nota_pos: 2.4, convergencia: 'evolucao_parcial',
    antes: 'ANTES-DE-FIXTURE', depois: 'DEPOIS-DE-FIXTURE',
  };

  const dados = {
    colab: { nome: 'Pessoa Teste', cargo: 'Coordenação Pedagógica' },
    trilha: { competencia: COMPETENCIA, numeroTemporada: 1, totalSemanas: 7 },
    evolutionReport: {
      resumo: { confirmadas: 0, parciais: 3, estagnacoes: 0 },
      descritores: [BASE_FRACA, COM_BASE, SEM_CARIMBO],
    },
    momentos: [],
    missoes: [],
    sem14: { resumo_avaliacao: { mensagem_geral: 'TEXTO-DA-DEVOLUTIVA' } },
  };
  const noPdf = () => textos(TemporadaConcluidaPDF({ dados, marca: { logoBase64: null, mostrarVertho: true } as any })).join('\n');

  it('o PDF esconde o relato de base fraca, e o card continua com o avanço do cenário', () => {
    const t = noPdf();
    expect(t).toContain('Rituais formativos');
    expect(t).toContain('+0,3');
    expect(t).not.toContain('Não abordado na conversa');
  });

  it('o descritor que a conversa TOCOU mantém os dois campos', () => {
    const t = noPdf();
    expect(t).toContain('ANTES-COM-BASE');
    expect(t).toContain('DEPOIS-COM-BASE');
  });

  it('força ausente não é força fraca: relatório antigo e demo seguem com o relato', () => {
    const t = noPdf();
    expect(t).toContain('ANTES-DE-FIXTURE');
    expect(t).toContain('DEPOIS-DE-FIXTURE');
  });

  it('a tela da pessoa segue a mesma régua do papel', () => {
    const html = htmlDaTela('pt-BR', { ...dados, colab: { nome: 'Pessoa Teste' } });
    expect(html).toContain('Rituais formativos');
    expect(html).not.toContain('Não abordado na conversa');
    expect(html).toContain('DEPOIS-COM-BASE');
    expect(html).toContain('DEPOIS-DE-FIXTURE');
  });
});
