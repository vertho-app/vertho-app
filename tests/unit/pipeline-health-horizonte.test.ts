import { describe, it, expect } from 'vitest';
import { montarLacunas } from '@/lib/pipeline-health/coleta';

/**
 * A contagem do horizonte, isolada. Existe porque errei duas vezes ao escrevê-la e as
 * duas versões erradas pareciam plausíveis — só bateram como erradas quando conferidas
 * contra um medidor independente (41 temas na semana 5 do Ibipeba).
 *
 * Invariante central: a unidade de esforço é (tema × DISC). Um kit serve TODAS as
 * semanas que pedirem aquele tema, então cada DISC conta UMA vez, na primeira semana
 * que o demanda — que é a que define o prazo.
 */
const dias = (s: number) => (s - 3) * 7;   // semana 3 = corrente; sem5 → 14d

describe('montarLacunas (horizonte)', () => {
  it('conta cada DISC UMA vez, na primeira semana que o demanda', () => {
    // Mesmo tema nas semanas 5 e 6: I,S na 5 e C,D,I na 6. O I não pode contar duas
    // vezes — um único kit I atende as duas semanas.
    const out = montarLacunas([{
      competencia: 'Autocuidado', descritor: 'Limites', cargo: 'Gestão Escolar',
      faltantes: ['C', 'D', 'I', 'S'], pessoas: 15,
      discsPorSemana: [{ semana: 5, discs: ['I', 'S'] }, { semana: 6, discs: ['C', 'D', 'I'] }],
    }], dias);

    const total = out.reduce((s, l) => s + l.faltantes.length, 0);
    expect(total).toBe(4);                                   // C, D, I, S — não 5
    expect(out.find((l) => l.semana === 5)?.faltantes.sort()).toEqual(['I', 'S']);
    expect(out.find((l) => l.semana === 6)?.faltantes.sort()).toEqual(['C', 'D']);
  });

  it('ignora DISC que já têm kit publicado', () => {
    const out = montarLacunas([{
      competencia: 'X', descritor: 'Y', cargo: 'Z',
      faltantes: ['S'],                                       // só S falta
      pessoas: 3,
      discsPorSemana: [{ semana: 5, discs: ['C', 'D', 'I', 'S'] }],
    }], dias);
    expect(out).toHaveLength(1);
    expect(out[0].faltantes).toEqual(['S']);
  });

  it('tema totalmente coberto não vira lacuna', () => {
    expect(montarLacunas([{
      competencia: 'X', descritor: 'Y', cargo: 'Z', faltantes: [], pessoas: 3,
      discsPorSemana: [{ semana: 5, discs: ['C', 'D'] }],
    }], dias)).toEqual([]);
  });

  it('o prazo vem da semana atribuída, não da mais próxima do tema', () => {
    const out = montarLacunas([{
      competencia: 'X', descritor: 'Y', cargo: 'Z', faltantes: ['C', 'S'], pessoas: 5,
      discsPorSemana: [{ semana: 5, discs: ['S'] }, { semana: 8, discs: ['C'] }],
    }], dias);
    expect(out.find((l) => l.faltantes.includes('S'))?.diasAte).toBe(14);
    expect(out.find((l) => l.faltantes.includes('C'))?.diasAte).toBe(35);   // não 14
  });

  it('separa o mesmo descritor por CARGO (a unidade de autoria do kit)', () => {
    // Ibipeba real: "Consciência de limites" existe em Coordenação e em Gestão Escolar,
    // com briefs distintos. Colapsar os dois esconderia metade do trabalho.
    const out = montarLacunas([
      { competencia: 'Autocuidado', descritor: 'Consciência de limites', cargo: 'Coordenação Pedagógica', faltantes: ['S'], pessoas: 10, discsPorSemana: [{ semana: 5, discs: ['S'] }] },
      { competencia: 'Autocuidado', descritor: 'Consciência de limites', cargo: 'Gestão Escolar', faltantes: ['S'], pessoas: 15, discsPorSemana: [{ semana: 5, discs: ['S'] }] },
    ], dias);
    expect(out).toHaveLength(2);
  });

  it('semanas fora de ordem não quebram a atribuição', () => {
    const out = montarLacunas([{
      competencia: 'X', descritor: 'Y', cargo: 'Z', faltantes: ['D'], pessoas: 2,
      discsPorSemana: [{ semana: 9, discs: ['D'] }, { semana: 5, discs: ['D'] }],
    }], dias);
    expect(out).toHaveLength(1);
    expect(out[0].semana).toBe(5);   // a mais próxima manda
  });
});
