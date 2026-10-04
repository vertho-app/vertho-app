import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-28 (revisão de 02/10/2026): o PDF do PDI SEM blueprint dizia "Uma jornada de
 * 14 semanas" e desenhava a linha do tempo de 14, também para quem está na
 * Jornada de 7. Medido em 03/10/2026: 15 dos 171 PDIs não têm a duração gravada.
 *
 * Duas pontas:
 *  - na GERAÇÃO, `conteudo.total_semanas` é gravado pela fonte única de duração
 *    (a trilha da pessoa, ou o programa que uma geração nova aplicaria, turma
 *    inclusive). Com blueprint, o número é o do mapa dele e nada é gravado;
 *  - no PDF, sem `total_semanas` e sem mapa NÃO há número: o `14` de fallback sai.
 *
 * Validado por mutação (ver o relatório): tirar a gravação de `total_semanas` em
 * `individual-core` derruba os casos de persistência; voltar o `: null` do PDF para
 * `: 14` derruba os casos do documento.
 */

const h = vi.hoisted(() => ({ sb: null as any, callAI: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'gpt-auditor', DEFAULT_TASK_MODELS: {} }));
vi.mock('@react-pdf/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: async () => null,
}));

import { buildRelatorioIndividualPrompt, duracaoDoProgramaDaPessoa } from '@/lib/relatorio-individual-prompt';
import { persistRelatorioIndividualFromText } from '@/lib/relatorios/individual-core';
import RelatorioIndividualPDF, { montarTrilhaFasesPdi } from '@/components/pdf/RelatorioIndividual';
import { derivarConfigCustom } from '@/lib/season-engine/programa-custom';

const COLAB = { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professor(a)', email: 'ana@escola.gov.br', programa_modo: null as string | null, perfil_dominante: 'C', d_natural: 20, i_natural: 30, s_natural: 60, c_natural: 90 };
const COMP = 'Autocuidado e bem-estar profissional';
const SNAPSHOT_IBIPEBA = {
  modo: 'regular', semanas: 9, arguicao: { ativa: true, maxTurnos: 8 }, nivelMetaAlvo: 3,
  semanasMissao: [4], slotsConteudo: [1, 2, 3, 5, 6, 7], blocosCobertos: { 4: 3 }, semanaCenarioB: 9,
  complexidadeMap: { 4: 'simples' }, numCompetencias: 2, semanaAcumulada: 8, semanasAvaliacao: [8, 9],
  conteudosPorSemana: 2, desafioUnicoPorCompetencia: true,
};

let trilha: any;
let blueprint: any;
let sysConfigEmpresa: any;
let membros: any[];
let turmas: any[];

function montar() {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => ({
      colaboradores: COLAB,
      empresas: { nome: 'Rede Municipal', segmento: 'educacao', sys_config: sysConfigEmpresa },
      cargos_empresa: { top5_workshop: [COMP], competencia_foco: COMP, competencias_foco: [COMP] },
      trilhas: trilha,
      development_blueprints: blueprint ? { blueprint } : null,
      // `carregarParticipacaoAtiva` lê a participação e a turma por `maybeSingle`.
      turma_membros: membros[0] ? { id: 'm1', ...membros[0] } : null,
      turmas: turmas[0] ? { nome: 'Safra', data_inicio: null, status: 'ativa', ...turmas[0] } : null,
    } as Record<string, any>)[tabela] ?? null,
    lista: (tabela: string) => {
      if (tabela === 'respostas') {
        return [{
          competencia_nome: COMP, colaborador_id: 'c1', cenario_id: null, r1: 'Conversaria antes.',
          avaliacao_ia: { consolidacao: { nivel_geral: 2, media_descritores: 2.2 }, feedback: { resumo_geral: 'Priorizou a turma.' } },
          nivel_ia4: 2, nota_ia4: 2.2,
        }];
      }
      return [];
    },
  });
}

beforeEach(() => {
  h.callAI.mockReset();
  h.callAI.mockResolvedValue(JSON.stringify({ achados: [] }));
  trilha = null;
  blueprint = null;
  sysConfigEmpresa = {};
  membros = [];
  turmas = [];
  montar();
});

const texto = JSON.stringify({
  acolhimento: 'Ana, este plano é seu.',
  perfil_comportamental: { descricao: 'Seu perfil combina análise e cuidado.' },
  competencias: [{ nome: COMP, feedback: 'Você propôs conversar antes.' }],
  resumo_desempenho: [{ competencia: COMP, leitura: 'Nas respostas, você conversou antes.' }],
});

const totalGravado = async () => {
  const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
  expect(built.error, built.error).toBeUndefined();
  const r = await persistRelatorioIndividualFromText(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1', texto, built });
  expect(r.success, r.error).toBe(true);
  return { built, conteudo: h.sb.escritas.find((e: any) => e.tabela === 'relatorios').payload.conteudo };
};

describe('geração: o PDI sem blueprint grava a duração do programa da pessoa', () => {
  it('quem tem trilha na Jornada: 7', async () => {
    trilha = { competencia_foco: COMP, competencias_foco: [COMP], programa_modo: 'jornada', programa_config: null };
    montar();
    const { built, conteudo } = await totalGravado();
    expect(built.duracaoSemanas).toBe(7);
    expect(conteudo.total_semanas).toBe(7);
  });

  it('🔴 quem está no programa encerrado da Ibipeba (regular_duo, snapshot de 9): 9, e não 14', async () => {
    trilha = { competencia_foco: COMP, competencias_foco: [COMP], programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA };
    montar();
    const { conteudo } = await totalGravado();
    expect(conteudo.total_semanas).toBe(9);
  });

  it('o Personalizado grava as semanas do snapshot da trilha', async () => {
    const cfg = JSON.parse(JSON.stringify(derivarConfigCustom({ semanas: 4, numCompetencias: 1, fechamento: true })));
    trilha = { competencia_foco: COMP, competencias_foco: [COMP], programa_modo: 'custom', programa_config: cfg };
    montar();
    const { conteudo } = await totalGravado();
    expect(conteudo.total_semanas).toBe(5);
  });

  it('sem trilha ainda: o programa que a geração aplicaria (empresa sem formato nasce na Jornada)', async () => {
    const { conteudo } = await totalGravado();
    expect(conteudo.total_semanas).toBe(7);
  });

  it('sem trilha, na empresa em Onboarding: 10', async () => {
    sysConfigEmpresa = { programa_modo: 'onboarding' };
    montar();
    const { conteudo } = await totalGravado();
    expect(conteudo.total_semanas).toBe(10);
  });

  it('🔴 sem trilha, a TURMA decide: empresa na Jornada e turma no Personalizado de 3 semanas', async () => {
    sysConfigEmpresa = { programa_modo: 'jornada', programa_custom: { semanas: 3, numCompetencias: 1, fechamento: false } };
    membros = [{ colaborador_id: 'c1', turma_id: 't1', config_override: {} }];
    turmas = [{ id: 't1', sys_config: { programa_modo: 'custom' } }];
    montar();
    const { conteudo } = await totalGravado();
    expect(conteudo.total_semanas).toBe(3);
  });

  it('o override da pessoa vale sobre a empresa quando a turma não diz o formato', async () => {
    sysConfigEmpresa = { programa_modo: 'jornada' };
    COLAB.programa_modo = 'onboarding';
    montar();
    try {
      const { conteudo } = await totalGravado();
      expect(conteudo.total_semanas).toBe(10);
    } finally {
      COLAB.programa_modo = null;
    }
  });

  it('com blueprint nada é gravado: a duração é a do mapa da trilha dele', async () => {
    blueprint = { competencias: [{ nome: COMP, objetivos_30_dias: [] }], trilha: { semanas: [{ semana: 1, conexao_com_pdi: ['x'] }] } };
    montar();
    const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.error, built.error).toBeUndefined();
    expect(built.duracaoSemanas).toBeNull();
  });
});

describe('duracaoDoProgramaDaPessoa', () => {
  it('🔴 falha ao ler a turma NÃO derruba o PDI: devolve null e o PDF omite o número', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    const semanas = await duracaoDoProgramaDaPessoa(h.sb.client as any, {
      empresaId: 'e1', colaboradorId: 'c1', sysConfigEmpresa: {}, trilha: null,
    });
    expect(semanas).toBeNull();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('a trilha que existe responde sem ir ao banco', async () => {
    const sbSemBanco: any = { from: () => { throw new Error('não deveria ir ao banco'); } };
    expect(await duracaoDoProgramaDaPessoa(sbSemBanco, {
      empresaId: 'e1', colaboradorId: 'c1', trilha: { programa_modo: 'jornada', programa_config: null },
    })).toBe(7);
  });
});

/** Todo texto de uma árvore de elementos React (sem renderizar PDF): children e props de texto. */
function textos(no: any, acc: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return acc;
  if (typeof no === 'string' || typeof no === 'number') { acc.push(String(no)); return acc; }
  if (Array.isArray(no)) { no.forEach((n) => textos(n, acc)); return acc; }
  if (typeof no === 'object' && 'props' in no) {
    for (const [k, v] of Object.entries(no.props || {})) {
      if (k === 'children') textos(v, acc);
      else if (typeof v === 'string') acc.push(v);
    }
  }
  return acc;
}

describe('o documento: sem a duração, não há número', () => {
  const comps = [{ nome: 'Comunicação', sprint: { acao_principal: 'preparar a conversa' } }, { nome: 'Liderança' }];
  const doc = (conteudo: any) => textos(RelatorioIndividualPDF({
    data: { conteudo: { competencias: comps, ...conteudo }, colaborador_nome: 'Ana Souza' },
  }) as any).join('\n');

  it('🔴 sem `total_semanas` e sem mapa: nenhuma "14 semanas" no PDF', () => {
    const tudo = doc({ competencias: comps.map((c) => ({ ...c, sprint: c.sprint })) });
    expect(tudo).not.toMatch(/14 semanas/);
    expect(tudo).not.toMatch(/Uma jornada de/);
    expect(tudo).toMatch(/Na sua trilha você trabalha uma competência por vez/);
  });

  it('com `total_semanas` gravado, o número do programa da pessoa', () => {
    const tudo = doc({ total_semanas: 7 });
    expect(tudo).toContain('Uma jornada de 7 semanas de aprendizagem');
    expect(tudo).not.toMatch(/14 semanas/);
  });

  it('com o mapa do blueprint, o número do mapa (comportamento de antes)', () => {
    const tudo = doc({ trilha_mapa: { semanas: [{ semana: 1 }, { semana: 9 }] } });
    expect(tudo).toContain('Uma jornada de 9 semanas de aprendizagem');
  });
});

describe('a linha do tempo de fallback só desenha semanas onde há desenho', () => {
  const comps = [
    { nome: 'Negociação', sprint: { acao_principal: 'preparar concessões' } },
    { nome: 'Orientação a resultados' },
  ];

  it('Jornada de 7 e formato de 14 seguem como eram', () => {
    expect(montarTrilhaFasesPdi(comps, 7).map((f) => f.fase)).toEqual(['Semanas 1\u20136', 'Semana 7', 'Próxima jornada']);
    expect(montarTrilhaFasesPdi(comps, 14).map((f) => f.fase)).toEqual(['Semanas 1\u20134', 'Semanas 5\u20138', 'Semanas 9\u201312', 'Semanas 13\u201314']);
  });

  it.each([null, 9, 10, 3])('🔴 duração %s: ciclos sem número de semana, nunca o desenho de 14', (total) => {
    const fases = montarTrilhaFasesPdi(comps, total as any);
    expect(fases.map((f) => f.fase)).toEqual(['Ciclo 1', 'Ciclo 2']);
    expect(JSON.stringify(fases)).not.toMatch(/Semanas?\s\d|14/);
    expect(fases[0].detalhe).toContain('preparar concessões');
  });

  it('sem competências não há linha do tempo', () => {
    expect(montarTrilhaFasesPdi([], null)).toEqual([]);
  });
});

describe('a construção do PDI não engole falha de leitura (guard E11)', () => {
  it.each([
    ['trilhas', /Falha ao ler a trilha da pessoa/],
    ['colaboradores', /Falha ao ler o colaborador/],
    ['empresas', /Falha ao ler a empresa/],
  ])('falha ao ler %s volta como erro, não como PDI sem o dado', async (tabela, esperado) => {
    h.sb.falharEm({ tabela, op: 'select', mensagem: 'timeout no pool' });
    const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.error).toMatch(esperado);
    expect(built.user).toBeUndefined();
  });

  it('colaborador inexistente (PGRST116 do .single()) segue sendo "não encontrado"', async () => {
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' });
    const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.error).toBe('Colaborador não encontrado');
  });
});
