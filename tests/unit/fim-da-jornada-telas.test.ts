import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';

/**
 * O fim da jornada nas TELAS da pessoa (03/10/2026).
 *
 *  - R-95: a fase "Reavaliação" da jornada e da home só concluía com respostas
 *    `rodada = 2`, que nenhum código grava. Quem fechava a avaliação final
 *    ficava em "4 de 5" para sempre. Agora deriva da avaliação final da trilha.
 *  - R-16: com o encadeamento, a trilha mais recente é a jornada seguinte.
 *    "Ver relatório" sem `?trilha` abria "Temporada ainda não concluída", e a
 *    tela da temporada trocava para a jornada nova escondendo o relatório.
 */

const h = vi.hoisted(() => ({ sb: null as any, ctx: null as any, colab: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }) }));
vi.mock('@/lib/authz', () => ({
  getDashboardView: () => 'colaborador',
  findColabByEmail: async () => h.colab,
  canViewColabJourney: () => true,
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => h.ctx,
  requireAdminAction: async () => h.ctx,
  getAuthenticatedEmailFromAction: async () => 'maria@escola.br',
  assertTenantAccessAction: async () => null,
}));
vi.mock('@/lib/season-engine/kit/entrega-semana', () => ({
  precarregarKits: async () => new Map(),
  overlayKitNaSemana: async () => {},
  formatoPreferido: () => 'texto',
}));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { avaliacaoFinalConcluida } from '@/lib/season-engine/trilha-runtime';
import { carregarJornada } from '@/lib/home/loaders';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';
import { loadTemporada } from '@/actions/temporadas';

const PLANO_JORNADA = [1, 2, 3, 4, 5, 6].map((s) => ({ semana: s, tipo: 'conteudo' })).concat([{ semana: 7, tipo: 'avaliacao' }]);
const concluidas = (...semanas: number[]) => semanas.map((semana) => ({ semana, status: 'concluido' }));

describe('avaliacaoFinalConcluida (R-95)', () => {
  it('a semana do Cenário B concluída é a avaliação final concluída', () => {
    expect(avaliacaoFinalConcluida(PLANO_JORNADA, concluidas(1, 2, 3, 4, 5, 6, 7))).toBe(true);
  });
  it('conteúdo todo concluído, Cenário B não: ainda não', () => {
    expect(avaliacaoFinalConcluida(PLANO_JORNADA, concluidas(1, 2, 3, 4, 5, 6))).toBe(false);
  });
  it('no formato de 14, a final é a 14 (a 13 é a qualitativa)', () => {
    const plano14 = [{ semana: 13, tipo: 'avaliacao' }, { semana: 14, tipo: 'avaliacao' }];
    expect(avaliacaoFinalConcluida(plano14, concluidas(13))).toBe(false);
    expect(avaliacaoFinalConcluida(plano14, concluidas(13, 14))).toBe(true);
  });
  it('plano sem avaliação (Personalizado sem fechamento) não tem avaliação final, nem cai no 14', () => {
    const semFechamento = [{ semana: 1, tipo: 'conteudo' }, { semana: 14, tipo: 'conteudo' }];
    expect(avaliacaoFinalConcluida(semFechamento, concluidas(1, 14))).toBe(false);
  });
});

describe('fase 5 "Reavaliação" da jornada (R-95)', () => {
  const COLAB = { id: 'c1', empresa_id: 'e1', nome_completo: 'Maria', cargo: 'Professora', perfil_dominante: 'S' };
  let progresso: any[] = [];

  beforeEach(() => {
    h.sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'cargos_empresa' ? { top5_workshop: ['C1'] } : tabela === 'relatorios' ? { id: 'r1', gerado_em: '2026-09-01' } : null),
      lista: (tabela) => (tabela === 'temporada_semana_progresso' ? progresso : []),
      contagem: () => 1,
    });
  });

  const fase5 = async (trilha: any) => {
    const j: any = await carregarJornada(COLAB, { sysConfig: {}, respostasCount: 1, empresaIsDemo: false, trilha });
    return j.fases.find((f: any) => f.fase === 5);
  };
  const trilha = (status: string) => ({ id: 't1', status, temporada_plano: PLANO_JORNADA, competencia_foco: 'Planejamento', criado_em: '2026-08-01' });

  it('🔴 avaliação final concluída → Reavaliação CONCLUÍDA (antes: pendente para sempre)', async () => {
    progresso = concluidas(1, 2, 3, 4, 5, 6, 7);
    expect((await fase5(trilha('concluida'))).status).toBe('completed');
  });

  it('avaliação final ainda aberta → pendente', async () => {
    progresso = concluidas(1, 2, 3, 4, 5, 6);
    expect((await fase5(trilha('ativa'))).status).toBe('pending');
  });

  it('não consulta mais `rodada = 2` (coluna sem escritor)', async () => {
    progresso = concluidas(1, 2, 3, 4, 5, 6, 7);
    await fase5(trilha('concluida'));
    expect(h.sb.usou('respostas', 'eq', 'rodada')).toBe(false);
  });
});

describe('loadTemporadaConcluida sem `trilhaId` (R-16)', () => {
  beforeEach(() => {
    h.ctx = { email: 'maria@escola.br', role: 'colaborador', empresaId: 'e1' };
    h.colab = { id: 'c1', empresa_id: 'e1', nome_completo: 'Maria', cargo: 'Professora' };
  });

  const cadeiaDaTrilha = () => h.sb.chamadas.filter((c: Chamada) => c.tabela === 'trilhas');

  it('pega a temporada CONCLUÍDA mais recente, não a trilha mais recente (que é a jornada seguinte)', async () => {
    h.sb = criarSupabaseMock({
      resolver: (tabela, _cols, cadeia) => {
        if (tabela !== 'trilhas') return null;
        const pedeConcluida = cadeia.some((e) => e.metodo === 'eq' && e.args[0] === 'status' && e.args[1] === 'concluida');
        return pedeConcluida
          ? { id: 't1', status: 'concluida', numero_temporada: 1, competencia_foco: 'Planejamento', temporada_plano: PLANO_JORNADA, evolution_report: { descritores: [] } }
          : { id: 't2', status: 'ativa', numero_temporada: 2, competencia_foco: 'Comunicação', temporada_plano: PLANO_JORNADA };
      },
      lista: () => [],
    });
    const r: any = await loadTemporadaConcluida('maria@escola.br');
    expect(r.error).toBeUndefined();
    expect(r.trilha.id).toBe('t1');
    const ordem = cadeiaDaTrilha().find((c: Chamada) => c.metodo === 'order');
    expect(ordem?.args).toEqual(['numero_temporada', { ascending: false }]);
  });

  it('com `trilhaId`, abre exatamente aquela (e recusa se não estiver concluída)', async () => {
    h.sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'trilhas' ? { id: 't2', status: 'ativa', numero_temporada: 2, temporada_plano: [] } : null),
      lista: () => [],
    });
    const r: any = await loadTemporadaConcluida('maria@escola.br', 't2');
    expect(r.error).toBe('Temporada ainda não concluída');
    expect(cadeiaDaTrilha().some((c: Chamada) => c.metodo === 'eq' && c.args[0] === 'id' && c.args[1] === 't2')).toBe(true);
  });

  it('falha de leitura não vira "Nenhuma trilha encontrada"', async () => {
    h.sb = criarSupabaseMock({ lista: () => [] });
    h.sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await loadTemporadaConcluida('maria@escola.br');
    expect(r.error).not.toBe('Nenhuma trilha encontrada');
    expect(r.error).toMatch(/Não foi possível carregar/);
  });

  /**
   * R-29: o "N semanas dedicadas" da conclusão era `plano.length || 14`. Agora é a
   * duração do programa (`duracaoDaTrilha`), a mesma do certificado e do painel,
   * e uma trilha SEM semana de avaliação não cai na semana 14.
   */
  describe('a duração do programa (R-29)', () => {
    const SNAPSHOT_9 = {
      modo: 'regular', semanas: 9, slotsConteudo: [1, 2, 3], semanasAvaliacao: [8, 9], semanasMissao: [4],
      semanaCenarioB: 9, semanaAcumulada: 8,
    };
    const carregar = async (trilha: any, progressos: any[] = []) => {
      h.sb = criarSupabaseMock({
        resolver: (tabela) => (tabela === 'trilhas' ? { id: 't1', status: 'concluida', numero_temporada: 1, competencia_foco: 'Planejamento', evolution_report: { descritores: [] }, ...trilha } : null),
        lista: (tabela) => (tabela === 'temporada_semana_progresso' ? progressos : []),
      });
      return await loadTemporadaConcluida('maria@escola.br') as any;
    };
    const plano = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1, tipo: 'conteudo' }));

    it('Jornada: 7', async () => {
      const r = await carregar({ temporada_plano: PLANO_JORNADA, programa_modo: 'jornada', programa_config: null });
      expect(r.trilha.totalSemanas).toBe(7);
    });

    it('🔴 Ibipeba (regular_duo com snapshot de 9): 9, e não os 14 do rótulo', async () => {
      const r = await carregar({ temporada_plano: plano(9), programa_modo: 'regular_duo', programa_config: SNAPSHOT_9 });
      expect(r.trilha.totalSemanas).toBe(9);
    });

    it('🔴 Personalizado de 3 semanas sem fechamento: 3, sem cenário B, e a semana 14 não é lida', async () => {
      const semFechamento = JSON.parse(JSON.stringify({
        modo: 'regular', semanas: 3, slotsConteudo: [1, 2, 3], semanasAvaliacao: [], semanasMissao: [],
        semanaCenarioB: 0, semanaAcumulada: 0,
      }));
      // Uma linha de progresso na semana 14 (de outra trilha, de um dado sujo): o
      // fallback antigo (`: 14`) a tomaria por cenário B e montaria a avaliação final.
      const r = await carregar(
        { temporada_plano: plano(3), programa_modo: 'custom', programa_config: semFechamento },
        [{ semana: 14, tipo: 'avaliacao', feedback: { cenario: 'não é desta trilha', nota_media_pos: 3 } }],
      );
      expect(r.trilha.totalSemanas).toBe(3);
      expect(r.sem14).toBeNull();
    });
  });
});

describe('loadTemporada traz a temporada ANTERIOR concluída (R-16)', () => {
  const COLAB = { id: 'c1', empresa_id: 'e1', nome_completo: 'Maria', cargo: 'Professora', email: 'maria@escola.br', perfil_dominante: 'S' };
  const ATUAL = { id: 't2', colaborador_id: 'c1', status: 'ativa', numero_temporada: 2, competencia_foco: 'Comunicação', temporada_plano: [], programa_modo: 'jornada' };
  const ANTERIOR = { id: 't1', numero_temporada: 1, competencia_foco: 'Planejamento', competencias_foco: ['Planejamento'] };

  const mock = (atual: any) => criarSupabaseMock({
    resolver: (tabela, _cols, cadeia) => {
      if (tabela === 'colaboradores') return COLAB;
      if (tabela !== 'trilhas') return null;
      return cadeia.some((e) => e.metodo === 'lt') ? ANTERIOR : atual;
    },
    lista: () => [],
  });

  beforeEach(() => { h.ctx = { email: 'maria@escola.br', role: 'colaborador', empresaId: 'e1' }; });

  it('jornada 2 em curso: devolve a 1 concluída para o cartão da tela', async () => {
    h.sb = mock(ATUAL);
    const r: any = await loadTemporada('c1', { incluirAnterior: true });
    expect(r.trilha.id).toBe('t2');
    expect(r.anteriorConcluida).toEqual({ id: 't1', numeroTemporada: 1, competencia: 'Planejamento' });
    const lt = h.sb.chamadas.find((c: Chamada) => c.tabela === 'trilhas' && c.metodo === 'lt');
    expect(lt?.args).toEqual(['numero_temporada', 2]);
    // Só uma temporada CONCLUÍDA vira cartão: uma arquivada não tem relatório.
    expect(h.sb.chamadas.some((c: Chamada) => c.tabela === 'trilhas' && c.metodo === 'eq' && c.args[0] === 'status' && c.args[1] === 'concluida')).toBe(true);
  });

  it('sem pedir (as outras telas), nem consulta', async () => {
    h.sb = mock(ATUAL);
    const r: any = await loadTemporada('c1');
    expect(r.anteriorConcluida).toBeNull();
    expect(h.sb.usou('trilhas', 'lt')).toBe(false);
  });

  it('primeira temporada, ou a atual já concluída: não há cartão', async () => {
    h.sb = mock({ ...ATUAL, numero_temporada: 1 });
    expect(((await loadTemporada('c1', { incluirAnterior: true })) as any).anteriorConcluida).toBeNull();
    h.sb = mock({ ...ATUAL, status: 'concluida' });
    expect(((await loadTemporada('c1', { incluirAnterior: true })) as any).anteriorConcluida).toBeNull();
  });
});

/**
 * A fiação das telas (client components, sem harness de render aqui). Estático
 * de propósito, e só para o que a regressão apagaria em silêncio: o botão que
 * volta a abrir a trilha mais recente, e a retomada que perde o consumidor.
 * Só a imagem prova o visual; isto prova que o caminho está escrito.
 */
describe('fiação das telas do fim da jornada', () => {
  const sem14 = readFileSync('app/dashboard/temporada/sem14/page.tsx', 'utf8');
  const temporada = readFileSync('app/dashboard/temporada/page.tsx', 'utf8');
  const concluida = readFileSync('app/dashboard/temporada/concluida/page.tsx', 'utf8');

  it('"Ver relatório" da avaliação final abre a trilha AVALIADA, e só com o relatório pronto', () => {
    expect(sem14).toMatch(/\/dashboard\/temporada\/concluida\?trilha=\$\{encodeURIComponent\(trilhaId\)\}/);
    expect(sem14).toMatch(/disabled=\{relatorio !== 'pronto'\}/);
    expect(sem14).not.toMatch(/router\.push\('\/dashboard\/temporada\/concluida'\)/);
  });

  it('a retomada tem consumidor: `generate_report` só no estado `falhou`', () => {
    expect(sem14).toMatch(/s\.relatorio === 'falhou' && !pediuRetomada/);
    expect(sem14).toMatch(/action: 'generate_report'/);
  });

  it('a temporada pede a anterior e mostra o cartão dela', () => {
    expect(temporada).toMatch(/loadTemporadaPorEmail\(user\.email, \{ incluirAnterior: true \}\)/);
    expect(temporada).toMatch(/previousSeason\.title/);
  });

  it('PDF e certificado vão com a trilha DESTE relatório', () => {
    expect(concluida).toMatch(/const trilhaDoRelatorio = trilhaHistoricaId \|\| trilha\.id/);
    expect(concluida).not.toMatch(/trilhaId=\{trilhaHistoricaId\}/);
  });
});
