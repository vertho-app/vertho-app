import { describe, it, expect } from 'vitest';
import { escolherFocoMenorNota, prontidaoParaFoco, regraFocoIndividual } from '@/lib/foco-individual';
import { focoDaPessoa, focoIndividual } from '@/lib/foco-cargo';
import { idsTrilhaProntos, montarPreviaFluxo, type EntradaPrevia } from '@/lib/pipeline-fluxo/previa';
import { paresDeModuloBase } from '@/lib/pipeline-fluxo/prerequisitos-coleta';

/**
 * Competência foco POR PESSOA, pela menor nota (Amazon Bowling, 15/10/2026). A regra de escolha é pura; a precedência
 * "pessoa vence cargo" é o que mantém PDI, blueprint e trilha falando da MESMA competência.
 */
const notas = (comp: string, ...ns: Array<number | null>) => ns.map((nota, i) => ({ competencia: comp, descritor: `${comp}-D${i + 1}`, nota }));

describe('escolherFocoMenorNota', () => {
  it('escolhe a competência de menor média de descritores', () => {
    const r = escolherFocoMenorNota([...notas('Simplicidade', 2.5, 2.5), ...notas('Rotina e Disciplina', 1.5, 2.0), ...notas('Agilidade', 3, 3)]);
    expect(r).toMatchObject({ competencia: 'Rotina e Disciplina', media: 1.75, criterio: 'menor_media', empatadas: [] });
    expect(r!.medias).toEqual({ Simplicidade: 2.5, 'Rotina e Disciplina': 1.75, Agilidade: 3 });
  });

  it('empate na média: vence o PIOR DESCRITOR isolado (decisão do dono)', () => {
    // As duas com média 2,00; Agilidade tem um descritor em 1,0.
    const r = escolherFocoMenorNota([...notas('Simplicidade', 2, 2), ...notas('Agilidade', 1, 3)]);
    expect(r).toMatchObject({ competencia: 'Agilidade', criterio: 'pior_descritor', piorDescritor: 1 });
    expect(r!.empatadas.sort()).toEqual(['Agilidade', 'Simplicidade']);
  });

  it('empate na média e no pior descritor: vence a ordem do Top 5 do cargo', () => {
    const top5 = ['Foco no cliente', 'Rotina', 'Simplicidade'];
    const r = escolherFocoMenorNota([...notas('Simplicidade', 1, 3), ...notas('Rotina', 1, 3)], top5);
    expect(r).toMatchObject({ competencia: 'Rotina', criterio: 'ordem_top5' });
  });

  it('o Top 5 casa sem diferenciar caixa e espaço', () => {
    const r = escolherFocoMenorNota([...notas('Simplicidade', 2), ...notas('Rotina', 2)], ['  rotina ', 'simplicidade']);
    expect(r!.competencia).toBe('Rotina');
  });

  it('sem Top 5 que desempate: ordem alfabética (determinístico)', () => {
    const r = escolherFocoMenorNota([...notas('Simplicidade', 2), ...notas('Agilidade', 2)]);
    expect(r).toMatchObject({ competencia: 'Agilidade', criterio: 'ordem_alfabetica' });
  });

  it('a média é comparada em 2 casas (o número que o PDI mostra), não em ponto flutuante cru', () => {
    // 1,666… e 1,67 empatam em 2 casas; o desempate decide, não o ruído de ponto flutuante.
    const r = escolherFocoMenorNota([...notas('A', 1, 2, 2), ...notas('B', 1.67)]);
    expect(r!.empatadas.sort()).toEqual(['A', 'B']);
    expect(r).toMatchObject({ competencia: 'A', criterio: 'pior_descritor' });
  });

  it('ignora nota nula ou inválida; sem nenhuma nota válida devolve null', () => {
    expect(escolherFocoMenorNota([...notas('A', null, 3), ...notas('B', 2)])!.competencia).toBe('B');
    expect(escolherFocoMenorNota([...notas('A', 3), { competencia: 'B', nota: 'x' }])!.competencia).toBe('A');
    expect(escolherFocoMenorNota(notas('A', null))).toBeNull();
    expect(escolherFocoMenorNota([])).toBeNull();
  });

  it('devolve o nome como está nas notas (o gerador da trilha casa por igualdade exata)', () => {
    const r = escolherFocoMenorNota([...notas('Equilibrio Emocional e Resiliência', 1.2), ...notas('Simplicidade', 3)]);
    expect(r!.competencia).toBe('Equilibrio Emocional e Resiliência');
  });
});

describe('prontidaoParaFoco', () => {
  const com = new Set(['rotina', 'simplicidade']);
  it('pronta só com tudo avaliado, checado e com nota por descritor', () => {
    expect(prontidaoParaFoco([{ competencia_nome: 'Rotina', avaliada: true, checada: true }, { competencia_nome: 'Simplicidade', avaliada: true, checada: true }], com)).toBe('pronto');
  });
  it('avaliação pendente, ou avaliada sem nota por descritor (presa), espera a IA4', () => {
    expect(prontidaoParaFoco([{ competencia_nome: 'Rotina', avaliada: false, checada: false }], com)).toBe('aguardando_ia4');
    expect(prontidaoParaFoco([{ competencia_nome: 'Agilidade', avaliada: true, checada: true }], com)).toBe('aguardando_ia4');
  });
  it('avaliada sem a 2ª checagem espera o check', () => {
    expect(prontidaoParaFoco([{ competencia_nome: 'Rotina', avaliada: true, checada: false }], com)).toBe('aguardando_check');
  });
  it('sem resposta nenhuma', () => {
    expect(prontidaoParaFoco([], com)).toBe('sem_resposta');
  });
});

describe('regra e precedência', () => {
  it('a regra só liga com o valor exato', () => {
    expect(regraFocoIndividual({ foco_individual: 'menor_nota' })).toBe('menor_nota');
    expect(regraFocoIndividual({ foco_individual: 'maior_nota' })).toBeNull();
    expect(regraFocoIndividual({})).toBeNull();
    expect(regraFocoIndividual(null)).toBeNull();
  });
  it('a competência da pessoa vence a do cargo; vazia, vale a do cargo', () => {
    const cargo = { competencias_foco: ['Rotina', 'Agilidade'] };
    expect(focoDaPessoa({ foco_individual: ['Simplicidade'] }, cargo)).toEqual(['Simplicidade']);
    expect(focoDaPessoa({ foco_individual: [] }, cargo)).toEqual(['Rotina', 'Agilidade']);
    expect(focoDaPessoa({ foco_individual: null }, cargo)).toEqual(['Rotina', 'Agilidade']);
    expect(focoDaPessoa(null, { competencia_foco: 'Rotina' })).toEqual(['Rotina']);
    expect(focoIndividual({ foco_individual: [' Simplicidade ', '', 'Simplicidade'] })).toEqual(['Simplicidade']);
  });
});

/** O caso que separa "foco por cargo" de "foco por pessoa": a Supervisão da Amazon tem 4 pessoas. */
const base = (over: Partial<EntradaPrevia> = {}): EntradaPrevia => ({
  pessoas: [
    { id: 'p1', nome: 'Ana', cargo: 'SUPERVISAO', focoIndividual: ['Rotina'] },
    { id: 'p2', nome: 'Bia', cargo: 'SUPERVISAO', focoIndividual: ['Simplicidade'] },
  ],
  cargos: [{ nome: 'SUPERVISAO', foco: [], top5: 6 }],
  respostas: [],
  filaIA4: [],
  assessments: [{ colaborador_id: 'p1', competencia: 'Rotina' }, { colaborador_id: 'p2', competencia: 'Simplicidade' }],
  blueprints: [], pdis: [], trilhas: [],
  ...over,
});

describe('fila da trilha e prévia com a competência de cada pessoa', () => {
  it('cargo SEM foco: as duas pessoas entram na trilha pela competência delas', () => {
    expect(idsTrilhaProntos(base()).sort()).toEqual(['p1', 'p2']);
  });

  it('a competência da pessoa precisa estar mapeada (a regra dos 100% vale para ela)', () => {
    expect(idsTrilhaProntos(base({ assessments: [{ colaborador_id: 'p1', competencia: 'Rotina' }] }))).toEqual(['p1']);
  });

  it('regra ligada e competência ainda por escolher: blueprint, PDI e trilha ficam PROJETADOS, não bloqueados por "cargo sem foco"', () => {
    const e = base({
      regraFoco: 'menor_nota',
      pessoas: [{ id: 'p3', nome: 'Caio', cargo: 'SUPERVISAO' }],
      respostas: [
        { colaborador_id: 'p3', competencia_nome: 'Rotina', avaliada: false },
        { colaborador_id: 'p3', competencia_nome: 'Simplicidade', avaliada: false },
      ],
      filaIA4: [{ colaborador_id: 'p3' }, { colaborador_id: 'p3' }],
      assessments: [],
    });
    const p = montarPreviaFluxo(e);
    const et = (id: string) => p.etapas.find((x) => x.id === id)!;
    expect(et('foco')).toMatchObject({ prontosAgora: 0, aposEtapaAnterior: 1, bloqueados: 0 });
    expect(et('blueprint')).toMatchObject({ aposEtapaAnterior: 1, bloqueados: 0 });
    expect(et('trilha')).toMatchObject({ aposEtapaAnterior: 1, bloqueados: 0 });
    expect(et('pdi')).toMatchObject({ prontosAgora: 0, aposEtapaAnterior: 1, bloqueados: 0 });
    expect(p.bloqueios.some((b) => /sem competências foco/.test(b.motivo))).toBe(false);
  });

  it('regra ligada: quem tem tudo avaliado e checado está pronto para a escolha agora; quem já tem a competência conta como feito', () => {
    const e = base({
      regraFoco: 'menor_nota',
      pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'SUPERVISAO', focoIndividual: ['Rotina'] }, { id: 'p3', nome: 'Caio', cargo: 'SUPERVISAO' }],
      respostas: [{ colaborador_id: 'p3', competencia_nome: 'Rotina', avaliada: true, checada: true }],
      assessments: [{ colaborador_id: 'p1', competencia: 'Rotina' }, { colaborador_id: 'p3', competencia: 'Rotina' }],
    });
    const foco = montarPreviaFluxo(e).etapas.find((x) => x.id === 'foco')!;
    expect(foco).toMatchObject({ prontosAgora: 1, jaFeitos: 1 });
  });

  it('PDI de quem tem competência própria sai com o que a pessoa respondeu (5 de 6 entra)', () => {
    const respostas = ['A', 'B', 'C', 'D', 'E'].map((c) => ({ colaborador_id: 'p1', competencia_nome: c, avaliada: true, checada: true }));
    const comProprio = montarPreviaFluxo(base({ respostas })).etapas.find((x) => x.id === 'pdi')!;
    expect(comProprio.prontosAgora).toBe(1);
    // Sem competência própria, o Top 5 de 6 continua exigido.
    const semProprio = montarPreviaFluxo(base({
      respostas,
      pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'SUPERVISAO' }],
      cargos: [{ nome: 'SUPERVISAO', foco: ['A'], top5: 6 }],
    })).etapas.find((x) => x.id === 'pdi')!;
    expect(semProprio).toMatchObject({ prontosAgora: 0, bloqueados: 1 });
  });

  it('regra desligada: a etapa não conta ninguém e o cargo sem foco segue bloqueando', () => {
    const p = montarPreviaFluxo(base({ pessoas: [{ id: 'p3', nome: 'Caio', cargo: 'SUPERVISAO' }], respostas: [{ colaborador_id: 'p3', competencia_nome: 'Rotina', avaliada: true }] }));
    const foco = p.etapas.find((x) => x.id === 'foco')!;
    expect(foco.prontosAgora + foco.aposEtapaAnterior + foco.jaFeitos + foco.bloqueados).toBe(0);
    expect(p.bloqueios.some((b) => b.etapa === 'trilha' && /sem competências foco/.test(b.motivo))).toBe(true);
  });
});

describe('pares de módulo-base que o fluxo confere', () => {
  it('um par por (cargo, competência DA PESSOA)', () => {
    expect(paresDeModuloBase(base())).toEqual([
      { cargo: 'SUPERVISAO', competencia: 'Rotina' },
      { cargo: 'SUPERVISAO', competencia: 'Simplicidade' },
    ]);
  });

  it('competência ainda por escolher: entram TODAS as que a pessoa respondeu (qualquer uma pode ser a menor)', () => {
    const pares = paresDeModuloBase(base({
      regraFoco: 'menor_nota',
      pessoas: [{ id: 'p3', nome: 'Caio', cargo: 'SUPERVISAO' }],
      respostas: [
        { colaborador_id: 'p3', competencia_nome: 'Rotina', avaliada: false },
        { colaborador_id: 'p3', competencia_nome: 'Agilidade', avaliada: false },
      ],
    }));
    expect(pares.map((p) => p.competencia).sort()).toEqual(['Agilidade', 'Rotina']);
  });

  it('sem a regra, segue o foco do cargo (o comportamento de antes)', () => {
    expect(paresDeModuloBase(base({
      pessoas: [{ id: 'p3', nome: 'Caio', cargo: 'SUPERVISAO' }],
      cargos: [{ nome: 'SUPERVISAO', foco: ['Rotina'], top5: 6 }],
    }))).toEqual([{ cargo: 'SUPERVISAO', competencia: 'Rotina' }]);
  });
});
