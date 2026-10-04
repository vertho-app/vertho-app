import { describe, it, expect } from 'vitest';
import { checarCenarioBHorizonte, CENARIO_B_CRITICO_DIAS, type LacunaCenarioB } from '@/lib/pipeline-health/regras';
import { coletarCenarioBHorizonte } from '@/lib/pipeline-health/coleta';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { semanaLiberadaEm } from '@/lib/season-engine/week-gating';

// R21 nasceu de um caso real (18/09/2026): Macaé com 38 diretores a 10 dias da
// semana 7 e 0 Cenários B no tenant, sem nada no sistema apontando.

const lacuna = (diasAte: number, pessoas = 1, cargo = 'Diretor(a) Escolar'): LacunaCenarioB => ({
  cargo, competencias: ['GERENCIAMENTO DE CONFLITOS'], pessoas, diasAte, semana: 7,
});

describe('R21 checarCenarioBHorizonte (regra pura)', () => {
  it(`a ${CENARIO_B_CRITICO_DIAS} dias ou menos é crítico e conta PESSOAS`, () => {
    const achados = checarCenarioBHorizonte([lacuna(10, 38)]);
    expect(achados).toHaveLength(1);
    expect(achados[0].id).toBe('cenario-b-horizonte-urgente');
    expect(achados[0].severidade).toBe('critico');
    expect(achados[0].contagem).toBe(38);
  });

  it('semana já aberta pelo calendário continua crítica', () => {
    expect(checarCenarioBHorizonte([lacuna(-3, 2)])[0].severidade).toBe('critico');
  });

  it('além do corte é aviso', () => {
    const achados = checarCenarioBHorizonte([lacuna(20, 5)]);
    expect(achados.map((a) => a.id)).toEqual(['cenario-b-horizonte-proximo']);
    expect(achados[0].severidade).toBe('aviso');
  });

  it('sem lacuna não vira achado (0 nunca é ruído)', () => {
    expect(checarCenarioBHorizonte([])).toEqual([]);
  });

  it('a amostra mostra primeiro o que vence primeiro', () => {
    const [urgente] = checarCenarioBHorizonte([lacuna(12, 1, 'B'), lacuna(3, 1, 'A')]);
    expect(urgente.amostra?.[0]).toContain('A');
  });
});

describe('R21 coletarCenarioBHorizonte (coleta)', () => {
  const HOJE = new Date('2026-09-18T12:00:00Z');
  const plano7 = [...[1, 2, 3, 4, 5, 6].map((semana) => ({ semana, tipo: 'conteudo' })), { semana: 7, tipo: 'avaliacao' }];
  const TRILHAS = [
    // semana 7 abre em 28/09: 10 dias
    { id: 't1', colaborador_id: 'd1', competencia_foco: 'GERENCIAMENTO DE CONFLITOS', competencias_foco: ['GERENCIAMENTO DE CONFLITOS'], temporada_plano: plano7, data_inicio: '2026-08-17' },
    // mesma célula, abre em 05/10: 17 dias
    { id: 't2', colaborador_id: 'd2', competencia_foco: 'GERENCIAMENTO DE CONFLITOS', competencias_foco: ['GERENCIAMENTO DE CONFLITOS'], temporada_plano: plano7, data_inicio: '2026-08-24' },
    // professores: abre em 19/10, 31 dias, fora da janela de 28
    { id: 't3', colaborador_id: 'p1', competencia_foco: 'Autocuidado e bem-estar profissional', competencias_foco: ['Autocuidado e bem-estar profissional'], temporada_plano: plano7, data_inicio: '2026-09-07' },
    // fechamento já aberto com B gravado no slot
    { id: 't4', colaborador_id: 'd3', competencia_foco: 'GERENCIAMENTO DE CONFLITOS', competencias_foco: ['GERENCIAMENTO DE CONFLITOS'], temporada_plano: plano7, data_inicio: '2026-08-17' },
  ];
  const COLABS = [
    { id: 'd1', cargo: 'Diretor(a) Escolar' }, { id: 'd2', cargo: 'Diretor(a) Escolar' },
    { id: 'd3', cargo: 'Diretor(a) Escolar' }, { id: 'p1', cargo: 'Professor(a)' },
  ];
  const mock = (bRows: any[] = [], comps: any[] = []) => criarSupabaseMock({
    lista: (tabela) => ({
      trilhas: TRILHAS,
      temporada_semana_progresso: [{ trilha_id: 't4' }],
      colaboradores: COLABS,
      banco_cenarios: bRows,
      competencias: comps,
    } as Record<string, any[]>)[tabela] ?? [],
  });

  it('Macaé: a célula dos diretores aparece com 2 pessoas e 10 dias; professores fora da janela; slot gravado fora', async () => {
    const lacunas = await coletarCenarioBHorizonte(mock().client, 'emp', 28, HOJE);
    expect(lacunas).toEqual([
      { cargo: 'Diretor(a) Escolar', competencias: ['GERENCIAMENTO DE CONFLITOS'], pessoas: 2, diasAte: 10, semana: 7 },
    ]);
  });

  it('com o B da competência gerado, a lacuna some (mesma régua do fechamento)', async () => {
    const b = {
      id: 'b1', titulo: 't', descricao: 'd', cargo: 'Diretor(a) Escolar', competencia_id: 'c007',
      created_at: '2026-09-20T00:00:00Z', alternativas: { p1: 'x' },
    };
    const lacunas = await coletarCenarioBHorizonte(mock([b], [{ id: 'c007', nome: 'Gerenciamento de Conflitos' }]).client, 'emp', 28, HOJE);
    expect(lacunas).toEqual([]);
  });

  it('não grava degradação: é um check, não o fechamento', async () => {
    const sb = mock();
    await coletarCenarioBHorizonte(sb.client, 'emp', 28, HOJE);
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });

  it('filtra pelo tenant em todas as leituras', async () => {
    const sb = mock();
    await coletarCenarioBHorizonte(sb.client, 'emp', 28, HOJE);
    for (const tabela of ['trilhas', 'temporada_semana_progresso', 'colaboradores', 'banco_cenarios']) {
      expect(sb.usou(tabela, 'eq', 'empresa_id'), tabela).toBe(true);
    }
  });

  it('erro de leitura LANÇA (o horizonte registra "check falhou"), não vira "sem lacuna"', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'pool esgotado' });
    await expect(coletarCenarioBHorizonte(sb.client, 'emp', 28, HOJE)).rejects.toThrow(/pool esgotado/);
  });
});

// ── ONBOARDING (04/10/2026): o fechamento serve um B por competência ───────────
describe('R21 coletarCenarioBHorizonte: o Onboarding vira uma célula por competência', () => {
  const HOJE = new Date('2026-09-18T12:00:00Z');
  const COMPS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
  const plano12 = [
    { semana: 1, tipo: 'mapeamento' },
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((semana) => ({ semana, tipo: 'conteudo' })),
    { semana: 12, tipo: 'avaliacao' },
  ];
  // a semana 12 abre em 28/09 às 06:00 UTC (o helper de calendário da semana): ~10 dias
  const onb = (id: string, colaborador_id: string, extra: Record<string, unknown> = {}) => ({
    id, colaborador_id, competencia_foco: COMPS[0], competencias_foco: COMPS, temporada_plano: plano12,
    data_inicio: '2026-07-13', programa_modo: 'onboarding', ...extra,
  });
  const COLABS = [{ id: 'p1', cargo: 'Professor' }, { id: 'p2', cargo: 'Professor' }];
  const compsDoBanco = COMPS.map((nome, i) => ({ id: `c${i}`, nome }));
  const bDe = (i: number) => ({
    id: `b${i}`, titulo: 't', descricao: 'd', cargo: 'Professor', competencia_id: `c${i}`,
    created_at: '2026-09-10T00:00:00Z', alternativas: { p1: 'x', p2: 'y', p3: 'z', p4: 'w' },
  });
  const mock = (trilhas: any[], bRows: any[] = [], comNoSlot: any[] = []) => criarSupabaseMock({
    lista: (tabela) => ({
      trilhas, temporada_semana_progresso: comNoSlot, colaboradores: COLABS, banco_cenarios: bRows, competencias: compsDoBanco,
    } as Record<string, any[]>)[tabela] ?? [],
  });

  it('sem nenhum B: cada competência é uma lacuna própria (o alarme diz QUAL falta), com as pessoas e os dias', async () => {
    const lacunas = await coletarCenarioBHorizonte(mock([onb('t1', 'p1'), onb('t2', 'p2')]).client, 'emp', 28, HOJE);
    expect(lacunas.map((l) => l.competencias)).toEqual(COMPS.map((c) => [c]));
    expect(lacunas.every((l) => l.pessoas === 2 && l.diasAte === 10 && l.semana === 12 && l.cargo === 'Professor')).toBe(true);
  });

  it('com o B de 3 das 5 competências, só as 2 que faltam aparecem (a mesma régua do fechamento)', async () => {
    const lacunas = await coletarCenarioBHorizonte(mock([onb('t1', 'p1')], [bDe(0), bDe(1), bDe(2)]).client, 'emp', 28, HOJE);
    expect(lacunas.map((l) => l.competencias)).toEqual([['Comp D'], ['Comp E']]);
  });

  it('o rótulo do alarme nomeia a competência que falta, na ordem da trilha', async () => {
    const lacunas = await coletarCenarioBHorizonte(mock([onb('t1', 'p1')], [bDe(0), bDe(1), bDe(2)]).client, 'emp', 28, HOJE);
    const [urgente] = checarCenarioBHorizonte(lacunas);
    expect(urgente.contagem).toBe(2);
    expect(urgente.amostra).toEqual([
      '10d · sem12 · Professor · Comp D · 1p',
      '10d · sem12 · Professor · Comp E · 1p',
    ]);
  });

  it('as 5 com B: nenhuma lacuna', async () => {
    expect(await coletarCenarioBHorizonte(mock([onb('t1', 'p1')], COMPS.map((_, i) => bDe(i))).client, 'emp', 28, HOJE)).toEqual([]);
  });

  it('fechamento já aberto com os cenários gravados no slot (`feedback.cenarios`): fica de fora, e a leitura existe', async () => {
    // só a leitura de `feedback->cenarios` devolve a trilha: apagar essa leitura (ou não
    // somar o resultado dela) faria a trilha com os 5 cenários já gravados voltar a acusar lacuna
    const sb = criarSupabaseMock({
      lista: (tabela, _cols, cadeia) => {
        if (tabela === 'temporada_semana_progresso') {
          return cadeia.some((c) => c.metodo === 'not' && c.args[0] === 'feedback->cenarios') ? [{ trilha_id: 't1' }] : [];
        }
        return ({ trilhas: [onb('t1', 'p1')], colaboradores: COLABS, banco_cenarios: [], competencias: compsDoBanco } as Record<string, any[]>)[tabela] ?? [];
      },
    });
    expect(await coletarCenarioBHorizonte(sb.client, 'emp', 28, HOJE)).toEqual([]);
    expect(sb.chamadas.some((c) => c.tabela === 'temporada_semana_progresso' && c.metodo === 'not' && c.args[0] === 'feedback->cenarios')).toBe(true);
    expect(sb.chamadas.some((c) => c.tabela === 'temporada_semana_progresso' && c.metodo === 'not' && c.args[0] === 'feedback->>cenario_b_id')).toBe(true);
  });

  it('erro ao ler os cenários gravados LANÇA, não vira "sem lacuna"', async () => {
    const sb = mock([onb('t1', 'p1')]);
    sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'pool esgotado' });
    await expect(coletarCenarioBHorizonte(sb.client, 'emp', 28, HOJE)).rejects.toThrow(/pool esgotado/);
  });

  it('o DUO de Ibipeba (2 competências) e a Jornada seguem como UMA célula, como sempre', async () => {
    const duo = { ...onb('t1', 'p1'), competencias_foco: ['Comp A', 'Comp B'], programa_modo: 'regular_duo' };
    const jornada = { ...onb('t2', 'p2'), competencias_foco: ['Comp C'], competencia_foco: 'Comp C', programa_modo: 'jornada' };
    const lacunas = await coletarCenarioBHorizonte(mock([duo, jornada]).client, 'emp', 28, HOJE);
    expect(lacunas.map((l) => l.competencias)).toEqual([['Comp A', 'Comp B'], ['Comp C']]);
  });

  it('a data de abertura vem do helper de calendário da semana (semanaLiberadaEm), não de (semana-1)*7 à mão', async () => {
    const aberturaDoHelper = semanaLiberadaEm('2026-07-13', 12)!;
    const esperado = Math.round((aberturaDoHelper.getTime() - HOJE.getTime()) / 86400_000);
    const [l] = await coletarCenarioBHorizonte(mock([onb('t1', 'p1')]).client, 'emp', 28, HOJE);
    expect(l.diasAte).toBe(esperado);
    // o helper abre a semana às 06:00 UTC; à mão (00:00 UTC) seriam 9,4 dias e arredondaria para 9
    const aMeioDoDia = new Date('2026-09-18T14:24:00Z');
    const [m] = await coletarCenarioBHorizonte(mock([onb('t1', 'p1')]).client, 'emp', 28, aMeioDoDia);
    expect(m.diasAte).toBe(10);
  });

  it('slot com calendário espelhado (o fechamento do piloto herda o da semana 2): conta pela semana que o governa', async () => {
    const piloto = {
      id: 't9', colaborador_id: 'p1', competencia_foco: 'Comp A', competencias_foco: ['Comp A'], programa_modo: 'piloto',
      temporada_plano: [{ semana: 1, tipo: 'conteudo' }, { semana: 2, tipo: 'conteudo' }, { semana: 3, tipo: 'avaliacao', calendario_semana: 2 }],
      data_inicio: '2026-09-14',
    };
    const [l] = await coletarCenarioBHorizonte(mock([piloto]).client, 'emp', 28, HOJE);
    // espelhada na semana 2: abre em 21/09 às 06:00 UTC (2,75 dias), e não em 28/09 (a semana 3 "à mão")
    expect(l.diasAte).toBe(Math.round((semanaLiberadaEm('2026-09-14', 2)!.getTime() - HOJE.getTime()) / 86400_000));
    expect(l.diasAte).toBe(3);
  });

  it('sem data_inicio não dá para datar: 0 dias (crítico), como a R15', async () => {
    const [l] = await coletarCenarioBHorizonte(mock([onb('t1', 'p1', { data_inicio: null })]).client, 'emp', 28, HOJE);
    expect(l.diasAte).toBe(0);
  });
});
