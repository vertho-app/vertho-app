import { describe, it, expect } from 'vitest';
import { topDoisFormatos, formatosDaCelula, temPreferenciaDoKit } from '@/lib/season-engine/kit/formatos-por-preferencia';

/**
 * O kit leva só os 2 primeiros formatos da tela de preferências, entre os 4 que ele produz, em UNIÃO por célula.
 * Quem não declarou nada (ou só marcou infográfico, simulador e mentoria) recebe texto + estudo de caso.
 */
const pessoa = (p: Record<string, number>) => ({ pref_video_curto: 0, pref_video_longo: 0, pref_texto: 0, pref_audio: 0, pref_estudo_caso: 0, ...p });

describe('topDoisFormatos', () => {
  it('pega os dois maiores entre vídeo, áudio, texto e caso', () => {
    expect(topDoisFormatos(pessoa({ pref_audio: 7, pref_video_curto: 6, pref_texto: 3, pref_estudo_caso: 1 }))).toEqual(['audio', 'video']);
    expect(topDoisFormatos(pessoa({ pref_estudo_caso: 7, pref_texto: 5, pref_audio: 2 }))).toEqual(['case', 'texto']);
  });
  it('infográfico, simulador e mentoria NÃO competem: ordenar só eles = sem preferência do kit', () => {
    const c = { ...pessoa({}), pref_infografico: 7, pref_exercicio: 6, pref_mentor: 5 };
    expect(temPreferenciaDoKit(c)).toBe(false);
    expect(topDoisFormatos(c)).toBeNull();
  });
  it('o 1º lugar fora do kit não ocupa vaga: sobram os dois melhores DENTRO do kit', () => {
    const c = { ...pessoa({ pref_audio: 5, pref_texto: 4, pref_estudo_caso: 3 }), pref_exercicio: 7 };
    expect(topDoisFormatos(c)).toEqual(['audio', 'texto']);
  });
  it('vídeo longo antigo conta (o motor lê o maior entre curto e longo)', () => {
    expect(topDoisFormatos(pessoa({ pref_video_longo: 5, pref_texto: 2, pref_audio: 1 }))).toEqual(['video', 'texto']);
  });
  it('estrelas com empate: desempate pela ordem fixa vídeo, texto, áudio, caso (a mesma da trilha)', () => {
    expect(topDoisFormatos(pessoa({ pref_video_curto: 4, pref_texto: 4, pref_audio: 4, pref_estudo_caso: 4 }))).toEqual(['video', 'texto']);
  });
  it('sem nada declarado: null', () => {
    expect(topDoisFormatos(pessoa({}))).toBeNull();
    expect(topDoisFormatos(null)).toBeNull();
  });
});

describe('formatosDaCelula (união por célula)', () => {
  it('une os 2 primeiros de cada pessoa; o vídeo vira flag, não formato de conteúdo', () => {
    const r = formatosDaCelula([
      pessoa({ pref_video_curto: 7, pref_audio: 6, pref_texto: 2 }),
      pessoa({ pref_texto: 7, pref_estudo_caso: 6 }),
    ]);
    expect(r).toEqual({ formatos: ['audio', 'texto', 'case'], video: true, semPreferencia: 0 });
  });
  it('ninguém pediu áudio nem vídeo: a célula não gera nenhum dos dois', () => {
    const r = formatosDaCelula([pessoa({ pref_texto: 7, pref_estudo_caso: 6 }), pessoa({ pref_estudo_caso: 7, pref_texto: 6 })]);
    expect(r).toEqual({ formatos: ['texto', 'case'], video: false, semPreferencia: 0 });
  });
  it('quem não respondeu entra com texto + caso, e é contado', () => {
    const r = formatosDaCelula([pessoa({ pref_audio: 7, pref_video_curto: 6 }), pessoa({})]);
    expect(r.formatos).toEqual(['audio', 'texto', 'case']);
    expect(r.semPreferencia).toBe(1);
  });
  it('todos sem resposta e célula vazia: texto + caso, sem vídeo', () => {
    expect(formatosDaCelula([pessoa({}), pessoa({})])).toMatchObject({ formatos: ['texto', 'case'], video: false, semPreferencia: 2 });
    expect(formatosDaCelula([])).toMatchObject({ formatos: ['texto', 'case'], video: false });
  });
  it('a ordem dos formatos é fixa (áudio, texto, caso), qualquer que seja a ordem das pessoas', () => {
    expect(formatosDaCelula([pessoa({ pref_estudo_caso: 7, pref_audio: 6 })]).formatos).toEqual(['audio', 'case']);
  });
});
