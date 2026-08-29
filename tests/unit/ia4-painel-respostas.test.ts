import { describe, expect, it } from 'vitest';
import { contarStats, filtrarRespostas, notaBanda, temFiltro } from '@/lib/ia4-painel-respostas';
import { selecionarParaReavaliar } from '@/lib/ia4-fila-reavaliacao';

/**
 * O bug de 29/08/2026: a lista mostrava o conjunto FILTRADO e os chips do topo
 * contavam `respostas` inteira. Com "Professor(a)" selecionado, o cabeçalho
 * continuava dizendo "Total: 115 · Avaliadas: 115" — o número da empresa
 * ocupando o lugar do número do recorte, sem nada na tela denunciando.
 *
 * O que estes testes travam: contagem, lista e fila do lote saem do MESMO
 * conjunto. Validado por mutação — trocar `filtrarRespostas(...)` por
 * `respostas` em qualquer um dos três derruba pelo menos um `it` daqui.
 */

const AMOSTRA = [
  // Professores
  { id: 'p1', colaborador_nome: 'Dayse', colaborador_cargo: 'Professor(a)', avaliacao_ia: { x: 1 }, status_ia4: 'aprovado', payload_ia4: { nota: 92 } },
  { id: 'p2', colaborador_nome: 'Ana', colaborador_cargo: 'Professor(a)', avaliacao_ia: { x: 1 }, status_ia4: 'aprovado_com_ajustes', payload_ia4: { nota: 85 } },
  { id: 'p3', colaborador_nome: 'Bia', colaborador_cargo: 'Professor(a)', avaliacao_ia: { x: 1 }, status_ia4: 'revisar', payload_ia4: { nota: 58 } },
  { id: 'p4', colaborador_nome: 'Cida', colaborador_cargo: 'Professor(a)', avaliacao_ia: null, status_ia4: null, payload_ia4: null },
  // Diretores
  { id: 'd1', colaborador_nome: 'Sônia', colaborador_cargo: 'Diretor(a) Escolar', avaliacao_ia: { x: 1 }, status_ia4: 'aprovado', payload_ia4: { nota: 95 } },
  { id: 'd2', colaborador_nome: 'Dolores', colaborador_cargo: 'Diretor(a) Escolar', avaliacao_ia: { x: 1 }, status_ia4: 'revisar', payload_ia4: { nota: 44 } },
];

describe('painel IA4 — os chips contam o que está na tela', () => {
  it('sem filtro, conta o conjunto inteiro', () => {
    const visiveis = filtrarRespostas(AMOSTRA, {});
    expect(contarStats(visiveis)).toEqual({
      total: 6, avaliadas: 5, aprovadas: 2, com_ajustes: 1, revisar: 2, pendentes: 1,
    });
  });

  it('filtrado por cargo, TODO número cai para o do recorte', () => {
    const visiveis = filtrarRespostas(AMOSTRA, { cargo: 'Professor(a)' });
    const stats = contarStats(visiveis);
    // Era aqui que a tela mentia: `total` e `avaliadas` seguiam 6 e 5.
    expect(stats).toEqual({
      total: 4, avaliadas: 3, aprovadas: 1, com_ajustes: 1, revisar: 1, pendentes: 1,
    });
    // E o que se conta é exatamente o que se lista.
    expect(stats.total).toBe(visiveis.length);
  });

  it('filtro por status e por banda de nota também recortam a contagem', () => {
    expect(contarStats(filtrarRespostas(AMOSTRA, { status: 'revisar' })).total).toBe(2);
    expect(contarStats(filtrarRespostas(AMOSTRA, { status: 'pendente' })).pendentes).toBe(1);
    expect(contarStats(filtrarRespostas(AMOSTRA, { nota: 'alto' })).total).toBe(2);
    expect(contarStats(filtrarRespostas(AMOSTRA, { nota: 'baixo' })).total).toBe(2);
    expect(contarStats(filtrarRespostas(AMOSTRA, { nota: 'sem' })).total).toBe(1);
  });

  it('filtros se combinam (cargo + status)', () => {
    const visiveis = filtrarRespostas(AMOSTRA, { cargo: 'Professor(a)', status: 'revisar' });
    expect(visiveis.map(r => r.id)).toEqual(['p3']);
  });

  it('o total geral continua disponível para o "de N" ao lado', () => {
    // A tela mostra os dois: o do recorte em destaque, o geral apagado.
    expect(contarStats(AMOSTRA).total).toBe(6);
    expect(contarStats(filtrarRespostas(AMOSTRA, { cargo: 'Professor(a)' })).total).toBe(4);
  });

  it('temFiltro só é verdadeiro quando algo foi escolhido', () => {
    expect(temFiltro({})).toBe(false);
    expect(temFiltro({ colab: '', cargo: '', status: '', nota: '' })).toBe(false);
    expect(temFiltro({ cargo: 'Professor(a)' })).toBe(true);
    expect(temFiltro({ nota: 'sem' })).toBe(true);
  });

  it('notaBanda aceita o payload como string (é assim que vem do banco)', () => {
    expect(notaBanda({ payload_ia4: JSON.stringify({ nota: 91 }) })).toBe('alto');
    expect(notaBanda({ payload_ia4: '{json quebrado' })).toBe('sem');
    expect(notaBanda({ payload_ia4: null })).toBe('sem');
  });
});

describe('painel IA4 — a fila do lote respeita o filtro', () => {
  it('"Re-avaliar todos" não alcança quem o filtro tirou da tela', () => {
    const visiveis = filtrarRespostas(AMOSTRA, { cargo: 'Professor(a)' });
    const fila = selecionarParaReavaliar(visiveis as any);
    // p2 (85 pts) está acima do piso; sobra p3. A diretora d2 (44 pts, revisar)
    // seria elegível — e era ela que o botão pegava junto, pagando IA e
    // reescrevendo a avaliação de quem não estava na tela.
    expect(fila.elegiveis.map((r: any) => r.id)).toEqual(['p3']);

    const filaSemFiltro = selecionarParaReavaliar(AMOSTRA as any);
    expect(filaSemFiltro.elegiveis.map((r: any) => r.id)).toEqual(['d2', 'p3']);
  });

  it('sem filtro, a fila é a de antes (nenhuma regressão para o uso normal)', () => {
    const visiveis = filtrarRespostas(AMOSTRA, {});
    expect(selecionarParaReavaliar(visiveis as any).elegiveis.map((r: any) => r.id))
      .toEqual(selecionarParaReavaliar(AMOSTRA as any).elegiveis.map((r: any) => r.id));
  });
});
