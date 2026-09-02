/**
 * A vitrine de capacitações alterna formatos em vez de despejar um lote.
 *
 * `Medido: 02/09/2026` — o conteúdo é gerado em lote POR FORMATO e a ordenação
 * da consulta é por tipo e data. O efeito é que a home abria com seis áudios
 * seguidos, não porque só houvesse áudio, mas porque o áudio foi o último lote
 * a rodar. Quem olha conclui que a plataforma só tem áudio.
 *
 * O que este guard protege é a propriedade, não a ordem exata: nenhum formato
 * ocupa a vitrine inteira, e a ordem DENTRO de cada formato é preservada (é ela
 * que carrega "core antes de complementar, mais recente antes").
 */
import { describe, it, expect } from 'vitest';
import { intercalarPorFormato } from '@/lib/home/loaders';

const item = (formato: string, id: number) => ({ formato, id });

describe('intercalarPorFormato', () => {
  it('alterna os formatos em vez de agrupar por lote', () => {
    const entrada = [
      item('audio', 1), item('audio', 2), item('audio', 3),
      item('texto', 4), item('texto', 5),
      item('case', 6),
    ];
    const saida = intercalarPorFormato(entrada);
    expect(saida.slice(0, 3).map((i) => i.formato)).toEqual(['audio', 'texto', 'case']);
    // Nada se perde nem se duplica.
    expect(saida.map((i) => i.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('preserva a ordem dentro de cada formato', () => {
    const entrada = [
      item('audio', 1), item('audio', 2), item('audio', 3),
      item('texto', 10), item('texto', 11),
    ];
    const saida = intercalarPorFormato(entrada);
    const audios = saida.filter((i) => i.formato === 'audio').map((i) => i.id);
    const textos = saida.filter((i) => i.formato === 'texto').map((i) => i.id);
    expect(audios).toEqual([1, 2, 3]);
    expect(textos).toEqual([10, 11]);
  });

  it('devolve a lista intacta quando só há um formato', () => {
    // Intercalar uma fila só é trabalho à toa, e reordenar aqui bagunçaria a
    // relevância que a consulta já resolveu.
    const entrada = [item('audio', 1), item('audio', 2)];
    expect(intercalarPorFormato(entrada)).toEqual(entrada);
  });

  it('trata formato ausente como uma fila própria, sem perder o item', () => {
    const entrada = [
      { id: 1 } as any, { id: 2 } as any,
      item('texto', 3),
    ];
    const saida = intercalarPorFormato(entrada);
    expect(saida).toHaveLength(3);
    expect(saida.map((i: any) => i.id).sort()).toEqual([1, 2, 3]);
  });
});
