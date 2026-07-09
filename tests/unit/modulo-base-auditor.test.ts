import { describe, it, expect } from 'vitest';
import { derivarVeredito } from '@/lib/modulo-base-auditor';

const alta = { gravidade: 'alta' };
const media = { gravidade: 'media' };
const baixa = { gravidade: 'baixa' };

describe('derivarVeredito', () => {
  it('sem problemas e estrutura completa = aprovado 10', () => {
    expect(derivarVeredito([], true)).toEqual({ nota: 10, veredito: 'aprovado' });
  });

  it('só problemas baixos ainda aprova, descontando 0,1 cada', () => {
    expect(derivarVeredito([baixa, baixa], true)).toEqual({ nota: 9.8, veredito: 'aprovado' });
  });

  // A regressão que motivou a mudança: o modelo dava "aprovado_com_ressalvas"
  // (nota até 9,4) a módulos com problema ALTA. Três chegaram a ser publicados,
  // um deles com invenção factual. Gravidade alta REPROVA, sempre.
  it('qualquer problema ALTA reprova, mesmo cercado de nada', () => {
    const r = derivarVeredito([alta], true);
    expect(r.veredito).toBe('reprovado');
    expect(r.nota).toBeLessThanOrEqual(4.9);
  });

  it('ALTA reprova mesmo com estrutura completa e muitos acertos', () => {
    expect(derivarVeredito([alta, baixa, baixa, baixa], true).veredito).toBe('reprovado');
  });

  it('um problema MEDIA impede "aprovado", mas não reprova', () => {
    expect(derivarVeredito([media], true)).toEqual({ nota: 9.4, veredito: 'aprovado_com_ressalvas' });
  });

  it('piso 7,0 protege insumo sólido: muitos "média" não derrubam abaixo disso', () => {
    const r = derivarVeredito([media, media, media, media, media, media], true);
    expect(r.nota).toBe(7);
    expect(r.veredito).toBe('aprovado_com_ressalvas');
  });

  it('sem estrutura completa NÃO há piso — pode cair abaixo de 7', () => {
    const r = derivarVeredito([media, media, media, media, media, media], false);
    expect(r.nota).toBeCloseTo(6.4, 5);
    expect(r.veredito).toBe('aprovado_com_ressalvas');
  });

  it('estrutura furada + nota < 5 reprova mesmo sem ALTA', () => {
    const muitos = Array(9).fill(media);
    const r = derivarVeredito(muitos, false);
    expect(r.nota).toBeLessThan(5);
    expect(r.veredito).toBe('reprovado');
  });

  it('nota nunca sai de [0,10] e tem 1 casa decimal', () => {
    const r = derivarVeredito(Array(20).fill(alta), false);
    expect(r.nota).toBeGreaterThanOrEqual(0);
    const t = derivarVeredito([baixa], true);
    expect(Number.isInteger(t.nota * 10)).toBe(true);
  });

  it('ignora gravidades desconhecidas em vez de explodir', () => {
    expect(derivarVeredito([{ gravidade: 'catastrofica' } as any], true).veredito).toBe('aprovado');
  });
});
