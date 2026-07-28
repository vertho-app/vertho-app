import { describe, it, expect } from 'vitest';
import { montarAlerta } from '@/lib/pipeline-health/core';
import type { ResultadoCheck } from '@/lib/pipeline-health/types';

/**
 * O alerta é o único ponto do health-check que chega numa pessoa. Dois defeitos reais
 * corrigidos em 27/07, ambos silenciosos porque e-mail não tem quem reclame:
 *  · o assunto contava TIPOS de achado ("2 lacunas") em vez de ocorrências (42 DISC);
 *  · o horizonte não tem `dataAlvo` e o texto dizia "entrega de hoje" — mandando
 *    corrigir a coisa errada, já que ele fala de semanas à frente.
 */
const run = (over: Partial<ResultadoCheck> = {}): ResultadoCheck => ({
  modo: 'preflight', empresaId: 'e1', empresaSlug: 'ibipeba', dataAlvo: '2026-07-29',
  severidade: 'critico', duracaoMs: 10,
  achados: [{ id: 'x', severidade: 'critico', titulo: 'T', contagem: 17, detalhe: 'd' }],
  ...over,
});

describe('montarAlerta', () => {
  it('o assunto conta OCORRÊNCIAS, não tipos de achado', () => {
    const a = montarAlerta([run()]);
    expect(a?.assunto).toContain('17');
  });

  it('soma as ocorrências de vários achados críticos', () => {
    const a = montarAlerta([run({
      achados: [
        { id: 'a', severidade: 'critico', titulo: 'A', contagem: 42, detalhe: 'd' },
        { id: 'b', severidade: 'critico', titulo: 'B', contagem: 3, detalhe: 'd' },
      ],
    })]);
    expect(a?.assunto).toContain('45');
  });

  it('horizonte fala de SEMANAS, nunca de "entrega de hoje"', () => {
    const a = montarAlerta([run({ modo: 'horizonte', dataAlvo: null })]);
    expect(a?.assunto).toContain('próximas semanas');
    expect(a?.assunto).not.toContain('hoje');
  });

  it('run só com aviso não vira alerta (crítico é o gatilho)', () => {
    expect(montarAlerta([run({ severidade: 'aviso' })])).toBeNull();
    expect(montarAlerta([])).toBeNull();
  });

  it('sem dataAlvo em modo de entrega, não inventa data', () => {
    const a = montarAlerta([run({ dataAlvo: null })]);
    expect(a?.assunto).toContain('hoje');   // fallback explícito, não uma data falsa
  });
});

/**
 * O ASSUNTO por MODO. Medido na prova de canal de 28/07: um run `estrutural` saiu como
 * "1 problema(s) na entrega de hoje" — mandava olhar a entrega quando o achado era de
 * integridade. O assunto é a única linha que a pessoa lê antes de decidir se abre.
 */
describe('montarAlerta — escopo do assunto por modo', () => {
  const critico = (over: Partial<ResultadoCheck>): ResultadoCheck => ({
    modo: 'preflight', empresaId: null, empresaSlug: 's', dataAlvo: null,
    severidade: 'critico', duracaoMs: 0,
    achados: [{ id: 'x', severidade: 'critico', titulo: 'T', contagem: 3, detalhe: 'd' }],
    ...over,
  });

  it('estrutural fala de INTEGRIDADE, não de entrega', () => {
    const a = montarAlerta([critico({ modo: 'estrutural' })]);
    expect(a?.assunto).toContain('integridade');
    expect(a?.assunto).not.toContain('entrega');
  });

  it('horizonte fala de próximas SEMANAS', () => {
    const a = montarAlerta([critico({ modo: 'horizonte' })]);
    expect(a?.assunto).toContain('próximas semanas');
  });

  it('entrega usa a DATA quando existe', () => {
    const a = montarAlerta([critico({ modo: 'preflight', dataAlvo: '2026-08-10' })]);
    expect(a?.assunto).toContain('2026-08-10');
  });

  it('modos MISTURADOS caem no texto de entrega (não escondem o crítico)', () => {
    const a = montarAlerta([critico({ modo: 'estrutural' }), critico({ modo: 'preflight', dataAlvo: '2026-08-10' })]);
    expect(a?.assunto).toContain('entrega');
    expect(a?.assunto).toContain('6');   // 3 + 3 ocorrências
  });
});
