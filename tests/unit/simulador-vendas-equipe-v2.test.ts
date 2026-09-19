import { beforeEach, describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import type { Contexto } from '@/lib/simulador-vendas/access';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
import { can } from '@/lib/permissions';
import { tenantDb } from '@/lib/tenant-db';
import {
  escopoEquipe,
  podeVerEquipe,
  historicoEquipe,
  relatorioEquipe,
} from '@/lib/simulador-vendas/equipe';
import {
  consultar,
  consultarHistorico,
  executar,
} from '@/lib/simulador-vendas/service';
import { COLUNAS_HISTORICO_PARTICIPANTE } from '@/lib/simulador-vendas/historico';
import { estado, relatorio } from '../fixtures/simulador-vendas';
vi.mock('@/lib/simulador-vendas/ai', () => ({
  gerador: vi.fn(),
  snapshotPrompts: vi.fn(),
}));
const empresa = 'empresa-a';
const pessoas = [
  { id: 'eu', empresa_id: empresa, gestor_email: null },
  { id: 'liderado', empresa_id: empresa, gestor_email: 'GESTOR@example.test' },
  { id: 'outro', empresa_id: empresa, gestor_email: 'outro@example.test' },
  {
    id: 'tenant-b',
    empresa_id: 'empresa-b',
    gestor_email: 'gestor@example.test',
  },
];
const c = (role = 'gestor') =>
  ({
    empresaId: empresa,
    empresaNome: 'Fictícia',
    ownerKey: 'colab:eu',
    tdb: tenantDb(empresa),
    config: {
      habilitado: true,
      periodo_inicio: '2020-01-01T00:00:00Z',
      periodo_fim: '2099-01-01T00:00:00Z',
    },
    auth: {
      role,
      email: 'gestor@example.test',
      isPlatformAdmin: false,
      empresaId: empresa,
      colaborador: {
        id: 'eu',
        empresa_id: empresa,
        email: 'gestor@example.test',
      },
    },
  }) as Contexto;
describe('PACE: gestão com régua da equipe, sem conversa no browser', () => {
  beforeEach(() => {
    sb = criarSupabaseMock({
      lista: (t) => (t === 'colaboradores' ? pessoas : []),
    });
    vi.mocked(can).mockResolvedValue(true);
  });
  it('gestor só recebe o próprio cadastro e liderados, nunca outro tenant', async () => {
    expect(await escopoEquipe(c())).toEqual(['eu', 'liderado']);
    expect(sb.chamadas).toContainEqual({
      tabela: 'colaboradores',
      metodo: 'eq',
      args: ['empresa_id', empresa],
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'colaboradores',
      metodo: 'select',
      args: ['id,empresa_id,gestor_email', undefined],
    });
  });
  it('RH recebe a empresa, não outra', async () =>
    expect(await escopoEquipe(c('rh'))).toEqual(['eu', 'liderado', 'outro']));
  it('colaborador comum ou permissão removida não acompanha equipe', async () => {
    expect(await podeVerEquipe(c('colaborador').auth)).toBe(false);
    vi.mocked(can).mockImplementation(
      async (_auth, p) => p !== 'reports.individual.view',
    );
    await expect(escopoEquipe(c())).rejects.toMatchObject({ status: 403 });
    expect(sb.chamadas).toHaveLength(0);
  });
  it('platform admin usa escopo total explícito', async () => {
    const ctx = c();
    ctx.auth.isPlatformAdmin = true;
    expect(await escopoEquipe(ctx)).toBeNull();
  });
  it('histórico usa RPC POST com os IDs autorizados e projeção de resumos', async () => {
    sb.client.rpc.mockResolvedValue({ data: [], error: null });
    expect(await historicoEquipe(c())).toEqual({
      historico: [],
      proximoCursor: null,
    });
    expect(sb.client.rpc).toHaveBeenCalledWith('sim_vendas_historico_equipe', {
      p_empresa: empresa,
      p_colaboradores: ['eu', 'liderado'],
      p_em: null,
      p_id: null,
    });
  });
  it('falha de escopo não vira lista vazia de sucesso', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    await expect(historicoEquipe(c())).rejects.toMatchObject({ status: 503 });
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });
  it('relatório direto de pessoa fora da equipe é 404', async () => {
    sb = criarSupabaseMock({
      lista: (t) => (t === 'colaboradores' ? pessoas : []),
      resolver: (t) =>
        t === 'colaboradores'
          ? pessoas[2]
          : { id: 's', colaborador_id: 'outro', resumo: {}, relatorio },
    });
    await expect(relatorioEquipe(c(), 's')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('relatório autorizado só seleciona relatório e resumo, jamais mensagens', async () => {
    sb = criarSupabaseMock({
      lista: (t) => (t === 'colaboradores' ? pessoas : []),
      resolver: (t) =>
        t === 'colaboradores'
          ? pessoas[1]
          : {
              id: 's',
              colaborador_id: 'liderado',
              resumo: { nomeVendedor: 'Ana', versaoRegua: 'pace-2' },
              relatorio,
            },
    });
    expect(await relatorioEquipe(c(), 's')).toMatchObject({
      id: 's',
      relatorio: {
        ...relatorio,
        P: 3.1,
        A: 2.8,
        C: 2.5,
        E: 2.2,
        Media: 4,
        escalaNota: '1-4',
        escalaOriginal: '0-10',
      },
    });
    const sel = sb.chamadas.find(
      (x) => x.tabela === 'sim_vendas_sessoes' && x.metodo === 'select',
    )!.args[0];
    expect(sel).toBe('id,colaborador_id,resumo,relatorio:estado->relatorio');
    expect(sb.chamadas).toContainEqual({
      tabela: 'colaboradores',
      metodo: 'eq',
      args: ['id', 'liderado'],
    });
    expect(
      sb.chamadas.some(
        (x) => x.tabela === 'colaboradores' && x.metodo === 'range',
      ),
    ).toBe(false);
  });
  it('relatório individual mantém os gates de papel/permissão antes de ler', async () => {
    await expect(relatorioEquipe(c('colaborador'), 's')).rejects.toMatchObject({
      status: 403,
    });
    vi.mocked(can).mockResolvedValue(false);
    await expect(relatorioEquipe(c(), 's')).rejects.toMatchObject({
      status: 403,
    });
    expect(sb.chamadas).toHaveLength(0);
  });
  it('erro na leitura da pessoa não vira 404 nem permissão concedida', async () => {
    sb = criarSupabaseMock({
      resolver: () => ({
        id: 's',
        colaborador_id: 'liderado',
        resumo: {},
        relatorio,
      }),
    });
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    await expect(relatorioEquipe(c(), 's')).rejects.toMatchObject({
      status: 503,
    });
  });
  it('treino sem cadastro associado só é visível ao administrador da plataforma', async () => {
    sb = criarSupabaseMock({
      resolver: () => ({
        id: 's',
        colaborador_id: null,
        resumo: {},
        relatorio,
      }),
    });
    await expect(relatorioEquipe(c('rh'), 's')).rejects.toMatchObject({
      status: 404,
    });
    const ctx = c();
    ctx.auth.isPlatformAdmin = true;
    expect(await relatorioEquipe(ctx, 's')).toMatchObject({
      id: 's',
      relatorio: {
        ...relatorio,
        P: 3.1,
        A: 2.8,
        C: 2.5,
        E: 2.2,
        Media: 4,
        escalaNota: '1-4',
        escalaOriginal: '0-10',
      },
    });
    expect(sb.chamadas.some((x) => x.tabela === 'colaboradores')).toBe(false);
  });
  it('enumeração não percorre mais de 10.000 pessoas nem devolve recorte truncado', async () => {
    let pagina = 0;
    sb = criarSupabaseMock({
      lista: () =>
        Array.from({ length: pagina++ === 20 ? 1 : 500 }, (_, i) => ({
          id: String(i),
          empresa_id: empresa,
          gestor_email: null,
        })),
    });
    await expect(escopoEquipe(c('rh'))).rejects.toMatchObject({ status: 422 });
    expect(pagina).toBe(21);
    expect(
      sb.chamadas.filter((x) => x.metodo === 'range').at(-1)!.args,
    ).toEqual([10000, 10000]);
  });
});
describe('PACE: leitura individual e recuperação depois do prazo', () => {
  beforeEach(() => {
    vi.mocked(can).mockResolvedValue(true);
    sb = criarSupabaseMock();
  });
  it('histórico é enxuto, ordenado e limitado a 31 para detectar próxima página', async () => {
    sb = criarSupabaseMock({
      lista: (t) =>
        t === 'sim_vendas_sessoes'
          ? [
              {
                id: estado().id,
                created_at: estado().criadoEm,
                colaborador_id: 'eu',
                resumo: {
                  status: 'concluida',
                  nivel: 1,
                  nome: 'Beatriz',
                  nomeVendedor: 'Ana',
                  nota: 8.5,
                  temRelatorio: true,
                  versaoRegua: 'pace-2',
                },
              },
            ]
          : [],
    });
    const pagina = await consultarHistorico(c());
    expect(pagina.historico[0]).toMatchObject({
      nota: 3.55,
      temRelatorio: false,
      escalaOriginal: '0-10',
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'select',
      args: [COLUNAS_HISTORICO_PARTICIPANTE, undefined],
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'eq',
      args: ['owner_key', 'colab:eu'],
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_sessoes',
      metodo: 'limit',
      args: [31],
    });
  });
  it('ID não pertencente ao participante é 404, erro de banco é 503', async () => {
    await expect(consultar(c(), 'inexistente')).rejects.toMatchObject({
      status: 404,
    });
    sb.falharEm({
      tabela: 'sim_vendas_sessoes',
      op: 'select',
      mensagem: 'timeout',
    });
    await expect(consultar(c())).rejects.toMatchObject({ status: 503 });
  });
  it('devolutiva já avaliada continua recuperável depois do prazo sem claim/IA', async () => {
    const s = estado();
    s.status = 'concluida';
    s.relatorio = relatorio;
    s.feedback = {
      realismo: 5,
      desafio: 4,
      interacao: 5,
      utilidade: 4,
      aprendizado: 5,
      comentario: '',
    };
    sb = criarSupabaseMock({
      resolver: () => ({
        id: s.id,
        estado: s,
        revisao: s.revisao,
        lock_until: null,
      }),
    });
    const ctx = c();
    ctx.config!.periodo_fim = '2000-01-01T00:00:00Z';
    expect(
      (
        await executar(ctx, {
          acao: 'encerrar',
          sessaoId: s.id,
          revisao: s.revisao,
          requestId: crypto.randomUUID(),
        })
      ).sessao.relatorio,
    ).toEqual({
      ...relatorio,
      P: 3.1,
      A: 2.8,
      C: 2.5,
      E: 2.2,
      Media: 4,
      escalaNota: '1-4',
      escalaOriginal: '0-10',
    });
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });
});
