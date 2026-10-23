import { describe, expect, it, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Lembrete automático da entrada (pacote de clínicas, decisão do dono de 23/10/2026). São mensagens
 * automáticas de WhatsApp para pessoas reais: o que se guarda aqui é QUANDO sai (5 e 3 dias antes do início
 * da turma), PARA QUEM (secretária na entrada, não quem já está na trilha) e quando NÃO sai (sem a chave,
 * demo, pausa, Meta sem resposta, template não aprovado, quem já recebeu hoje).
 */

let empresas: any[] = [];
let colabs: any[] = [];
let entreguesHoje: any[] = [];

const banco = criarSupabaseMock({
  lista: (tabela: string) => {
    if (tabela === 'empresas') return empresas;
    if (tabela === 'colaboradores') return colabs;
    if (tabela === 'notification_deliveries') return entreguesHoje;
    return [];
  },
});
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => banco.client.from(t), raw: banco.client }) }));

const { executarLembreteEntrada, chaveDoLembrete, diasAteOInicio, TEMPLATES_ENTRADA } = await import('@/lib/lembrete-entrada/executar');

const ONLABEL = { id: 'emp-1', nome: 'onlabel', is_demo: false, sys_config: { pacote_clinicas: true } };
const HOJE = '2026-11-05'; // quarta
const AGORA = new Date('2026-11-05T13:00:00Z'); // 10h de Brasília
const INICIO = '2026-11-10'; // segunda: hoje é D-5

function dados(over: { inicio?: string; naTrilha?: boolean } = {}) {
  return {
    clinicas: [{ id: 'k1', nome: 'Clínica Sol' }],
    pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'Secretária', escolaId: 'k1', temPerfil: false }],
    competenciasPorCargo: new Map(),
    respostasPorPessoa: new Map(),
    inicioDaTurmaPorPessoa: new Map([['p1', over.inicio ?? INICIO]]),
    trilhaPorPessoa: new Map(over.naTrilha ? [['p1', { numeroTemporada: 1, semanaAtual: 1, ativa: true }]] : []),
  };
}

const META_OK = Object.fromEntries(TEMPLATES_ENTRADA.map((t) => [t, { status: 'APPROVED', category: 'UTILITY' }]));

function deps(over: { dados?: any; meta?: any } = {}) {
  const preparados: string[] = [];
  const enfileirados: Array<{ template: string; chaves: string[]; opts: any }> = [];
  return {
    preparados,
    enfileirados,
    deps: {
      coletar: async () => over.dados ?? dados(),
      statusMeta: async () => (over.meta === undefined ? META_OK : over.meta),
      // O lote real decide quem recebe qual template; aqui todo template devolve a pessoa como alvo.
      preparar: async (_sb: any, o: any) => {
        preparados.push(o.template);
        return {
          template: o.template, corpo: '', totalNoEscopo: o.colabs.length, elegiveisPeloTemplate: o.colabs.length,
          removidosPorFiltros: 0, aposRefinamentos: o.colabs.length, excluidos: [], jaReceberam: 0, reenvios: 0, adiadosPorTeto: 0,
          alvos: o.colabs.map((c: any) => ({ colaboradorId: c.id, nome: c.nome_completo, telefone: c.telefone, params: ['Ana'], botaoParam: null, dedupeKey: `${o.template}:${c.id}` })),
        };
      },
      enfileirar: async (lote: any, _empresaId: string, opts: any) => {
        enfileirados.push({ template: lote.template, chaves: lote.alvos.map((a: any) => a.dedupeKey), opts });
        return { enfileirados: lote.alvos.length, falhas: [], adiadosPorTeto: 0, duracao: '' };
      },
    } as any,
  };
}

beforeEach(() => {
  banco.reset();
  empresas = [ONLABEL];
  colabs = [{ id: 'p1', nome_completo: 'Ana', cargo: 'Secretária', telefone: '5511999990001', perfil_dominante: null, role: 'colaborador' }];
  entreguesHoje = [];
});

describe('executarLembreteEntrada', () => {
  it('5 dias antes do início: monta os 3 lotes e enfileira com a chave do dia e a deduplicação da fila', async () => {
    const d = deps();
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
    expect(r.hoje).toBe(HOJE);
    expect(d.preparados).toEqual([...TEMPLATES_ENTRADA]);
    expect(d.enfileirados.map((e) => e.chaves[0])).toEqual(TEMPLATES_ENTRADA.map((t) => chaveDoLembrete(t, 'p1', HOJE)));
    expect(d.enfileirados.every((e) => e.opts?.dedupFila === true)).toBe(true);
    expect(r.empresas[0].pessoasNoDia).toBe(1);
  });

  it('também sai 3 dias antes, e não sai nos outros dias', async () => {
    expect(diasAteOInicio(INICIO, HOJE)).toBe(5);
    for (const [inicio, sai] of [['2026-11-08', true], ['2026-11-09', false], ['2026-11-11', false], ['2026-11-05', false]] as const) {
      const d = deps({ dados: dados({ inicio }) });
      await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
      expect(d.enfileirados.length > 0).toBe(sai);
    }
  });

  it('quem já está na trilha não recebe lembrete de entrada', async () => {
    const d = deps({ dados: dados({ naTrilha: true }) });
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
    expect(r.empresas[0].pessoasNoDia).toBe(0);
    expect(d.enfileirados).toHaveLength(0);
  });

  it('quem já recebeu hoje não recebe de novo (o cron rodando duas vezes)', async () => {
    entreguesHoje = [{ dedupe_key: chaveDoLembrete('avaliacao_pendente', 'p1', HOJE) }];
    const d = deps();
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
    expect(d.enfileirados.map((e) => e.template)).toEqual(['inicio_temporada_v2', 'avaliacao_parcial']);
    expect(r.empresas[0].porTemplate[0].jaReceberamHoje).toBe(1);
  });

  it('empresa pausada, sem a chave ou de demonstração não recebe nada', async () => {
    empresas = [
      { ...ONLABEL, sys_config: { pacote_clinicas: true, envios_pausados: { motivo: 'teste' } } },
      { id: 'emp-2', nome: 'rede', is_demo: false, sys_config: {} },
      { id: 'emp-3', nome: 'demo', is_demo: true, sys_config: { pacote_clinicas: true } },
    ];
    const d = deps();
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
    expect(r.empresas.map((e) => e.empresa)).toEqual(['onlabel']);
    expect(r.empresas[0].pulada).toMatch(/envios pausados/);
    expect(d.enfileirados).toHaveLength(0);
  });

  it('template que não está APPROVED e UTILITY na Meta é pulado e registrado', async () => {
    const d = deps({ meta: { ...META_OK, inicio_temporada_v2: { status: 'APPROVED', category: 'MARKETING' } } });
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
    expect(d.preparados).not.toContain('inicio_temporada_v2');
    expect(r.empresas[0].porTemplate.find((t) => t.template === 'inicio_temporada_v2')!.indisponivel).toMatch(/MARKETING/);
  });

  it('sem conseguir consultar a Meta, nada é enfileirado', async () => {
    const d = deps({ meta: null });
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, deps: d.deps });
    expect(r.metaIndisponivel).toBe(true);
    expect(d.enfileirados).toHaveLength(0);
  });

  it('a simulação diz quem receberia e não enfileira', async () => {
    const d = deps();
    const r = await executarLembreteEntrada(banco.client, { agora: AGORA, enviar: false, deps: d.deps });
    expect(d.enfileirados).toHaveLength(0);
    expect(r.empresas[0].porTemplate[0].amostra).toEqual([{ nome: 'Ana', params: ['Ana'] }]);
  });
});
