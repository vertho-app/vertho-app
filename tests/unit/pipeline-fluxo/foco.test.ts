import { describe, it, expect, vi, beforeEach } from 'vitest';

const coletar = vi.fn();
vi.mock('@/lib/pipeline-fluxo/coletar', async () => {
  const real = await vi.importActual<any>('@/lib/pipeline-fluxo/coletar');
  return { ...real, coletarEntradaPrevia: (...a: any[]) => coletar(...a) };
});

import { filaFocoEscopo, gravarFocoIndividual } from '@/lib/pipeline-fluxo/foco';
import type { FocoItem } from '@/lib/pipeline-fluxo/executor';

/**
 * Etapa "Competência de cada pessoa": quem entra (sem competência própria, sem trilha, tudo avaliado e checado), qual
 * competência (a de menor nota) e a gravação que nunca troca uma escolha já feita.
 */
const LIGADA = { foco_individual: 'menor_nota' };
const entrada = (over: Record<string, any> = {}) => ({
  pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'CAIXA' }],
  cargos: [{ nome: 'CAIXA', foco: [], top5: 3 }],
  respostas: [
    { colaborador_id: 'p1', competencia_nome: 'Rotina', avaliada: true, checada: true },
    { colaborador_id: 'p1', competencia_nome: 'Simplicidade', avaliada: true, checada: true },
  ],
  filaIA4: [], assessments: [], blueprints: [], pdis: [], trilhas: [],
  ...over,
});
const nota = (colaborador_id: string, competencia: string, ...ns: number[]) => ns.map((n, i) => ({ colaborador_id, competencia, descritor: `d${i + 1}`, nota: n }));

function bancoFalso(t: { notas?: any[]; cargos?: any[]; falhar?: string } = {}) {
  return {
    from: (nome: string) => {
      const linhas = nome === 'descriptor_assessments' ? (t.notas ?? []) : nome === 'cargos_empresa' ? (t.cargos ?? [{ nome: 'CAIXA', top5_workshop: ['Simplicidade', 'Rotina'] }]) : [];
      const resp = (de = 0) => (t.falhar === nome ? { data: null, error: { message: 'boom' } } : { data: de === 0 ? linhas : [], error: null });
      const q: any = { select: () => q, in: () => q, eq: () => q, order: () => q, range: (de: number) => Promise.resolve(resp(de)) };
      return q;
    },
  };
}

beforeEach(() => coletar.mockReset());

describe('filaFocoEscopo', () => {
  it('regra desligada: não lê nada e diz que está desligada', async () => {
    const r = await filaFocoEscopo(bancoFalso(), {}, { permitidos: null });
    expect(r).toEqual({ regraLigada: false, itens: [], aguardandoIA4: 0, aguardandoCheck: 0, semNota: 0 });
    expect(coletar).not.toHaveBeenCalled();
  });

  it('escolhe a menor média entre as competências que a pessoa respondeu e guarda o rastro', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const r = await filaFocoEscopo(bancoFalso({ notas: [...nota('p1', 'Rotina', 2, 3), ...nota('p1', 'Simplicidade', 1.5, 2)] }), LIGADA, { permitidos: null });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ colaboradorId: 'p1', nome: 'Ana', cargo: 'CAIXA', competencia: 'Simplicidade', media: 1.75, criterio: 'menor_media' });
    expect(r.itens[0].meta).toMatchObject({ regra: 'menor_nota', competencia: 'Simplicidade', medias: { Rotina: 2.5, Simplicidade: 1.75 }, origem: 'fluxo-completo' });
  });

  it('nota de competência que a pessoa NÃO respondeu não escolhe', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const r = await filaFocoEscopo(bancoFalso({ notas: [...nota('p1', 'Rotina', 3), ...nota('p1', 'Simplicidade', 2.5), ...nota('p1', 'Agilidade', 1)] }), LIGADA, { permitidos: null });
    expect(r.itens[0].competencia).toBe('Simplicidade');
  });

  it('o desempate usa o Top 5 DO CARGO da pessoa', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    const r = await filaFocoEscopo(bancoFalso({ notas: [...nota('p1', 'Rotina', 2), ...nota('p1', 'Simplicidade', 2)] }), LIGADA, { permitidos: null });
    expect(r.itens[0]).toMatchObject({ competencia: 'Simplicidade', criterio: 'ordem_top5' });
  });

  it('quem já tem competência própria ou trilha fica de fora (a escolha não muda depois de feita)', async () => {
    coletar.mockResolvedValue({ entrada: entrada({
      pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'CAIXA', focoIndividual: ['Rotina'] }, { id: 'p2', nome: 'Bia', cargo: 'CAIXA' }],
      trilhas: ['p2'],
    }) });
    const r = await filaFocoEscopo(bancoFalso({ notas: nota('p1', 'Rotina', 1) }), LIGADA, { permitidos: null });
    expect(r.itens).toHaveLength(0);
  });

  it('CONTA quem ainda não pode ter a competência escolhida, em vez de pular calado', async () => {
    coletar.mockResolvedValue({ entrada: entrada({
      pessoas: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, nome: id, cargo: 'CAIXA' })),
      respostas: [
        { colaborador_id: 'p1', competencia_nome: 'Rotina', avaliada: false, checada: false },
        { colaborador_id: 'p2', competencia_nome: 'Rotina', avaliada: true, checada: false },
        { colaborador_id: 'p3', competencia_nome: 'Rotina', avaliada: true, checada: true },
        // p4 não respondeu nada: não entra no programa (a prévia mostra), não conta como espera
      ],
    }) });
    // p3 está avaliada e checada mas sem nota por descritor (presa): espera a IA4, não some
    const r = await filaFocoEscopo(bancoFalso({ notas: nota('p2', 'Rotina', 2) }), LIGADA, { permitidos: null });
    expect(r).toMatchObject({ itens: [], aguardandoIA4: 2, aguardandoCheck: 1, semNota: 0 });
  });

  it('falha ao ler as notas LANÇA (fila que falha não pode virar fila vazia)', async () => {
    coletar.mockResolvedValue({ entrada: entrada() });
    await expect(filaFocoEscopo(bancoFalso({ falhar: 'descriptor_assessments' }), LIGADA, { permitidos: null })).rejects.toThrow(/notas por descritor/);
    await expect(filaFocoEscopo(bancoFalso({ falhar: 'cargos_empresa' }), LIGADA, { permitidos: null })).rejects.toThrow(/cargos_empresa/);
    coletar.mockResolvedValue({ error: 'colaboradores: x' });
    await expect(filaFocoEscopo(bancoFalso(), LIGADA, { permitidos: null })).rejects.toThrow(/colaboradores: x/);
  });
});

describe('gravarFocoIndividual', () => {
  const item: FocoItem = { colaboradorId: 'p1', nome: 'Ana', cargo: 'CAIXA', competencia: 'Simplicidade', media: 1.75, criterio: 'menor_media', empatadas: [], meta: { regra: 'menor_nota' } };

  function bancoGravacao(t: { atualizou: boolean; atual?: any; erroUpdate?: string; erroLeitura?: string }) {
    const chamadas: any[] = [];
    return {
      chamadas,
      from: () => ({
        update: (patch: any) => {
          chamadas.push({ op: 'update', patch });
          const q: any = {
            eq: (c: string, v: any) => { chamadas.push({ op: 'eq', c, v }); return q; },
            or: (f: string) => { chamadas.push({ op: 'or', f }); return q; },
            select: () => Promise.resolve(t.erroUpdate ? { data: null, error: { message: t.erroUpdate } } : { data: t.atualizou ? [{ id: 'p1' }] : [], error: null }),
          };
          return q;
        },
        select: () => {
          const q: any = { eq: () => q, maybeSingle: () => Promise.resolve(t.erroLeitura ? { data: null, error: { message: t.erroLeitura } } : { data: t.atual ?? null, error: null }) };
          return q;
        },
      }),
    };
  }

  it('grava a competência e o rastro SÓ onde o foco está vazio', async () => {
    const tdb = bancoGravacao({ atualizou: true });
    expect(await gravarFocoIndividual(tdb, item)).toEqual({ ok: true });
    expect(tdb.chamadas[0]).toEqual({ op: 'update', patch: { foco_individual: ['Simplicidade'], foco_individual_meta: { regra: 'menor_nota' } } });
    expect(tdb.chamadas).toContainEqual({ op: 'eq', c: 'id', v: 'p1' });
    expect(tdb.chamadas).toContainEqual({ op: 'or', f: 'foco_individual.is.null,foco_individual.eq.{}' });
  });

  it('se outra rodada já gravou a MESMA competência, é sucesso; se gravou outra, é falha e nada é trocado', async () => {
    expect(await gravarFocoIndividual(bancoGravacao({ atualizou: false, atual: { foco_individual: ['Simplicidade'] } }), item)).toEqual({ ok: true });
    const r = await gravarFocoIndividual(bancoGravacao({ atualizou: false, atual: { foco_individual: ['Rotina'] } }), item);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/já tinha a competência "Rotina"/);
  });

  it('erro de escrita ou de leitura vira falha com a mensagem (nunca ok)', async () => {
    expect(await gravarFocoIndividual(bancoGravacao({ atualizou: false, erroUpdate: 'boom' }), item)).toEqual({ ok: false, erro: 'Ana: boom' });
    expect(await gravarFocoIndividual(bancoGravacao({ atualizou: false, erroLeitura: 'x' }), item)).toEqual({ ok: false, erro: 'Ana: x' });
    expect((await gravarFocoIndividual(bancoGravacao({ atualizou: false, atual: null }), item)).erro).toMatch(/não encontrada/);
  });
});
