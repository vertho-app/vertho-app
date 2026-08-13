import { describe, it, expect } from 'vitest';
import { coletarHorizonteKits } from '@/lib/pipeline-health/coleta';
import { checarHorizonteKits } from '@/lib/pipeline-health/regras';

/**
 * O horizonte de kits com DUAS safras no mesmo tenant.
 *
 * O defeito que estes testes travam é específico e tinha duas metades que se
 * agravavam:
 *   1. A JANELA vinha do máximo global de `semana_atual` — com diretores na
 *      semana 5 e professores na 1, ela virava [6, …] e as semanas 2-4 dos
 *      professores nunca eram olhadas. A turma nova ficava INVISÍVEL.
 *   2. A DATA vinha do mínimo global de `data_inicio` — a demanda da turma nova
 *      era datada pela âncora da antiga.
 *
 * Cenário: Ibipeba-like. Turma A começou em 06/07 e está na semana 5; turma B
 * começou em 10/08 e está na semana 1. Hoje = 13/08/2026.
 */

const EMP = 'emp-1';
const HOJE = new Date('2026-08-13T12:00:00Z');

type Linha = Record<string, any>;

function sbFake(dados: {
  envios: Linha[]; turmas: Linha[]; membros: Linha[];
  colaboradores: Linha[]; trilhas: Linha[]; briefs?: Linha[]; kits?: Linha[];
}) {
  return {
    from(tabela: string) {
      const filtros: Record<string, any> = {};
      let inFiltro: { coluna: string; valores: any[] } | null = null;
      const fonte = (): Linha[] => {
        switch (tabela) {
          case 'fase4_envios': return dados.envios;
          case 'turmas': return dados.turmas;
          case 'turma_membros': return dados.membros;
          case 'colaboradores': return dados.colaboradores;
          case 'trilhas': return dados.trilhas;
          case 'kit_briefs': return dados.briefs || [];
          case 'kits': return dados.kits || [];
          default: return [];
        }
      };
      const linhas = () => {
        let base = fonte().filter((row) => Object.entries(filtros).every(([k, v]) => row[k] === v));
        if (inFiltro) base = base.filter((r) => inFiltro!.valores.includes(r[inFiltro!.coluna]));
        return base;
      };
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => { filtros[c] = v; return api; },
        in: (c: string, v: any[]) => { inFiltro = { coluna: c, valores: v }; return api; },
        or: () => api,
        order: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data: linhas(), error: null }),
      };
      return api;
    },
  };
}

/** Uma semana de conteúdo do `temporada_plano`. */
const semana = (n: number, descritor: string) => ({
  semana: n, tipo: 'conteudo', descritor,
});

const CENARIO = {
  envios: [
    { colaborador_id: 'a1', semana_atual: 5, empresa_id: EMP, status: 'ativo' },
    { colaborador_id: 'b1', semana_atual: 1, empresa_id: EMP, status: 'ativo' },
  ],
  turmas: [
    { id: 't-a', nome: 'Diretores 2026.1', empresa_id: EMP, status: 'em_jornada' },
    { id: 't-b', nome: 'Professores 2026.2', empresa_id: EMP, status: 'em_jornada' },
  ],
  membros: [
    { colaborador_id: 'a1', turma_id: 't-a', empresa_id: EMP, status: 'ativo' },
    { colaborador_id: 'b1', turma_id: 't-b', empresa_id: EMP, status: 'ativo' },
  ],
  colaboradores: [
    { id: 'a1', empresa_id: EMP, perfil_dominante: 'D', cargo: 'Diretor' },
    { id: 'b1', empresa_id: EMP, perfil_dominante: 'I', cargo: 'Professor' },
  ],
  trilhas: [
    {
      colaborador_id: 'a1', empresa_id: EMP, competencia_foco: 'Gestão', criado_em: '2026-07-01',
      data_inicio: '2026-07-06',
      temporada_plano: [semana(6, 'D6-planeja'), semana(7, 'D7-avalia')],
    },
    {
      colaborador_id: 'b1', empresa_id: EMP, competencia_foco: 'Didática', criado_em: '2026-08-01',
      data_inicio: '2026-08-10',
      temporada_plano: [semana(2, 'D2-conduz'), semana(3, 'D3-media')],
    },
  ],
};

describe('horizonte de kits com duas turmas', () => {
  it('🔴 a turma ATRASADA aparece — antes a janela global a apagava', async () => {
    const sb = sbFake(CENARIO);
    const lacunas = await coletarHorizonteKits(sb, EMP, 3, HOJE);

    const turmas = new Set(lacunas.map((l) => l.turma));
    expect(turmas.has('Professores 2026.2')).toBe(true);
    expect(turmas.has('Diretores 2026.1')).toBe(true);

    // A demanda dos professores é a semana 2 — com a janela global (máx=5) ela
    // ficaria fora de [6,8] e ninguém saberia que falta kit.
    const doB = lacunas.filter((l) => l.turma === 'Professores 2026.2');
    expect(doB.map((l) => l.semana).sort()).toEqual([2, 3]);
  });

  it('🔴 cada turma é datada pela PRÓPRIA âncora', async () => {
    const sb = sbFake(CENARIO);
    const lacunas = await coletarHorizonteKits(sb, EMP, 3, HOJE);

    // Turma B começou 10/08; semana 2 abre em 17/08 → 4 dias a partir de 13/08.
    const b2 = lacunas.find((l) => l.turma === 'Professores 2026.2' && l.semana === 2)!;
    expect(b2.diasAte).toBe(4);

    // Turma A começou 06/07; semana 6 abre em 10/08 → JÁ ABRIU (negativo).
    const a6 = lacunas.find((l) => l.turma === 'Diretores 2026.1' && l.semana === 6)!;
    expect(a6.diasAte).toBe(-3);

    // Com a âncora global (mín = 06/07), a semana 2 de B daria 06/07+7 = 13/07,
    // ou seja −31 dias: "vencida há um mês" para conteúdo que abre semana que vem.
    expect(b2.diasAte).not.toBe(-31);
  });

  it('quem tem envio ativo e NENHUMA turma não some do alarme', async () => {
    const sb = sbFake({
      ...CENARIO,
      envios: [...CENARIO.envios, { colaborador_id: 'orfao', semana_atual: 1, empresa_id: EMP, status: 'ativo' }],
      colaboradores: [...CENARIO.colaboradores, { id: 'orfao', empresa_id: EMP, perfil_dominante: 'S', cargo: 'Professor' }],
      trilhas: [...CENARIO.trilhas, {
        colaborador_id: 'orfao', empresa_id: EMP, competencia_foco: 'Didática', criado_em: '2026-08-01',
        data_inicio: '2026-08-10', temporada_plano: [semana(2, 'D2-conduz')],
      }],
    });
    const lacunas = await coletarHorizonteKits(sb, EMP, 3, HOJE);
    expect(lacunas.some((l) => l.turma === 'sem turma')).toBe(true);
  });

  it('empresa SEM turmas se comporta como antes (uma varredura, sem rótulo)', async () => {
    const sb = sbFake({ ...CENARIO, turmas: [], membros: [] });
    const lacunas = await coletarHorizonteKits(sb, EMP, 3, HOJE);
    expect(lacunas.length).toBeGreaterThan(0);
    expect(lacunas.every((l) => !l.turma)).toBe(true);
    // Janela única a partir do máximo (5) → só as semanas 6 e 7 entram.
    expect([...new Set(lacunas.map((l) => l.semana))].sort()).toEqual([6, 7]);
  });

  it('turma ARQUIVADA não gera recorte', async () => {
    const sb = sbFake({
      ...CENARIO,
      turmas: [CENARIO.turmas[0], { ...CENARIO.turmas[1], status: 'arquivada' }],
    });
    const lacunas = await coletarHorizonteKits(sb, EMP, 3, HOJE);
    // B some como turma; o envio dela vira órfão e NÃO é engolido em silêncio.
    expect(lacunas.some((l) => l.turma === 'Professores 2026.2')).toBe(false);
    expect(lacunas.some((l) => l.turma === 'sem turma')).toBe(true);
  });
});

describe('rótulo do achado', () => {
  const base = { competencia: 'Gestão', descritor: 'D6', cargo: 'Diretor', faltantes: ['D'], pessoas: 3 };

  it('cita a turma quando há mais de uma no lote', () => {
    const achados = checarHorizonteKits([
      { ...base, semana: 6, diasAte: 3, turma: 'Diretores 2026.1' },
      { ...base, semana: 2, diasAte: 4, turma: 'Professores 2026.2' },
    ]);
    const amostra = achados[0].amostra as string[];
    expect(amostra.join(' ')).toContain('[Diretores 2026.1]');
    expect(amostra.join(' ')).toContain('[Professores 2026.2]');
  });

  it('NÃO polui o rótulo em cliente de uma turma só', () => {
    const achados = checarHorizonteKits([{ ...base, semana: 6, diasAte: 3, turma: 'Turma inicial' }]);
    const amostra = achados[0].amostra as string[];
    expect(amostra[0]).not.toContain('[');
  });
});
