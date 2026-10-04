import { describe, it, expect } from 'vitest';
import { checarCenarioBHorizonte, acaoDoCenarioBHorizonte, CENARIO_B_CRITICO_DIAS, type LacunaCenarioB } from '@/lib/pipeline-health/regras';
import { coletarCenarioBHorizonte } from '@/lib/pipeline-health/coleta';
import { criarSupabaseMock } from '../helpers/supabase-mock';

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

describe('R21 e o integrador do Onboarding (R-21, 04/10/2026)', () => {
  const COMPS = ['Comunicação', 'Planejamento', 'Liderança de Equipes', 'Gestão do Tempo', 'Resiliência'];
  const integradora = (diasAte: number, pessoas = 3): LacunaCenarioB => ({ cargo: 'Analista', competencias: COMPS, pessoas, diasAte, semana: 6 });

  it('a ação do alarme de Onboarding manda ao integrador, não ao lote por célula (que não o gera)', () => {
    const acao = acaoDoCenarioBHorizonte([integradora(5)]);
    expect(acao).toContain('Cenário B integrador do Onboarding');
    expect(acao).not.toContain('no lote da Fase 5');
  });

  it('a ação da célula de uma competência segue sendo o lote da Fase 5', () => {
    expect(acaoDoCenarioBHorizonte([lacuna(5)])).toContain('no lote da Fase 5');
    expect(acaoDoCenarioBHorizonte([lacuna(5)])).not.toContain('integrador');
  });

  it('amostra com as duas lacunas diz os dois caminhos', () => {
    const acao = acaoDoCenarioBHorizonte([lacuna(5), integradora(6)]);
    expect(acao).toContain('no lote da Fase 5');
    expect(acao).toContain('Cenário B integrador do Onboarding');
  });

  it('o achado carrega a ação certa e marca o integrador na amostra', () => {
    const [urgente] = checarCenarioBHorizonte([integradora(5)]);
    expect(urgente.acao).toContain('Cenário B integrador do Onboarding');
    expect(urgente.amostra?.[0]).toContain('(integrador)');
    expect(urgente.amostra?.[0]).toContain(COMPS.join(' + '));
  });

  describe('coleta', () => {
    const HOJE = new Date('2026-10-04T12:00:00Z');
    // A semana do Cenário B vem do PLANO da trilha (a rota e o health leem dele), não de um número fixo do modo.
    const plano = [...[1, 2, 3, 4, 5].map((semana) => ({ semana, tipo: 'conteudo' })), { semana: 6, tipo: 'avaliacao' }];
    const TRILHAS = [
      { id: 't1', colaborador_id: 'a1', competencia_foco: COMPS[0], competencias_foco: COMPS, temporada_plano: plano, data_inicio: '2026-08-17' },
      { id: 't2', colaborador_id: 'a2', competencia_foco: COMPS[0], competencias_foco: COMPS, temporada_plano: plano, data_inicio: '2026-08-17' },
    ];
    const COLABS = [{ id: 'a1', cargo: 'Analista' }, { id: 'a2', cargo: 'Analista' }];
    const mock = (bRows: any[], comps: any[] = []) => criarSupabaseMock({
      lista: (tabela) => ({ trilhas: TRILHAS, temporada_semana_progresso: [], colaboradores: COLABS, banco_cenarios: bRows, competencias: comps } as Record<string, any[]>)[tabela] ?? [],
    });
    const integrador = {
      id: 'b-int', titulo: 't', descricao: 'd', cargo: 'Analista', competencia_id: null, created_at: '2026-10-01T00:00:00Z',
      alternativas: { p1: 'x', competencias_integradas: COMPS, cobertura_exata: true },
    };

    it('trilhas de 5 competências sem integrador: UMA lacuna da célula, com as 2 pessoas e as 5 competências', async () => {
      const lacunas = await coletarCenarioBHorizonte(mock([]).client, 'emp', 28, HOJE);
      expect(lacunas).toHaveLength(1);
      expect(lacunas[0]).toMatchObject({ cargo: 'Analista', competencias: COMPS, pessoas: 2, semana: 6 });
    });

    it('um B por célula (o que o lote gera) NÃO apaga a lacuna: o Onboarding precisa do integrador', async () => {
      const porCelula = COMPS.map((nome, i) => ({ id: `b-${i}`, titulo: 't', descricao: 'd', cargo: 'Analista', competencia_id: `cp-${i}`, created_at: '2026-10-01T00:00:00Z', alternativas: { p1: 'x' } }));
      const nomes = COMPS.map((nome, i) => ({ id: `cp-${i}`, nome }));
      const lacunas = await coletarCenarioBHorizonte(mock(porCelula, nomes).client, 'emp', 28, HOJE);
      expect(lacunas).toHaveLength(1);
    });

    it('com o integrador gerado, a lacuna some (a mesma escolha do fechamento)', async () => {
      expect(await coletarCenarioBHorizonte(mock([integrador]).client, 'emp', 28, HOJE)).toEqual([]);
    });
  });
});
