/**
 * R-57: o texto da devolutiva que a pessoa lê sai sem travessão em TODOS os
 * caminhos de leitura (tela do fechamento, relatório da temporada em tela e em
 * PDF, página de auditoria). O scorer fica fora do filtro do wrapper porque ecoa
 * o nome do descritor; a limpeza dele é aqui, na leitura, e vale para o que já
 * está gravado. O caractere só aparece como escape.
 */
import { describe, expect, it } from 'vitest';
import { fechoDoRelatorio, normalizarResumoAvaliacao } from '@/lib/season-engine/resumo-avaliacao';
import { textosDoRelatorio } from '@/lib/season-engine/relatorio-texto';
import { resumoDaAvaliacao } from '@/lib/season-engine/estado-fechamento';

const EM = '\u2014';
const TRAVESSAO = /[\u2013\u2014\u2015]/;

const resumo = () => ({
  mensagem_geral: `Você sustentou a decisão ${EM} e explicou o critério.`,
  principal_avanco: `Delegou ${EM} com prazo`,
  principal_ponto_de_atencao: `Pedir apoio ${EM} cedo`,
  evidencias_citadas: [`"eu disse ${EM} sem pensar"`],
  mensagem_final: `Leve isto ${EM} agora.`,
  proximos_passos: [`Ligar na segunda ${EM} com pauta`],
});

describe('leitura do resumo do fechamento', () => {
  it('normalizarResumoAvaliacao: os textos autorais saem limpos e a evidência citada fica como a pessoa disse', () => {
    const r = normalizarResumoAvaliacao(resumo())!;
    expect(r.mensagem).toBe('Você sustentou a decisão, e explicou o critério.');
    expect(r.avanco).toBe('Delegou, com prazo');
    expect(r.atencao).toBe('Pedir apoio, cedo');
    expect(r.mensagemFinal).toBe('Leve isto, agora.');
    expect(r.proximosPassos).toEqual(['Ligar na segunda, com pauta']);
    expect(r.evidencias).toEqual([`"eu disse ${EM} sem pensar"`]);
  });

  it('a forma antiga em string também sai limpa', () => {
    expect(normalizarResumoAvaliacao(`Texto antigo ${EM} sem objeto.`)!.mensagem).toBe('Texto antigo, sem objeto.');
  });

  it('fechoDoRelatorio: o fecho novo e o fallback antigo (insight_geral e proximo_passo) saem limpos', () => {
    const novo = fechoDoRelatorio({ resumo_avaliacao: resumo() });
    expect(novo.mensagemFinal).toBe('Leve isto, agora.');
    expect(novo.proximosPassos).toEqual(['Ligar na segunda, com pauta']);
    const antigo = fechoDoRelatorio({ insight_geral: `Síntese ${EM} antiga.`, proximo_passo: `Praticar ${EM} sempre.` });
    expect(antigo.mensagemFinal).toBe('Síntese, antiga.');
    expect(antigo.proximosPassos).toEqual(['Praticar, sempre.']);
  });

  it('resumoDaAvaliacao (a tela ao concluir) entrega o resumo limpo e não mexe nas notas', () => {
    const r = resumoDaAvaliacao({ nota_media_pre: 2, nota_media_pos: 3, delta_medio: 1, resumo_avaliacao: resumo(), spec_version: 'v1' });
    expect(r.resumo_avaliacao.mensagem_geral).toBe('Você sustentou a decisão, e explicou o critério.');
    expect(r.resumo_avaliacao.evidencias_citadas).toEqual([`"eu disse ${EM} sem pensar"`]);
    expect([r.nota_media_pre, r.nota_media_pos, r.delta_medio, r.spec_version]).toEqual([2, 3, 1, 'v1']);
  });
});

describe('textosDoRelatorio (relatório da temporada em tela e em PDF)', () => {
  const dados = () => ({
    evolutionReport: {
      insight_geral: `Insight ${EM} geral`,
      proximo_passo: `Passo ${EM} único`,
      resumo_avaliacao: resumo(),
      descritores: [{ descritor: 'Escuta ativa', antes: `Antes ${EM} de começar`, depois: `Depois ${EM} de concluir` }],
    },
    momentos: [{ descritor: 'Escuta ativa', insight: `Percebeu ${EM} cedo` }],
    missoes: [{ compromisso: `Fazer ${EM} já`, sintese: `Cumpriu ${EM} bem` }],
    sem14: { resumo_avaliacao: resumo() },
  });

  it('nenhum texto que a pessoa lê sai com travessão', () => {
    const lido = textosDoRelatorio(dados());
    const er = lido.evolutionReport;
    const textos = [
      er.insight_geral, er.proximo_passo, er.resumo_avaliacao.mensagem_geral, er.resumo_avaliacao.principal_avanco,
      er.resumo_avaliacao.principal_ponto_de_atencao, er.resumo_avaliacao.mensagem_final, ...er.resumo_avaliacao.proximos_passos,
      er.descritores[0].antes, er.descritores[0].depois, lido.momentos[0].insight, lido.missoes[0].compromisso, lido.missoes[0].sintese,
      lido.sem14.resumo_avaliacao.mensagem_geral, lido.sem14.resumo_avaliacao.principal_avanco,
    ];
    for (const t of textos) expect(t).not.toMatch(TRAVESSAO);
    expect(er.insight_geral).toBe('Insight, geral');
    expect(er.resumo_avaliacao.principal_avanco).toBe('Delegou, com prazo');
  });

  it('a evidência citada segue como a pessoa escreveu', () => {
    expect(textosDoRelatorio(dados()).evolutionReport.resumo_avaliacao.evidencias_citadas).toEqual([`"eu disse ${EM} sem pensar"`]);
  });

  it('o código da matriz colado ao travessão continua saindo do texto antes da pontuação', () => {
    const d = dados();
    d.evolutionReport.insight_geral = `COO03_D5 ${EM} Busca de apoio foi o avanço.`;
    expect(textosDoRelatorio(d).evolutionReport.insight_geral).toBe('Busca de apoio foi o avanço.');
  });
});
