import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../../helpers/tabelas-em-memoria';

/**
 * Plano de cenários de 11/10/2026, Fase 0: regenerar NUNCA reescreve um cenário que alguém
 * já respondeu. `Medido: 09/10/2026`: os 66 cenários A da Amazon Bowling tinham respostas, e
 * "Regenerar", "Revisar todos" e "Regerar selecionados" faziam UPDATE no lugar: a resposta e a
 * nota da IA4 passavam a apontar para um texto que a pessoa nunca leu.
 *
 * Agora a candidata promovida vira LINHA NOVA (já auditada) quando há resposta ou conversa,
 * e só a versão MAIS NOVA da célula se regenera (conferido em 13/10: sem isso, cada clique na
 * respondida criaria mais uma linha, comparada com a nota da versão antiga).
 */

let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;
const ia = { notaCheck: 0, contexto: 'Contexto novo', chamadas: [] as Array<{ task?: string }> };

const ANTIGA = '2026-10-01T12:00:00.000Z';
const NOVA = '2026-10-12T12:00:00.000Z';

function linhaA(extra: Record<string, any> = {}) {
  return {
    id: 'cen-1', empresa_id: 'emp', cargo: 'Infra e Mecânica', competencia_id: 'c-1', ppp_escola_id: null, tipo_cenario: null,
    titulo: 'Título antigo', descricao: 'Contexto antigo', alternativas: {}, nota_check: 60, status_check: 'revisar',
    justificativa_check: 'J', sugestao_check: null, alertas_check: {}, created_at: ANTIGA, ...extra,
  };
}

function montar(cenarios: any[] = [linhaA()], extra: Partial<Tabelas> = {}) {
  tabelas = {
    empresas: [{ id: 'emp', nome: 'Empresa', segmento: 'entretenimento', sys_config: {} }],
    competencias: [{ id: 'c-1', empresa_id: 'emp', nome: 'Foco no cliente', cod_comp: 'C1', pilar: null, descricao: null, cargo: 'Infra e Mecânica' }],
    cargos_empresa: [{ empresa_id: 'emp', nome: 'Infra e Mecânica' }],
    banco_cenarios: cenarios,
    respostas: [],
    sessoes_avaliacao: [],
    ...extra,
  };
  sb = bancoEmMemoria(tabelas);
}

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sb.client),
  requireEmpresaSupabase: vi.fn(async () => sb.client),
  requireLinhaSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({})) }));
vi.mock('@/lib/ia2-gabarito', () => ({
  buscarContextoPPP: vi.fn(async () => ''), buscarValores: vi.fn(async () => []),
  carregarContextoIA2: vi.fn(), montarPromptIA2: vi.fn(), validarGabaritoIA2: vi.fn(),
  persistirGabaritoIA2: vi.fn(), gerarGabaritosIA2Core: vi.fn(),
}));
vi.mock('@/lib/matriz-por-cargo', async (orig) => ({
  ...(await orig<typeof import('@/lib/matriz-por-cargo')>()),
  buscarDescritoresDaCompetencia: vi.fn(async () => []),
}));
vi.mock('@/lib/ai-tasks', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-tasks')>()),
  getModelForTask: vi.fn(async (_e: string, task: string) => (task === 'ia3_check' ? 'gpt-5.6-terra' : 'claude-sonnet-5-5')),
}));
vi.mock('@/lib/cargo-contexto', async (orig) => ({
  ...(await orig<typeof import('@/lib/cargo-contexto')>()),
  carregarFichaParaCenario: vi.fn(async () => ({ linhas: ['Cargo: Infra e Mecânica'], info: {} })),
}));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn(async (t: string) => JSON.parse(t)) }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_s: string, _u: string, _cfg: any, _max: number, opts: any) => {
    ia.chamadas.push({ task: opts?.taskKey });
    if (opts?.taskKey === 'ia3_check') return JSON.stringify({ nota: ia.notaCheck, justificativa: 'nova' });
    return JSON.stringify({
      cenario: { titulo: 'Título novo', contexto: ia.contexto },
      perguntas: [1, 2, 3, 4].map((n) => ({ numero: n, texto: `P${n}`, descritores_primarios: [] })),
    });
  }),
}));

import { regenerarCenarioIA3ComTrava, regenerarAteLimiarIA3, versaoMaisNovaDaCelulaIA3 } from '@/lib/ia3-cenarios';

const escritasEmCenarios = () => sb.escritas.filter((e) => e.tabela === 'banco_cenarios');
const insercoes = () => escritasEmCenarios().filter((e) => e.op === 'insert');
const linha = (id: string) => tabelas.banco_cenarios.find((c) => c.id === id);

beforeEach(() => {
  montar();
  ia.notaCheck = 85;
  ia.contexto = 'Contexto novo';
  ia.chamadas = [];
});

describe('regenerar um cenário A', () => {
  it('sem resposta nem conversa: reescreve NO LUGAR, guarda o texto anterior e carimba a versão', async () => {
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r).toMatchObject({ success: true, aplicado: true, nota: 85 });
    expect(insercoes()).toHaveLength(0);
    expect(tabelas.banco_cenarios).toHaveLength(1);
    expect(linha('cen-1')).toMatchObject({ titulo: 'Título novo', nota_check: 85, status_check: 'aprovado_com_ressalvas' });
    expect(linha('cen-1').alertas_check).toMatchObject({ versao_prompt: 'ia3-p1', versao_regua: 'ia3-r1' });
    expect(linha('cen-1').alertas_check.versoes_anteriores[0]).toMatchObject({ titulo: 'Título antigo', nota_check: 60 });
  });

  it('com 1 resposta: a candidata vira LINHA NOVA, já auditada e carimbada; a respondida fica intacta', async () => {
    tabelas.respostas.push({ id: 'r-1', empresa_id: 'emp', cenario_id: 'cen-1' });
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r).toMatchObject({ success: true, aplicado: true });
    expect(r.message).toMatch(/1 resposta\(s\) e foi preservado/);

    expect(linha('cen-1')).toMatchObject({ titulo: 'Título antigo', descricao: 'Contexto antigo', nota_check: 60, alertas_check: {} });
    expect(escritasEmCenarios().filter((e) => e.op === 'update')).toHaveLength(0);

    expect(insercoes()).toHaveLength(1);
    const nova = insercoes()[0].payload;
    // Sem nota a linha nova não passaria pelo corte de nota mínima (Amazon: 80) e ninguém a receberia.
    expect(nova).toMatchObject({
      competencia_id: 'c-1', cargo: 'Infra e Mecânica', ppp_escola_id: null,
      titulo: 'Título novo', nota_check: 85, status_check: 'aprovado_com_ressalvas',
    });
    expect(nova.alertas_check).toMatchObject({
      versao_de: { cenario_id: 'cen-1', respondido_por: 1 }, versao_prompt: 'ia3-p1', versao_regua: 'ia3-r1',
    });
  });

  it('a CONVERSA do assessment (sessoes_avaliacao) também conta como respondido', async () => {
    tabelas.sessoes_avaliacao.push({ id: 's-1', empresa_id: 'emp', cenario_id: 'cen-1' });
    await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(insercoes()).toHaveLength(1);
    expect(insercoes()[0].payload.alertas_check.versao_de).toEqual({ cenario_id: 'cen-1', respondido_por: 1 });
    expect(linha('cen-1').titulo).toBe('Título antigo');
  });

  it('falha ao contar as respostas NÃO vira "ninguém respondeu": nada é escrito', async () => {
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout no pool' });
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timeout no pool/);
    expect(escritasEmCenarios()).toHaveLength(0);
    expect(linha('cen-1').titulo).toBe('Título antigo');
  });

  it('candidata pior que a atual (trava): nada muda, nem linha nova', async () => {
    tabelas.respostas.push({ id: 'r-1', empresa_id: 'emp', cenario_id: 'cen-1' });
    ia.notaCheck = 55;
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r).toMatchObject({ success: true, aplicado: false });
    expect(escritasEmCenarios()).toHaveLength(0);
  });
});

describe('só a versão MAIS NOVA da célula se regenera', () => {
  it('a versão respondida que já tem sucessora é recusada ANTES da IA, sem escrever nada', async () => {
    montar([
      linhaA(),
      linhaA({ id: 'cen-2', titulo: 'Versão nova', nota_check: 83, created_at: NOVA, alertas_check: { versao_de: { cenario_id: 'cen-1', respondido_por: 1 } } }),
    ], { respostas: [{ id: 'r-1', empresa_id: 'emp', cenario_id: 'cen-1' }] });
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/versão mais nova na mesma célula \(83pts\)/);
    expect(ia.chamadas).toHaveLength(0);
    expect(escritasEmCenarios()).toHaveLength(0);
  });

  it('a mais nova (sem resposta) regenera normalmente, no lugar', async () => {
    montar([linhaA(), linhaA({ id: 'cen-2', nota_check: 70, created_at: NOVA })], { respostas: [{ id: 'r-1', empresa_id: 'emp', cenario_id: 'cen-1' }] });
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-2' });
    expect(r).toMatchObject({ success: true, aplicado: true });
    expect(insercoes()).toHaveLength(0);
    expect(linha('cen-2').titulo).toBe('Título novo');
    expect(linha('cen-1').titulo).toBe('Título antigo');
  });

  it('dois cliques em "Regenerar" na respondida: UMA linha nova, e o segundo é recusado (a célula não cresce)', async () => {
    tabelas.respostas.push({ id: 'r-1', empresa_id: 'emp', cenario_id: 'cen-1' });
    expect((await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' })).aplicado).toBe(true);
    // O banco grava a linha nova com id e data (o mock só registra o payload do insert).
    tabelas.banco_cenarios.push({ ...insercoes()[0].payload, id: 'cen-2', empresa_id: 'emp', created_at: NOVA });
    ia.chamadas = [];

    const segundo = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(segundo.success).toBe(false);
    expect(ia.chamadas).toHaveLength(0);
    expect(insercoes()).toHaveLength(1);
  });

  it('outra célula (outro PPP) não conta como versão mais nova', async () => {
    montar([linhaA(), linhaA({ id: 'cen-escola', ppp_escola_id: 'ppp-9', created_at: NOVA })]);
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r).toMatchObject({ success: true, aplicado: true });
  });

  it('o Cenário B da mesma célula não conta como versão mais nova do A', async () => {
    montar([linhaA(), linhaA({ id: 'b-1', tipo_cenario: 'cenario_b', created_at: NOVA })]);
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r).toMatchObject({ success: true, aplicado: true });
  });

  it('a regeneração automática (lote) pula a versão substituída, sem IA', async () => {
    montar([linhaA(), linhaA({ id: 'cen-2', created_at: NOVA })]);
    const r = await regenerarAteLimiarIA3(sb.client, { cenarioId: 'cen-1' });
    expect(r.success).toBe(true);
    expect(r.pulado).toMatch(/versão mais nova/);
    expect(ia.chamadas).toHaveLength(0);
    expect(escritasEmCenarios()).toHaveLength(0);
  });

  it('falha ao ler as versões da célula: erro, nunca "não tem versão mais nova"', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'pool esgotado' });
    const r = await versaoMaisNovaDaCelulaIA3(sb.client, linhaA());
    expect(r.maisNova).toBeNull();
    expect(r.error).toMatch(/pool esgotado/);
  });
});

describe('regeneração na v2: os tetos valem em código, como no lote', () => {
  const longo = 'x'.repeat(950);

  it('empresa na v2: candidata com contexto acima de 900 caracteres é descartada ANTES da auditoria', async () => {
    tabelas.empresas[0].sys_config = { cenarios_v2: true };
    ia.contexto = longo;
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/fora das regras v2 \(Contexto com 950 caracteres/);
    expect(ia.chamadas.map((c) => c.task)).toEqual(['ia3_cenarios']);
    expect(escritasEmCenarios()).toHaveLength(0);
  });

  it('empresa na v1: o mesmo texto longo segue para a auditoria, como sempre', async () => {
    ia.contexto = longo;
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1' });
    expect(r).toMatchObject({ success: true, aplicado: true });
    expect(ia.chamadas.map((c) => c.task)).toEqual(['ia3_cenarios', 'ia3_check']);
  });
});

describe('o gerador do A nunca reescreve um Cenário B', () => {
  it('B listado na Fase 1: "Regenerar" recusa com o motivo, sem IA e sem escrita', async () => {
    montar([linhaA({ id: 'b-1', tipo_cenario: 'cenario_b' })]);
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'b-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Cenário B/);
    expect(ia.chamadas).toHaveLength(0);
    expect(escritasEmCenarios()).toHaveLength(0);
  });

  it('e o lote também o pula', async () => {
    montar([linhaA({ id: 'b-1', tipo_cenario: 'cenario_b' })]);
    const r = await regenerarAteLimiarIA3(sb.client, { cenarioId: 'b-1' });
    expect(r).toMatchObject({ success: true });
    expect(r.pulado).toMatch(/Cenário B/);
    expect(ia.chamadas).toHaveLength(0);
  });
});
