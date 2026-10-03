/**
 * A tela e o PDF do Mapeamento de liderança (revisão de 02/10/2026):
 *
 * - R-39: nível em vez de média decimal; nome "Mapeamento de liderança" no
 *   PDF; erro legível, sem código interno; "Não agora" sem vermelho; a tela
 *   nos quatro idiomas.
 * - R-134: entre aspas só o trecho que confere com a resposta; o resto aparece
 *   como leitura da IA.
 * - R-142: parecer que falhou não fica no cache; há "Tentar de novo".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { ParecerPessoa, mensagemDeErro, mensagemDoParecer, precisaBuscarParecer } from '@/components/prontidao-lideranca-view';
import { parecerParaCliente } from '@/lib/prontidao-lideranca/cliente';
import type { Parecer } from '@/lib/prontidao-lideranca/agregar';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const MENSAGENS: Record<string, any> = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]),
);
const tradutor = (locale = 'pt-BR') =>
  createTranslator({ locale, messages: MENSAGENS[locale], namespace: 'MapeamentoLideranca' }) as any;
const render = (filho: any, locale = 'pt-BR') =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: MENSAGENS[locale], timeZone: 'America/Sao_Paulo', children: filho }));

const parecerAdmin = (): Parecer => ({
  calculadoEm: '2026-10-03T12:00:00Z', cargoAlvo: 'Gerente', corte: 3,
  linha: {
    colaboradorId: 'id-ana', nome: 'Ana Souza', cargo: 'Vendedora', quadrante: 'nao_agora', auditoriaPendente: false,
    frasesGap: ['Delegação: média 2,45 (corte 3,00)'],
    posicao: {
      colaboradorId: 'id-ana', total: 2, cobertas: 2, completo: true, faltantes: [], mediaGeral: 2.67, nivelGeral: 2,
      posicao: 'nao_demonstra', gaps: ['Delegação'], parciais: [],
      competencias: [
        { competencia: 'Priorização', media: 2.89, nivel: 2, descritores: 6, parcial: false, posicao: 'nao_demonstra', gap: true },
        { competencia: 'Delegação', media: 2.45, nivel: 2, descritores: 6, parcial: false, posicao: 'nao_demonstra', gap: true },
      ],
    },
    estilo: { colaboradorId: 'id-ana', nome: 'Ana Souza', aderenciaPct: 61.27, estilo: 'distante', status: 'abaixo_do_corte' as any, statusLabel: '', bloqueadoNoAlvo: false, motivosBloqueio: [], lacunas: [], borderline: false },
  },
  evidencias: [{
    respostaId: 'r', competenciaId: 'c', competencia: 'Priorização', auditoria: 'aprovado', avaliadoEm: null, feedback: null,
    descritores: [{
      descritor: 'Foco no que move o número', nota: 2.89, nivel: 2, nivelSugerido: 2, confianca: 0.8, sustentacao: 'forte', racional: null, limites: [],
      evidencias: [
        { resposta: 'R1', trecho: 'listei as três contas do trimestre', forca: 'forte', literal: true },
        { resposta: 'R2', trecho: 'prioriza pelo impacto no resultado', forca: 'moderada', literal: false },
      ],
    }],
  }],
});

describe('Mapeamento de liderança: a tela do RH', () => {
  it('R-39: o parecer do cliente mostra nível, sem nota decimal e sem corte', () => {
    const html = render(createElement(ParecerPessoa, { p: parecerParaCliente(parecerAdmin()), metaNivel: 3 }));
    // Só o texto visível: as classes do Tailwind têm números como `[0.08]`.
    const texto = html.replace(/<[^>]+>/g, ' ');
    expect(html).toContain('Nível geral 2');
    expect(html).toContain('meta: Nível 3');
    expect(html).toContain('Abaixo da meta');
    expect(html).toContain('Delegação: Nível 2, abaixo da meta');
    // Nenhuma nota decimal (2,67 / 2,89 / 2,45 / 3,00) nem a aderência com casa decimal.
    expect(texto).not.toMatch(/\d,\d{2}|\d\.\d{2}|61,3|61\.27/);
    expect(texto).not.toMatch(/corte|média/i);
  });

  it('o admin da Vertho vê a nota ao lado do nível', () => {
    const p = { ...parecerAdmin(), exibeNota: true };
    const html = render(createElement(ParecerPessoa, { p, metaNivel: 3, exibeNota: true }));
    expect(html).toContain('2,67');
    expect(html).toContain('Nível geral 2');
  });

  it('R-134: só o trecho conferido vai entre aspas; o resto é leitura da IA, sem aspas', () => {
    const html = render(createElement(ParecerPessoa, { p: parecerParaCliente(parecerAdmin()), metaNivel: 3 }));
    expect(html).toContain('“listei as três contas do trimestre”');
    expect(html).not.toContain('“prioriza pelo impacto no resultado”');
    expect(html).toMatch(/Leitura da IA:<\/span> prioriza pelo impacto no resultado/);
  });

  it('a tela fala os quatro idiomas', () => {
    for (const locale of LOCALES) {
      const ns = MENSAGENS[locale].MapeamentoLideranca;
      expect(ns, locale).toBeTruthy();
      const html = render(createElement(ParecerPessoa, { p: parecerParaCliente(parecerAdmin()), metaNivel: 3 }), locale);
      expect(html, locale).toContain(tradutor(locale)('nivelGeral', { n: 2 }));
      expect(html, locale).toContain(ns.quadrante.nao_agora);
      expect(html, locale).toContain(ns.recomendacao.nao_agora);
    }
  });

  it('erro legível: o código interno nunca aparece, e código desconhecido vira a frase genérica', () => {
    for (const locale of LOCALES) {
      const t = tradutor(locale);
      const frase = mensagemDeErro({ code: 'PROGRAMA_NAO_CONFIGURADO' }, t);
      expect(frase, locale).toBe(MENSAGENS[locale].MapeamentoLideranca.erros.PROGRAMA_NAO_CONFIGURADO);
      expect(frase).not.toContain('PROGRAMA_NAO_CONFIGURADO');
      expect(mensagemDeErro({ code: 'ERRO_LEITURA' }, t)).toBe(MENSAGENS[locale].MapeamentoLideranca.erros.generico);
      expect(mensagemDeErro({}, t)).toBe(MENSAGENS[locale].MapeamentoLideranca.erros.generico);
    }
    const t = tradutor();
    expect(mensagemDoParecer({ success: false, code: 'PARECER_INDISPONIVEL', motivo: 'incompleto', faltantes: ['Delegação'] }, t))
      .toBe('Mapeamento incompleto: faltam Delegação.');
    expect(mensagemDoParecer({ success: false, code: 'PARECER_INDISPONIVEL', motivo: 'sem_estilo', detalhe: 'sem_perfil' }, t))
      .toBe('Sem o eixo de estilo: sem perfil comportamental.');
    // A tela não desenha o código em lugar nenhum.
    const fonte = readFileSync('components/prontidao-lideranca-view.tsx', 'utf8');
    expect(fonte).not.toMatch(/\{code\}|font-mono/);
    expect(fonte).not.toMatch(/simulador de liderança/i);
  });

  it('R-39: "Não agora" não é vermelho, na tela e no PDF', () => {
    const tela = readFileSync('components/prontidao-lideranca-view.tsx', 'utf8');
    expect(tela).toMatch(/nao_agora: \{ cor: '#B4A5F0'/);
    const pdf = readFileSync('lib/prontidao-lideranca/parecer-pdf.tsx', 'utf8');
    expect(pdf).toMatch(/nao_agora: \{ cor: T\.lilas/);
  });

  it('R-142: só o parecer montado entra no cache; o erro tem "Tentar de novo"', () => {
    expect(precisaBuscarParecer({}, 'a')).toBe(true);
    expect(precisaBuscarParecer({ a: { linha: {} } }, 'a')).toBe(false);
    const fonte = readFileSync('components/prontidao-lideranca-view.tsx', 'utf8');
    // O erro mora num mapa à parte, e o cache só recebe `r.data`.
    expect(fonte).toMatch(/if \(r\.success\) setPareceres\(\(prev\) => \(\{ \.\.\.prev, \[id\]: r\.data \}\)\);/);
    expect(fonte).not.toMatch(/setPareceres\([^)]*erro/);
    expect(fonte).toMatch(/onClick=\{\(\) => buscarParecer\(l\.colaboradorId\)\}[\s\S]{0,300}t\('tentarDeNovo'\)/);
  });
});

/** O código do PDF sem os comentários: o nome antigo pode aparecer na explicação. */
function codigoSemComentarios(arquivo: string) {
  return readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('Mapeamento de liderança: o PDF', () => {
  it('R-39: chama-se Mapeamento de liderança e não imprime média, nota nem corte decimal', () => {
    const pdf = codigoSemComentarios('lib/prontidao-lideranca/parecer-pdf.tsx');
    expect(pdf).not.toMatch(/Simulador de liderança|simulador de liderança/);
    expect(pdf.match(/Mapeamento de liderança/g)?.length).toBeGreaterThanOrEqual(4);
    // Nenhum formatador de nota e nenhuma leitura do número decimal.
    // `d.nota` só entra para virar nível (`nivelDaNota`), nunca impressa.
    expect(pdf).not.toMatch(/fmtNota|mediaGeral|c\.media\b|\{d\.nota\}|toFixed\(2\)|frasesGap/);
    expect(pdf).toMatch(/fmtNivel\(l\.posicao\.nivelGeral\)/);
  });

  it('R-134: só o trecho literal vai entre aspas no PDF', () => {
    const pdf = codigoSemComentarios('lib/prontidao-lideranca/parecer-pdf.tsx');
    expect(pdf).toMatch(/e\.literal\s*\?[\s\S]{0,120}“\{e\.trecho\}”[\s\S]{0,200}Leitura da IA/);
    expect(pdf).not.toMatch(/O que sustenta cada nota/);
  });
});
