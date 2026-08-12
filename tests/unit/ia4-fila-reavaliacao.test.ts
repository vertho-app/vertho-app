import { describe, it, expect } from 'vitest';
import { selecionarParaReavaliar, resumoPuladas, PISO_REAVALIACAO } from '@/lib/ia4-fila-reavaliacao';

const r = (id: string, nota: number | null, opts: { revisada?: boolean; status?: string } = {}) => ({
  id,
  status_ia4: opts.status ?? 'revisar',
  payload_ia4: nota === null ? null : { nota },
  avaliacao_ia: opts.revisada ? { _revisao: { revisado_em: '2026-08-12T20:00:00Z' } } : {},
});

describe('selecionarParaReavaliar', () => {
  it('pega quem está mal e ordena do pior para o melhor', () => {
    const { elegiveis } = selecionarParaReavaliar([r('a', 60), r('b', 52), r('c', 58)]);
    expect(elegiveis.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('pula quem está ACIMA do piso — reavaliar ali piora (medido: −7,6)', () => {
    const { elegiveis, puladas } = selecionarParaReavaliar([r('bom', 78), r('ruim', 55)]);
    expect(elegiveis.map((e) => e.id)).toEqual(['ruim']);
    expect(puladas.acimaDoPiso).toBe(1);
    // fronteira: exatamente no piso ainda entra
    expect(selecionarParaReavaliar([r('x', PISO_REAVALIACAO)]).elegiveis).toHaveLength(1);
    expect(selecionarParaReavaliar([r('y', PISO_REAVALIACAO + 1)]).elegiveis).toHaveLength(0);
  });

  it('pula quem JÁ foi reavaliada', () => {
    const { elegiveis, puladas } = selecionarParaReavaliar([r('velha', 58, { revisada: true }), r('nova', 58)]);
    expect(elegiveis.map((e) => e.id)).toEqual(['nova']);
    expect(puladas.jaRevisada).toBe(1);
  });

  it('pula quem não tem check (sem feedback de auditoria não há o que revisar)', () => {
    const { elegiveis, puladas } = selecionarParaReavaliar([r('semcheck', null)]);
    expect(elegiveis).toHaveLength(0);
    expect(puladas.semCheck).toBe(1);
  });

  it('ignora quem já está aprovado', () => {
    expect(selecionarParaReavaliar([r('ok', 92, { status: 'aprovado' })]).elegiveis).toHaveLength(0);
  });

  it('as travas podem ser desligadas explicitamente', () => {
    const lista = [r('velha', 58, { revisada: true }), r('boa', 78)];
    const { elegiveis } = selecionarParaReavaliar(lista, { incluirJaRevisadas: true, ignorarPiso: true });
    expect(elegiveis).toHaveLength(2);
  });

  it('o que ficou de fora é ANUNCIÁVEL — filtro silencioso mente sobre a cobertura', () => {
    const { puladas } = selecionarParaReavaliar([r('a', 78), r('b', 58, { revisada: true }), r('c', null)]);
    expect(resumoPuladas(puladas)).toBe('1 já reavaliada(s) · 1 acima de 65 pts · 1 sem check');
    expect(resumoPuladas({ jaRevisada: 0, acimaDoPiso: 0, semCheck: 0 })).toBe('');
  });
});
