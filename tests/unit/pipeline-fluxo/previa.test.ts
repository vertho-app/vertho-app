import { describe, it, expect } from 'vitest';
import { montarPreviaFluxo, idsTrilhaProntos, CUSTO_POR_UNIDADE, type EntradaPrevia, type EtapaId } from '@/lib/pipeline-fluxo/previa';

/**
 * A prévia do fluxo completo (IA4 → blueprint → auditoria → PDI → trilha → Gestor/RH) é uma ESTIMATIVA que
 * reproduz o critério de cada fila real. Estes testes travam o critério, a projeção entre etapas e o custo.
 */
const entrada = (parcial: Partial<EntradaPrevia> = {}): EntradaPrevia => ({
  pessoas: [], cargos: [], respostas: [], filaIA4: [], assessments: [], blueprints: [], pdis: [], trilhas: [], ...parcial,
});
const pessoa = (id: string, cargo: string | null = 'CAIXA', gestorEmail: string | null = null) => ({ id, nome: `Pessoa ${id}`, cargo, gestorEmail });
const cargo = (nome: string, foco: string[], top5 = 5) => ({ nome, foco, top5 });
const etapa = (p: ReturnType<typeof montarPreviaFluxo>, id: EtapaId) => p.etapas.find((e) => e.id === id)!;
const resp = (colaborador_id: string, competencia_nome: string, avaliada = false) => ({ colaborador_id, competencia_nome, avaliada });

describe('estado inicial da Amazon Bowling (01/10/2026): 15 pessoas, 0 respostas, 0 cargos com foco', () => {
  const p = montarPreviaFluxo(entrada({
    pessoas: Array.from({ length: 15 }, (_, i) => pessoa(`p${i}`)),
    cargos: [cargo('CAIXA', [], 5)],
  }));
  it('nada a fazer, e diz por quê', () => {
    expect(p.nadaAFazer).toBe(true);
    expect(p.avisos.join(' ')).toMatch(/Nada a fazer/);
    expect(p.custoTotalUsd).toEqual({ min: 0, max: 0 });
  });
  it('bloqueios: cargo sem foco (blueprint e trilha) e ainda não respondeu (PDI)', () => {
    const motivos = p.bloqueios.map((b) => `${b.etapa}:${b.motivo}`);
    expect(motivos).toContain('blueprint:Cargo sem competências foco definidas');
    expect(motivos).toContain('trilha:Cargo sem competências foco definidas');
    expect(motivos).toContain('pdi:Ainda não respondeu nenhum cenário');
    expect(p.bloqueios.find((b) => b.etapa === 'blueprint')!.quantidade).toBe(15);
    expect(p.bloqueios.find((b) => b.etapa === 'blueprint')!.exemplos).toHaveLength(6); // exemplos limitados
  });
});

describe('foco definido, ninguém respondeu: o bloqueio diz QUAL competência falta', () => {
  it('blueprint e trilha bloqueados com a lista do que falta', () => {
    const p = montarPreviaFluxo(entrada({ pessoas: [pessoa('a')], cargos: [cargo('CAIXA', ['Rotina e Disciplina', 'Simplicidade'])] }));
    expect(p.bloqueios.find((b) => b.etapa === 'blueprint')!.motivo).toBe('Falta responder: Rotina e Disciplina, Simplicidade');
    expect(etapa(p, 'blueprint').bloqueados).toBe(1);
    expect(etapa(p, 'blueprint').prontosAgora + etapa(p, 'blueprint').aposEtapaAnterior).toBe(0);
  });
});

describe('PROJEÇÃO: respondeu mas a IA4 ainda não avaliou', () => {
  const base = entrada({
    pessoas: [pessoa('a')],
    cargos: [cargo('CAIXA', ['Simplicidade'], 2)],
    respostas: [resp('a', 'Simplicidade'), resp('a', 'Agilidade')],
    filaIA4: [{ colaborador_id: 'a' }, { colaborador_id: 'a' }],
  });
  const p = montarPreviaFluxo(base);
  it('a IA4 roda agora e conta as RESPOSTAS (2), não a pessoa', () => {
    expect(etapa(p, 'ia4').prontosAgora).toBe(1);
    expect(etapa(p, 'ia4').custoUsd).toEqual({ min: Number((2 * CUSTO_POR_UNIDADE.ia4.min).toFixed(2)), max: Number((2 * CUSTO_POR_UNIDADE.ia4.max).toFixed(2)) });
  });
  it('blueprint, auditoria, PDI e trilha ficam "após a etapa anterior" (nada pronto agora)', () => {
    for (const id of ['blueprint', 'auditoria', 'pdi', 'trilha'] as EtapaId[]) {
      expect(etapa(p, id).prontosAgora, id).toBe(0);
      expect(etapa(p, id).aposEtapaAnterior, id).toBe(1);
    }
    expect(p.nadaAFazer).toBe(false);
  });
});

describe('mapeamento completo: tudo pronto agora', () => {
  it('blueprint e trilha prontos agora; auditoria só depois do blueprint', () => {
    const p = montarPreviaFluxo(entrada({
      pessoas: [pessoa('a')], cargos: [cargo('CAIXA', ['Simplicidade'], 1)],
      respostas: [resp('a', 'Simplicidade', true)],
      assessments: [{ colaborador_id: 'a', competencia: 'simplicidade' }],
    }));
    expect(etapa(p, 'blueprint').prontosAgora).toBe(1);
    expect(etapa(p, 'trilha').prontosAgora).toBe(1);
    expect(etapa(p, 'auditoria').aposEtapaAnterior).toBe(1);
    expect(etapa(p, 'pdi').prontosAgora).toBe(1);
  });
  it('a comparação de nome ignora caixa e espaços (a normalização do blueprint)', () => {
    const p = montarPreviaFluxo(entrada({
      pessoas: [pessoa('a')], cargos: [cargo('CAIXA', ['  Rotina E Disciplina '], 1)],
      respostas: [resp('a', 'rotina e disciplina', true)],
      assessments: [{ colaborador_id: 'a', competencia: 'ROTINA E DISCIPLINA' }],
    }));
    expect(etapa(p, 'blueprint').prontosAgora).toBe(1);
  });
});

describe('quem já tem o artefato NÃO é regerado (o upsert sobrescreveria PDI/blueprint entregue)', () => {
  const p = montarPreviaFluxo(entrada({
    pessoas: [pessoa('a'), pessoa('b')], cargos: [cargo('CAIXA', ['S'], 1)],
    respostas: [resp('a', 'S', true), resp('b', 'S', true)],
    assessments: [{ colaborador_id: 'a', competencia: 's' }, { colaborador_id: 'b', competencia: 's' }],
    blueprints: [{ colaborador_id: 'a', auditado: true }, { colaborador_id: 'b', auditado: false }],
    pdis: ['a'], trilhas: ['a'],
  }));
  it('a: tudo já feito; b: só falta PDI e trilha (blueprint antigo NÃO é reauditado: não se reavalia o passado)', () => {
    expect(etapa(p, 'blueprint').jaFeitos).toBe(2);
    expect(etapa(p, 'blueprint').prontosAgora).toBe(0);
    expect(etapa(p, 'auditoria').jaFeitos).toBe(2);
    expect(etapa(p, 'auditoria').prontosAgora).toBe(0); // b: blueprint sem auditoria de antes, e fica assim
    expect(etapa(p, 'auditoria').aposEtapaAnterior).toBe(0);
    expect(etapa(p, 'pdi').jaFeitos).toBe(1);
    expect(etapa(p, 'pdi').prontosAgora).toBe(1);
    expect(etapa(p, 'trilha').jaFeitos).toBe(1);
    expect(etapa(p, 'trilha').prontosAgora).toBe(1);
  });
});

describe('PDI COMPLETO: só entra quem avaliou TODO o top 5 do cargo', () => {
  it('top5 = 3 com 2 avaliadas: bloqueado, e o motivo traz o x de y', () => {
    const p = montarPreviaFluxo(entrada({
      pessoas: [pessoa('a')], cargos: [cargo('CAIXA', ['S'], 3)],
      respostas: [resp('a', 'S', true), resp('a', 'T', true)],
    }));
    expect(p.bloqueios.find((b) => b.etapa === 'pdi')!.motivo).toBe('Avaliação incompleta (2 de 3 competências do top 5)');
  });
  it('a IA4 pendente conta na PROJEÇÃO: 2 avaliadas + 1 pendente com top5 3 = pronto após a IA4', () => {
    const p = montarPreviaFluxo(entrada({
      pessoas: [pessoa('a')], cargos: [cargo('CAIXA', ['S'], 3)],
      respostas: [resp('a', 'S', true), resp('a', 'T', true), resp('a', 'U', false)],
      filaIA4: [{ colaborador_id: 'a' }],
    }));
    expect(etapa(p, 'pdi').prontosAgora).toBe(0);
    expect(etapa(p, 'pdi').aposEtapaAnterior).toBe(1);
  });
  it('cargo SEM top5 configurado mantém a regra antiga (basta ter avaliação)', () => {
    const p = montarPreviaFluxo(entrada({ pessoas: [pessoa('a')], cargos: [cargo('CAIXA', ['S'], 0)], respostas: [resp('a', 'S', true)] }));
    expect(etapa(p, 'pdi').prontosAgora).toBe(1);
  });
});

describe('Gestor e RH: ao final, só se houver PDI', () => {
  const comPdi = (gestores: Array<string | null>) => montarPreviaFluxo(entrada({
    pessoas: gestores.map((g, i) => pessoa(`p${i}`, 'CAIXA', g)),
    cargos: [cargo('CAIXA', ['S'], 1)],
    respostas: gestores.map((_, i) => resp(`p${i}`, 'S', true)),
  }));
  it('um relatório por gestor (e-mail sem diferenciar caixa) e um RH', () => {
    const p = comPdi(['Chefe@x.com', 'chefe@x.com ', 'outro@x.com', null]);
    expect(etapa(p, 'gestor').aposEtapaAnterior).toBe(2);
    expect(etapa(p, 'rh').aposEtapaAnterior).toBe(1);
  });
  it('PDIs que JÁ existiam não reabrem Gestor e RH: só PDI NOVO nesta rodada dispara os dois', () => {
    const p = montarPreviaFluxo(entrada({
      pessoas: [pessoa('a', 'CAIXA', 'g@x.com')], cargos: [cargo('CAIXA', ['S'], 1)],
      respostas: [resp('a', 'S', true)], pdis: ['a'],
    }));
    expect(etapa(p, 'pdi').jaFeitos).toBe(1);
    expect(etapa(p, 'gestor').aposEtapaAnterior).toBe(0);
    expect(etapa(p, 'rh').aposEtapaAnterior).toBe(0);
  });
  it('sem nenhum PDI possível, Gestor e RH não entram', () => {
    const p = montarPreviaFluxo(entrada({ pessoas: [pessoa('a', 'CAIXA', 'g@x.com')], cargos: [cargo('CAIXA', [], 5)] }));
    expect(etapa(p, 'gestor').aposEtapaAnterior).toBe(0);
    expect(etapa(p, 'rh').aposEtapaAnterior).toBe(0);
  });
  it('escopo PARCIAL (turma ou cargo): Gestor e RH ficam de fora, como no executor, e a nota diz por quê', () => {
    const base = { pessoas: [pessoa('a', 'CAIXA', 'g@x.com')], cargos: [cargo('CAIXA', ['S'], 1)], respostas: [resp('a', 'S', true)] };
    const inteira = montarPreviaFluxo(entrada({ ...base, empresaInteira: true }));
    const parcial = montarPreviaFluxo(entrada({ ...base, empresaInteira: false }));
    expect(etapa(inteira, 'gestor').aposEtapaAnterior).toBe(1);
    expect(etapa(parcial, 'gestor').aposEtapaAnterior).toBe(0);
    expect(etapa(parcial, 'rh').aposEtapaAnterior).toBe(0);
    expect(etapa(parcial, 'gestor').nota).toMatch(/Não incluído/);
    expect(parcial.custoTotalUsd.max).toBeLessThan(inteira.custoTotalUsd.max);
  });
});

describe('idsTrilhaProntos: a fila REAL da trilha é a mesma conta de "prontos agora" da prévia', () => {
  it('foco completo e sem trilha entra; sem foco, foco incompleto ou já com trilha ficam fora', () => {
    const e = entrada({
      pessoas: [pessoa('ok'), pessoa('incompleto'), pessoa('semfoco', 'VAZIO'), pessoa('jatem')],
      cargos: [cargo('CAIXA', ['Rotina', 'Simplicidade']), cargo('VAZIO', [])],
      assessments: [
        { colaborador_id: 'ok', competencia: ' ROTINA ' }, { colaborador_id: 'ok', competencia: 'simplicidade' },
        { colaborador_id: 'incompleto', competencia: 'rotina' },
        { colaborador_id: 'jatem', competencia: 'rotina' }, { colaborador_id: 'jatem', competencia: 'simplicidade' },
      ],
      trilhas: ['jatem'],
    });
    expect(idsTrilhaProntos(e)).toEqual(['ok']);
    expect(etapa(montarPreviaFluxo(e), 'trilha').prontosAgora).toBe(idsTrilhaProntos(e).length);
  });
});

describe('custo', () => {
  it('é unidade × faixa medida no ledger; o total soma as etapas', () => {
    const p = montarPreviaFluxo(entrada({
      pessoas: [pessoa('a'), pessoa('b')], cargos: [cargo('CAIXA', ['S'], 1)],
      respostas: [resp('a', 'S', true), resp('b', 'S', true)],
      assessments: [{ colaborador_id: 'a', competencia: 's' }, { colaborador_id: 'b', competencia: 's' }],
    }));
    expect(etapa(p, 'blueprint').custoUsd.min).toBe(Number((2 * CUSTO_POR_UNIDADE.blueprint.min).toFixed(2)));
    const soma = p.etapas.reduce((t, e) => t + e.custoUsd.max, 0);
    expect(p.custoTotalUsd.max).toBeCloseTo(soma, 1);
    expect(p.custoTotalUsd.min).toBeLessThan(p.custoTotalUsd.max);
  });
  it('as faixas medidas são coerentes (min <= max, positivas)', () => {
    for (const [id, f] of Object.entries(CUSTO_POR_UNIDADE)) {
      expect(f.min, id).toBeGreaterThan(0);
      expect(f.min, id).toBeLessThanOrEqual(f.max);
    }
  });
});

describe('avisos', () => {
  it('pessoa sem cargo (ou com cargo que a empresa não cadastrou) vira aviso e fica bloqueada', () => {
    const p = montarPreviaFluxo(entrada({ pessoas: [pessoa('a', null), pessoa('b', 'FANTASMA')], cargos: [cargo('CAIXA', ['S'])] }));
    expect(p.avisos.join(' ')).toMatch(/2 pessoa\(s\) sem cargo/);
    expect(etapa(p, 'blueprint').bloqueados).toBe(2);
  });
});
