import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { COMPETENCIAS_LIDERANCA, VARIANTES } from '@/lib/simuladores/lideranca/matriz-global';

/**
 * O trilho de LIDERANÇA é o segundo mapeamento da pessoa — separado do
 * mapeamento do cargo, com as competências da MATRIZ GLOBAL e "um cenário por
 * dia". Aqui se prova NA ACTION (molde: degustacao-assessment-action.test.ts):
 * é ela que decide o que a tela mostra, o que o servidor aceita gravar e, o
 * que mais importa, que o trilho do cargo continua exatamente como era.
 *
 * ⚠️ Desde 14/09/2026 as competências de liderança ficam gravadas sob o cargo
 * da VARIANTE ("Gestor Comercial" / "Futuro Líder"), não sob o cargo-alvo da
 * empresa. O mock ignora filtros, então a prova de que a busca usa a variante
 * é uma asserção sobre `sb.chamadas`, no `it` próprio lá embaixo.
 */

const CARGO5 = ['Prospecção', 'Negociação', 'Pós-venda', 'Resiliência', 'Metas'];
const LID5 = [...COMPETENCIAS_LIDERANCA];

const cenario = {
  cargo: 'Vendedor',
  role: 'colaborador',
  sysConfig: {} as any,
  respostas: [] as any[],
};

let sb: ReturnType<typeof criarSupabaseMock>;

function respostasNoBanco() {
  const gravadas = (sb?.escritas || [])
    .filter((e) => e.tabela === 'respostas')
    .map((e) => ({ competencia_id: e.payload?.competencia_id, competencia_nome: e.payload?.competencia_nome, timestamp_resposta: e.payload?.timestamp_resposta }));
  return [...cenario.respostas, ...gravadas];
}

const comps = [
  ...CARGO5.map((nome, i) => ({ id: `c-${i + 1}`, nome, cod_desc: null })),
  ...LID5.map((nome, i) => ({ id: `l-${i + 1}`, nome, cod_desc: null })),   // sob a variante em uso
];

sb = criarSupabaseMock({
  resolver: (table, cols) => {
    // O mock ignora filtros: as duas leituras de cargos_empresa se distinguem pelo select.
    if (table === 'cargos_empresa') {
      return cols.includes('nome') ? { nome: 'Gerente Comercial', top5_workshop: LID5 } : { top5_workshop: CARGO5 };
    }
    if (table === 'empresas') return { is_demo: false, sys_config: cenario.sysConfig };
    if (table === 'banco_cenarios') return { id: 'cen-1', titulo: 'Cenário', descricao: 'Contexto', alternativas: [] };
    return null;
  },
  lista: (table) => {
    // O trilho lê a LISTA de cargos e casa o alvo por nome normalizado.
    if (table === 'cargos_empresa') return [{ nome: 'Gerente Comercial', top5_workshop: LID5 }, { nome: 'Vendedor', top5_workshop: CARGO5 }];
    if (table === 'competencias') return comps;
    if (table === 'respostas') return respostasNoBanco();
    if (table === 'banco_cenarios') return comps.map((c) => ({ id: `cen-${c.id}`, competencia_id: c.id }));
    return [];
  },
  escrita: (table) => (table === 'respostas' ? [{ id: 'resp-nova' }] : null),
});

vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'colab-1', nome_completo: 'Ana', cargo: cenario.cargo, role: cenario.role, empresa_id: 'emp', escola_id: null, email: 'ana@cliente.com' })),
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'ana@cliente.com') }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: vi.fn(async () => ({})) }));
vi.mock('@/lib/access-gates', () => ({ canAccessMapeamentoCenarios: () => ({ allowed: true }) }));

import { getDiagnosticoDoDia, salvarRespostaDiagnostico } from '@/app/dashboard/assessment/assessment-actions';

const respostaValida = { r1: 'x'.repeat(30), r2: 'x'.repeat(30), r3: 'x'.repeat(30), r4: 'x'.repeat(30), repr: 8 };
const CONTRATADO = { modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente Comercial' } };
const HOJE_12H_BRT = '2026-09-13T15:00:00Z';

describe('trilho de liderança na action do assessment', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(HOJE_12H_BRT)); });
  afterAll(() => { vi.useRealTimers(); });
  beforeEach(() => {
    sb.reset();
    cenario.cargo = 'Vendedor';
    cenario.role = 'colaborador';
    cenario.sysConfig = {};
    cenario.respostas = [];
  });

  it('sem módulo contratado o trilho recusa com código — e o trilho do cargo nem menciona o de liderança', async () => {
    const lid: any = await getDiagnosticoDoDia('lideranca');
    expect(lid).toMatchObject({ code: 'MODULO_NAO_CONTRATADO' });
    expect(lid.error).toBeTruthy();

    const cargo: any = await getDiagnosticoDoDia('cargo');
    expect(cargo.error).toBeUndefined();
    expect(cargo.trilhoLideranca).toBeNull();
    expect(cargo.progresso).toMatchObject({ total: 5 });
    expect(cargo.cenarioDoDia?.compNome).toBe(CARGO5[0]);
  });

  it('com programa configurado: o trilho entrega as competências da MATRIZ, e o do cargo avisa que ele existe', async () => {
    cenario.sysConfig = CONTRATADO;

    const lid: any = await getDiagnosticoDoDia('lideranca');
    expect(lid.error).toBeUndefined();
    expect(lid).toMatchObject({ trilho: 'lideranca', cargoAlvo: 'Gerente Comercial' });
    expect(lid.progresso).toMatchObject({ total: 5, respondidas: 0 });
    expect(lid.cenarioDoDia).toMatchObject({ compId: 'l-1', compNome: LID5[0] });

    const cargo: any = await getDiagnosticoDoDia('cargo');
    expect(cargo).toMatchObject({ trilho: 'cargo', cargoAlvo: null, trilhoLideranca: { disponivel: true, respondidas: 0, total: 5 } });
    expect(cargo.cenarioDoDia?.compName ?? cargo.cenarioDoDia?.compNome).toBe(CARGO5[0]);
  });

  /**
   * Até 14/09/2026 quem ocupava o cargo-alvo era RECUSADO aqui. Com a matriz
   * global isso passou a excluir justamente o gestor em exercício, que é
   * metade do público do instrumento.
   */
  it('quem ocupa o cargo-alvo RESPONDE, e o cenário é buscado pela variante de líder', async () => {
    cenario.sysConfig = CONTRATADO;
    cenario.cargo = 'Gerente Comercial';
    const lid: any = await getDiagnosticoDoDia('lideranca');
    expect(lid.error).toBeUndefined();
    expect(lid).toMatchObject({ trilho: 'lideranca' });
    expect(lid.progresso).toMatchObject({ total: 5 });
    const cargosBuscados = sb.chamadas
      .filter((c) => c.tabela === 'competencias' && c.metodo === 'eq' && c.args[0] === 'cargo')
      .map((c) => c.args[1]);
    expect(cargosBuscados).toContain(VARIANTES.lider);
    expect(cargosBuscados).not.toContain('Gerente Comercial');
  });

  it('quem NÃO ocupa o cargo-alvo tem o cenário buscado pela variante de futuro líder', async () => {
    cenario.sysConfig = CONTRATADO;
    await getDiagnosticoDoDia('lideranca');
    const cargosBuscados = sb.chamadas
      .filter((c) => c.tabela === 'competencias' && c.metodo === 'eq' && c.args[0] === 'cargo')
      .map((c) => c.args[1]);
    expect(cargosBuscados).toContain(VARIANTES.futuro);
  });

  it('o papel rh fica fora do trilho — a mesma exclusão que a matriz aplica; e o card não aparece para ele', async () => {
    cenario.sysConfig = CONTRATADO;
    cenario.role = 'rh';
    expect(await getDiagnosticoDoDia('lideranca')).toMatchObject({ code: 'FORA_DA_POPULACAO' });
    const cargo: any = await getDiagnosticoDoDia('cargo');
    expect(cargo.trilhoLideranca).toBeNull();
    const r: any = await salvarRespostaDiagnostico('cen-l-1', 'l-1', LID5[0], respostaValida, 'lideranca');
    expect(r).toMatchObject({ code: 'FORA_DA_POPULACAO' });
    expect(sb.escritas).toHaveLength(0);
  });

  it('um por dia: respondida uma competência de liderança hoje, o trilho fecha até amanhã — e o do cargo não', async () => {
    cenario.sysConfig = CONTRATADO;
    cenario.respostas = [{ competencia_id: 'l-1', competencia_nome: LID5[0], timestamp_resposta: '2026-09-13T14:00:00Z' }];

    const lid: any = await getDiagnosticoDoDia('lideranca');
    expect(lid).toMatchObject({ respondeuHoje: true, concluiuTudo: false, cenarioDoDia: null });
    expect(lid.progresso).toMatchObject({ respondidas: 1, total: 5 });

    const cargo: any = await getDiagnosticoDoDia('cargo');
    expect(cargo.respondeuHoje).toBe(false);
    expect(cargo.trilhoLideranca).toMatchObject({ respondidas: 1, total: 5 });
  });

  it('um por dia é regra do SERVIDOR: salvar um 2º cenário de liderança hoje recusa; reenviar o mesmo é edição', async () => {
    cenario.sysConfig = CONTRATADO;
    cenario.respostas = [{ competencia_id: 'l-1', competencia_nome: LID5[0], timestamp_resposta: '2026-09-13T14:00:00Z' }];

    const segundo: any = await salvarRespostaDiagnostico('cen-l-2', 'l-2', LID5[1], respostaValida, 'lideranca');
    expect(segundo).toMatchObject({ code: 'JA_RESPONDEU_HOJE' });
    expect(sb.escritas.filter((e) => e.tabela === 'respostas')).toHaveLength(0);

    const mesmo: any = await salvarRespostaDiagnostico('cen-l-1', 'l-1', LID5[0], respostaValida, 'lideranca');
    expect(mesmo.error).toBeUndefined();
    expect(mesmo.success).toBe(true);
  });

  it('ontem 23:30 em Brasília não conta como hoje', async () => {
    cenario.sysConfig = CONTRATADO;
    cenario.respostas = [{ competencia_id: 'l-1', competencia_nome: LID5[0], timestamp_resposta: '2026-09-13T02:30:00Z' }];
    const lid: any = await getDiagnosticoDoDia('lideranca');
    expect(lid.respondeuHoje).toBe(false);
    expect(lid.cenarioDoDia?.compId).toBe('l-2');
  });

  it('o compId vem do browser: no trilho de liderança precisa pertencer ao trilho', async () => {
    cenario.sysConfig = CONTRATADO;
    const r: any = await salvarRespostaDiagnostico('cen-c-1', 'c-1', CARGO5[0], respostaValida, 'lideranca');
    expect(r).toMatchObject({ code: 'COMPETENCIA_FORA_DO_TRILHO' });
    expect(sb.escritas).toHaveLength(0);
  });

  it('um_por_dia desligado no programa: dois cenários de liderança no mesmo dia passam', async () => {
    cenario.sysConfig = { ...CONTRATADO, prontidao_lideranca: { cargo_alvo: 'Gerente Comercial', um_por_dia: false } };
    cenario.respostas = [{ competencia_id: 'l-1', competencia_nome: LID5[0], timestamp_resposta: '2026-09-13T14:00:00Z' }];
    const r: any = await salvarRespostaDiagnostico('cen-l-2', 'l-2', LID5[1], respostaValida, 'lideranca');
    expect(r.success).toBe(true);
    expect(r.proximaCompetencia).toBe(LID5[2]);
  });

  it('o trilho do cargo segue SEM limite diário e grava o cargo da pessoa', async () => {
    cenario.sysConfig = CONTRATADO;
    cenario.respostas = [{ competencia_id: 'c-1', competencia_nome: CARGO5[0], timestamp_resposta: '2026-09-13T14:00:00Z' }];
    const r: any = await salvarRespostaDiagnostico('cen-c-2', 'c-2', CARGO5[1], respostaValida);
    expect(r.success).toBe(true);
    const gravada = sb.escritas.find((e) => e.tabela === 'respostas')!.payload;
    expect(gravada).toMatchObject({ cargo: 'Vendedor', competencia_id: 'c-2', tipo_resposta: 'cenario_a' });
  });

  it('gravação do trilho de liderança: mesma tabela, cargo da PESSOA, competência do cargo-alvo', async () => {
    cenario.sysConfig = CONTRATADO;
    const r: any = await salvarRespostaDiagnostico('cen-l-1', 'l-1', LID5[0], respostaValida, 'lideranca');
    expect(r.success).toBe(true);
    expect(r.proximaCompetencia).toBe(LID5[1]);
    const gravada = sb.escritas.find((e) => e.tabela === 'respostas')!.payload;
    expect(gravada).toMatchObject({ cargo: 'Vendedor', competencia_id: 'l-1', competencia_nome: LID5[0] });
  });
});
