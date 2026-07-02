import { describe, it, expect } from 'vitest';
import { aplicarTravaPiloto, PILOTO_SPEC_VERSION } from '@/lib/season-engine/piloto-trava';

const descritoresComRegua = [
  { descritor: 'D1', nota_atual: 2.0 },
  { descritor: 'D2', nota_atual: 1.5 },
  { descritor: 'D3', nota_atual: 3.0 },
];

function scorerOutput() {
  return {
    avaliacao_por_descritor: [
      { descritor: 'D1', nota_pre: 2.0, nota_pos: 1.4, delta: -0.6 }, // bruto ABAIXO do baseline
      { descritor: 'D2', nota_pre: 1.5, nota_pos: 2.2, delta: 0.7 },  // bruto acima — piso não age
      { descritor: 'D3', nota_pre: 3.0, nota_pos: 3.0, delta: 0.0 },  // igual — piso não age
    ],
    nota_media_pre: 2.2,
    nota_media_pos: 2.2,
    delta_medio: 0.0,
    resumo_avaliacao: { mensagem_geral: 'ok' },
  };
}

describe('Piloto — trava de piso do fechamento', () => {
  it('pos_bruto < baseline → exibido == baseline, piso_aplicado=true, bruto PRESERVADO', () => {
    const r = aplicarTravaPiloto(scorerOutput(), descritoresComRegua);
    const d1 = r.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_pos).toBe(2.0);          // exibido = baseline
    expect(d1.nota_pos_bruto).toBe(1.4);    // bruto preservado no snapshot
    expect(d1.piso_aplicado).toBe(true);
    expect(d1.delta).toBe(0);               // delta recalculado sobre o exibido
  });

  it('pos_bruto >= baseline → intocado, piso_aplicado=false', () => {
    const r = aplicarTravaPiloto(scorerOutput(), descritoresComRegua);
    const d2 = r.avaliacao_por_descritor.find((d: any) => d.descritor === 'D2');
    expect(d2.nota_pos).toBe(2.2);
    expect(d2.nota_pos_bruto).toBe(2.2);
    expect(d2.piso_aplicado).toBe(false);
  });

  it('médias: exibida recalculada, bruta preservada; piso agregado marcado', () => {
    const r = aplicarTravaPiloto(scorerOutput(), descritoresComRegua);
    expect(r.nota_media_pos_bruto).toBe(2.2);              // média dos brutos
    expect(r.nota_media_pos).toBeCloseTo(2.4);             // (2.0+2.2+3.0)/3
    expect(r.piso_aplicado).toBe(true);
    expect(r.delta_medio).toBeCloseTo(0.2);
  });

  it('carimba spec_version piloto — inconfundível com pós real', () => {
    const r = aplicarTravaPiloto(scorerOutput(), descritoresComRegua);
    expect(r.spec_version).toBe(PILOTO_SPEC_VERSION);
    expect(r.spec_version).toContain('piloto');
    // um snapshot de pós REAL nunca tem spec_version — presença = piloto
    expect(scorerOutput()).not.toHaveProperty('spec_version');
  });

  it('nenhum piso necessário → piso_aplicado=false no agregado', () => {
    const out = scorerOutput();
    out.avaliacao_por_descritor[0].nota_pos = 2.5; // acima do baseline 2.0
    const r = aplicarTravaPiloto(out, descritoresComRegua);
    expect(r.piso_aplicado).toBe(false);
    expect(r.avaliacao_por_descritor.every((d: any) => d.piso_aplicado === false)).toBe(true);
  });

  it('descritor sem baseline conhecido usa nota_pre ecoada pelo scorer', () => {
    const out = scorerOutput();
    out.avaliacao_por_descritor.push({ descritor: 'D-novo', nota_pre: 2.8, nota_pos: 1.0, delta: -1.8 });
    const r = aplicarTravaPiloto(out, descritoresComRegua);
    const dn = r.avaliacao_por_descritor.find((d: any) => d.descritor === 'D-novo');
    expect(dn.nota_pos).toBe(2.8);
    expect(dn.piso_aplicado).toBe(true);
  });

  it('input sem avaliacao_por_descritor → passthrough (nunca quebra o fechamento)', () => {
    const r = aplicarTravaPiloto({ resumo_avaliacao: {} }, descritoresComRegua);
    expect(r).toEqual({ resumo_avaliacao: {} });
    expect(aplicarTravaPiloto(null, descritoresComRegua)).toBeNull();
  });
});
