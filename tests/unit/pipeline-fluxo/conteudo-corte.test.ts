import { describe, it, expect, vi, beforeEach } from 'vitest';
import { blueprintToTrilhaInputs, normDescritor } from '@/lib/blueprint/to-descriptors';
import { selectDescriptors, selectDescriptorsMulti, selectDescriptorsDuo, selectDescriptorsPiloto } from '@/lib/season-engine/select-descriptors';
import { PROGRAMA_JORNADA, PROGRAMA_ONBOARDING, PROGRAMA_PILOTO, PROGRAMA_REGULAR, PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const coletar = vi.fn();
vi.mock('@/lib/pipeline-fluxo/coletar', async () => {
  const real = await vi.importActual<any>('@/lib/pipeline-fluxo/coletar');
  return { ...real, coletarEntradaPrevia: (...a: any[]) => coletar(...a) };
});

import { descritoresSemPilula, filaConteudoEscopo } from '@/lib/pipeline-fluxo/conteudo';

/**
 * Corte da biblioteca (pedido do dono, 16/10/2026): descritor que ninguém do cargo vai estudar (nota ≥ 3.0, sem pílula)
 * não é gerado. O risco é o contrário do desperdício: cortar um descritor que a trilha USA faz a montagem abortar
 * ("Sem conteúdo para ..."), e rodar de novo não conserta. Por isso o teste roda os SELETORES DE VERDADE da montagem
 * sobre vários conjuntos de notas e exige que nada do que eles escolhem esteja no corte.
 */
const COMP = 'Simplicidade';
const D = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
const notas = (...ns: unknown[]) => ns.map((nota, i) => ({ descritor: D[i], nota }));

const CENARIOS: Record<string, Array<{ descritor: string; nota: unknown }>> = {
  'nenhuma lacuna': notas(3, 3.2, 3.5, 3.8, 4, 3),
  '1 lacuna': notas(1.5, 3, 3.2, 3.5, 3.8, 4),
  '2 lacunas': notas(1.5, 2.2, 3, 3.5, 3.8, 4),
  '3 lacunas': notas(1.2, 1.8, 2.5, 3.0, 3.6, 4),
  'todas com lacuna': notas(1, 1.5, 2, 2.5, 2.8, 2.9),
  'borda 2.99 e 3.0': notas(2.99, 3.0, 1.0, 3.5, 3.5, 3.5),
  'nota vazia e não numérica': notas(1.5, 2.0, null, 'x', 3.5, 3.9),
  'linhas divergentes': [...notas(1.5, 2.0, 3.5, 3.6, 3.7, 3.8), { descritor: 'd3', nota: 2.0 }],
};

/** Blueprints que a IA poderia mandar: rodando todos os descritores, e só os de nota alta (o pior caso para o corte). */
const bp = (pares: string[][]) => ({
  competencias: [],
  trilha: { semanas: pares.map((par, i) => ({ semana: i + 1, tipo: 'conteudo', competencia_foco: [COMP], descritores_foco: par })) },
});
const BLUEPRINTS = {
  rodizio: bp([['d1', 'd2'], ['d3', 'd4'], ['d5', 'd6'], ['d1', 'd2'], ['d3', 'd4'], ['d5', 'd6']]),
  'só os de nota alta': bp([['d5', 'd6'], ['d5', 'd6'], ['d4', 'd6'], ['d5', 'd4'], ['d6', 'd5'], ['d4', 'd5']]),
};

const norm = (xs: Iterable<string>) => new Set([...xs].map(normDescritor));
const naoCruza = (escolhidos: string[], corte: Set<string>) => [...norm(escolhidos)].filter((x) => corte.has(x));

describe('descritoresSemPilula nunca corta o que a montagem da trilha escolhe', () => {
  for (const [nome, ns] of Object.entries(CENARIOS)) {
    const assessment = ns as any[];
    it(`${nome}: Jornada (blueprint e fallback), Regular, DUO, Onboarding e Piloto`, () => {
      const jornada = descritoresSemPilula(ns, { modo: 'jornada', conteudosPorSemana: PROGRAMA_JORNADA.conteudosPorSemana });
      for (const b of Object.values(BLUEPRINTS)) {
        const r = blueprintToTrilhaInputs(b as any, { [COMP]: assessment }, PROGRAMA_JORNADA);
        if (!('error' in r)) expect(naoCruza(r.descritoresSelecionados.map((d) => d.descritor), jornada)).toEqual([]);
      }
      expect(naoCruza(selectDescriptors(assessment, PROGRAMA_JORNADA.slotsConteudo).map((d) => d.descritor), jornada)).toEqual([]);

      const regular = descritoresSemPilula(ns, { modo: 'regular_single', conteudosPorSemana: PROGRAMA_REGULAR.conteudosPorSemana });
      expect(naoCruza(selectDescriptors(assessment, PROGRAMA_REGULAR.slotsConteudo).map((d) => d.descritor), regular)).toEqual([]);

      const duo = descritoresSemPilula(ns, { modo: 'regular_duo', conteudosPorSemana: PROGRAMA_REGULAR_DUO.conteudosPorSemana });
      expect(naoCruza(selectDescriptorsDuo(COMP, assessment, 'Outra', [], PROGRAMA_REGULAR_DUO.slotsConteudo).map((d) => d.descritor), duo)).toEqual([]);

      const onb = descritoresSemPilula(ns, { modo: 'onboarding', conteudosPorSemana: PROGRAMA_ONBOARDING.conteudosPorSemana });
      for (const semanas of [{ 2: 0, 3: 0 }, { 2: 0, 3: 0, 4: 0 }]) {
        const sel = selectDescriptorsMulti([{ competencia: COMP, assessment }], semanas, 2.0, PROGRAMA_ONBOARDING.conteudosPorSemana);
        expect(naoCruza(sel.map((d) => d.descritor), onb)).toEqual([]);
      }

      const piloto = descritoresSemPilula(ns, { modo: 'piloto', conteudosPorSemana: PROGRAMA_PILOTO.conteudosPorSemana });
      expect(naoCruza(selectDescriptorsPiloto(COMP, assessment, PROGRAMA_PILOTO.slotsConteudo, PROGRAMA_PILOTO.conteudosPorSemana).map((d) => d.descritor), piloto)).toEqual([]);
    });
  }

  it('corta de fato quando é seguro: 2+ lacunas na Jornada tiram os de nota ≥ 3.0 (e só eles)', () => {
    expect([...descritoresSemPilula(CENARIOS['2 lacunas'], { modo: 'jornada', conteudosPorSemana: 2 })].sort()).toEqual(['d3', 'd4', 'd5', 'd6']);
    expect([...descritoresSemPilula(CENARIOS['borda 2.99 e 3.0'], { modo: 'jornada', conteudosPorSemana: 2 })].sort()).toEqual(['d2', 'd4', 'd5', 'd6']);
  });

  it('não corta: 1 lacuna só, Piloto, nota não numérica, linhas divergentes', () => {
    expect(descritoresSemPilula(CENARIOS['1 lacuna'], { modo: 'jornada', conteudosPorSemana: 2 }).size).toBe(0);
    expect(descritoresSemPilula(CENARIOS['2 lacunas'], { modo: 'piloto', conteudosPorSemana: 2 }).size).toBe(0);
    const naoNumerica = descritoresSemPilula(CENARIOS['nota vazia e não numérica'], { modo: 'jornada', conteudosPorSemana: 2 });
    expect(naoNumerica.has('d4')).toBe(false); // 'x' não é nota: fica
    const divergente = descritoresSemPilula(CENARIOS['linhas divergentes'], { modo: 'jornada', conteudosPorSemana: 2 });
    expect(divergente.has('d3')).toBe(false); // uma linha 3.5, outra 2.0: fica
  });
});

// ─── a fila: o corte do PAR é a interseção das pessoas, e falha de leitura não corta nada ───────────────────────

function bancoFalso(t: { notas?: any[]; modos?: Record<string, string | null>; sysConfig?: any; falhar?: string; pessoas?: string[] }) {
  const ids = t.pessoas ?? ['p1'];
  const tabela = (nome: string) => {
    const linhas = (): any[] => {
      if (nome === 'colaboradores') return ids.map((id) => ({ id, programa_modo: t.modos?.[id] ?? null, pref_texto: 7, pref_estudo_caso: 6 }));
      if (nome === 'competencias') return D.map((n) => ({ nome: COMP, cargo: 'CAIXA', nome_curto: n }));
      if (nome === 'descriptor_assessments') return t.notas ?? [];
      return [];
    };
    const resposta = (de = 0) => (t.falhar === nome ? { data: null, error: { message: 'boom' } } : { data: de === 0 ? linhas() : [], error: null });
    const q: any = {
      select: () => q, in: () => q, not: () => q, eq: () => q, is: () => q, order: () => q,
      range: (de: number) => Promise.resolve(resposta(de)),
      maybeSingle: () => Promise.resolve(t.falhar === nome ? { data: null, error: { message: 'boom' } } : { data: nome === 'empresas' ? { sys_config: t.sysConfig ?? {} } : null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(resposta(0)).then(res, rej),
    };
    return q;
  };
  return { from: tabela, raw: { from: tabela } };
}
const entrada = (ids: string[]) => ({
  pessoas: ids.map((id) => ({ id, nome: id, cargo: 'CAIXA', focoIndividual: [COMP] })),
  cargos: [{ nome: 'CAIXA', foco: [], top5: 6 }],
  respostas: [], filaIA4: [],
  assessments: ids.map((id) => ({ colaborador_id: id, competencia: COMP })),
  blueprints: ids.map((id) => ({ colaborador_id: id, auditado: true })), pdis: ids, trilhas: [],
  regraFoco: 'menor_nota',
});
const linhasDe = (id: string, ns: unknown[]) => ns.map((nota, i) => ({ id: `${id}-${i}`, colaborador_id: id, competencia: COMP, descritor: D[i], nota }));
const descritoresNaFila = (itens: any[]) => [...new Set(itens.map((i) => i.descritor))].sort();

beforeEach(() => coletar.mockReset());

describe('filaConteudoEscopo com o corte', () => {
  it('o caso da Marisa: o descritor em N3 sai da fila, os outros 5 ficam', async () => {
    coletar.mockResolvedValue({ entrada: entrada(['p1']) });
    const banco = bancoFalso({ notas: linhasDe('p1', [1.2, 1.5, 2.0, 2.2, 2.5, 3.0]) });
    const itens = await filaConteudoEscopo(banco, { permitidos: null, empresaId: 'e1' });
    expect(descritoresNaFila(itens)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
  });

  it('basta UMA pessoa do par precisar do descritor para ele ficar', async () => {
    coletar.mockResolvedValue({ entrada: entrada(['p1', 'p2']) });
    const banco = bancoFalso({ pessoas: ['p1', 'p2'], notas: [...linhasDe('p1', [1.2, 1.5, 2.0, 2.2, 2.5, 3.0]), ...linhasDe('p2', [1.2, 1.5, 3.5, 3.5, 3.5, 2.0])] });
    expect(descritoresNaFila(await filaConteudoEscopo(banco, { permitidos: null, empresaId: 'e1' }))).toEqual(D);
  });

  it('pessoa no Piloto (pela config da empresa) não tem corte', async () => {
    coletar.mockResolvedValue({ entrada: entrada(['p1']) });
    const banco = bancoFalso({ notas: linhasDe('p1', [1.2, 1.5, 2.0, 2.2, 2.5, 3.0]), sysConfig: { programa_modo: 'piloto' } });
    expect(descritoresNaFila(await filaConteudoEscopo(banco, { permitidos: null, empresaId: 'e1' }))).toEqual(D);
  });

  it('falha ao ler as notas, o programa ou a empresa: a biblioteca sai completa, sem lançar', async () => {
    for (const falhar of ['descriptor_assessments', 'empresas', 'turma_membros']) {
      coletar.mockResolvedValue({ entrada: entrada(['p1']) });
      const banco = bancoFalso({ notas: linhasDe('p1', [1.2, 1.5, 2.0, 2.2, 2.5, 3.0]), falhar });
      expect(descritoresNaFila(await filaConteudoEscopo(banco, { permitidos: null, empresaId: 'e1' }))).toEqual(D);
    }
  });

  it('sem empresaId, a fila é a de antes (todos os descritores)', async () => {
    coletar.mockResolvedValue({ entrada: entrada(['p1']) });
    const banco = bancoFalso({ notas: linhasDe('p1', [1.2, 1.5, 2.0, 2.2, 2.5, 3.0]) });
    expect(descritoresNaFila(await filaConteudoEscopo(banco, { permitidos: null }))).toEqual(D);
  });
});
