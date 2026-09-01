import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * A régua da degustação vale nas DUAS actions do assessment. Aqui se prova na
 * action, e não só na função pura: é a action que decide o progresso da tela,
 * a próxima competência e o disparo da avaliação — e é nela que um corte
 * vazando para tenant de cliente truncaria o assessment de gente real.
 */

const TOP5 = [
  'Comunicação e Apresentação de Valor',
  'Negociação e Fechamento',
  'Relacionamento e Pós-venda',
  'Resiliência e Constância',
  'Orientação a Metas e Resultados',
];

const cenario = {
  email: 'convidado.acme.aaaaaaaaaaaaaaaaaaaa@vertho.ai',
  isDemo: true as boolean | null,
  respostas: [] as any[],
};

// A action RELÊ `respostas` depois de gravar, para saber o que ainda falta. Um
// mock que devolvesse sempre a lista inicial diria "ainda pendente" para uma
// competência recém-respondida — e o teste mediria o instrumento, não a regra.
let sb: ReturnType<typeof criarSupabaseMock>;

function respostasNoBanco() {
  const gravadas = (sb?.escritas || [])
    .filter((e) => e.tabela === 'respostas')
    .map((e) => ({
      competencia_id: e.payload?.competencia_id,
      competencia_nome: e.payload?.competencia_nome,
    }));
  return [...cenario.respostas, ...gravadas];
}

sb = criarSupabaseMock({
  resolver: (table) => {
    if (table === 'cargos_empresa') return { top5_workshop: TOP5 };
    if (table === 'empresas') return { is_demo: cenario.isDemo };
    if (table === 'banco_cenarios') {
      return { id: 'cen-1', titulo: 'Cenário', descricao: 'Contexto', alternativas: [] };
    }
    if (table === 'respostas') return { id: 'resp-nova', colaborador_id: 'colab-1', competencia_id: 'comp-1' };
    return null;
  },
  lista: (table) => {
    if (table === 'competencias') {
      return TOP5.map((nome, i) => ({ id: `comp-${i + 1}`, nome, cod_desc: null }));
    }
    if (table === 'respostas') return respostasNoBanco();
    if (table === 'banco_cenarios') return [{ id: 'cen-1', competencia_id: 'comp-1' }];
    return [];
  },
  escrita: (table) => (table === 'respostas' ? [{ id: 'resp-nova' }] : null),
});

const colab = {
  id: 'colab-1',
  nome_completo: 'Catarina',
  cargo: 'Representante Comercial',
  empresa_id: 'acme-id',
  escola_id: null,
};

const afterCallbacks: Array<() => Promise<void>> = [];
const avaliar = vi.fn(async () => ({ success: true }));

vi.mock('next/server', () => ({
  after: (cb: any) => { afterCallbacks.push(cb); },
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ ...colab, email: cenario.email })),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: vi.fn(async () => cenario.email),
}));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: vi.fn(async () => ({})) }));
vi.mock('@/lib/access-gates', () => ({
  canAccessMapeamentoCenarios: () => ({ allowed: true }),
}));
vi.mock('@/lib/demo/degustacao-avaliacao', () => ({
  avaliarRespostaDaDegustacao: (...args: any[]) => avaliar(...(args as [])),
}));

import { getDiagnosticoDoDia, salvarRespostaDiagnostico } from '@/app/dashboard/assessment/assessment-actions';

const respostaValida = {
  r1: 'x'.repeat(30), r2: 'x'.repeat(30), r3: 'x'.repeat(30), r4: 'x'.repeat(30), repr: 8,
};

describe('assessment da degustação', () => {
  beforeEach(() => {
    sb.reset();
    avaliar.mockClear();
    afterCallbacks.length = 0;
    cenario.email = 'convidado.acme.aaaaaaaaaaaaaaaaaaaa@vertho.ai';
    cenario.isDemo = true;
    cenario.respostas = [];
  });

  it('o convidado responde UMA competência, não cinco', async () => {
    const data: any = await getDiagnosticoDoDia();

    expect(data.error).toBeUndefined();
    expect(data.degustacao).toBe(true);
    expect(data.progresso).toMatchObject({ total: 1, respondidas: 0, pct: 0 });
    expect(data.cenarioDoDia?.compNome).toBe(TOP5[0]);
  });

  it('respondida a única competência, a etapa fecha e mostra o resultado', async () => {
    cenario.respostas = [{ competencia_id: 'comp-1', competencia_nome: TOP5[0] }];

    const data: any = await getDiagnosticoDoDia();

    expect(data.concluiuTudo).toBe(true);
    expect(data.progresso).toMatchObject({ total: 1, respondidas: 1, pct: 100 });
    expect(data.resultados).toHaveLength(1);
    // sem IA4 ainda: a tela mostra a competência SEM inventar nota
    expect(data.resultados[0]).toMatchObject({ competencia: TOP5[0], avaliada: false, nivel: null });
  });

  it('colaborador de tenant de cliente segue com as cinco', async () => {
    cenario.isDemo = false;
    cenario.email = 'ana@clientereal.com.br';

    const data: any = await getDiagnosticoDoDia();

    expect(data.degustacao).toBe(false);
    expect(data.progresso).toMatchObject({ total: 5 });
  });

  it('as duas actions concordam: salvar a única competência já fecha a etapa', async () => {
    const r: any = await salvarRespostaDiagnostico('cen-1', 'comp-1', TOP5[0], respostaValida);

    expect(r.error).toBeUndefined();
    expect(r.concluiuTudo).toBe(true);
    expect(r.proximaCompetencia).toBeNull();
  });

  it('dispara a avaliação em background — e só depois da resposta, nunca durante', async () => {
    cenario.respostas = [];
    await salvarRespostaDiagnostico('cen-1', 'comp-1', TOP5[0], respostaValida);

    // o disparo é agendado, não executado dentro da action: a pessoa não espera
    expect(avaliar).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();
    expect(avaliar).toHaveBeenCalledWith('acme-id', { colaboradorId: 'colab-1', competenciaId: 'comp-1' });
  });

  it('tenant de cliente NÃO dispara avaliação automática', async () => {
    cenario.isDemo = false;
    cenario.email = 'ana@clientereal.com.br';
    // responde a 5ª e última: concluiu tudo, mas quem avalia continua sendo o painel
    cenario.respostas = TOP5.map((nome, i) => ({ competencia_id: `comp-${i + 1}`, competencia_nome: nome }));

    const r: any = await salvarRespostaDiagnostico('cen-1', 'comp-1', TOP5[0], respostaValida);

    expect(r.concluiuTudo).toBe(true);
    expect(afterCallbacks).toHaveLength(0);
    expect(avaliar).not.toHaveBeenCalled();
  });

  it('falha ao avaliar não derruba a resposta já salva', async () => {
    avaliar.mockResolvedValueOnce({ success: false, error: 'IA fora do ar' } as any);

    const r: any = await salvarRespostaDiagnostico('cen-1', 'comp-1', TOP5[0], respostaValida);
    expect(r.success).toBe(true);

    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
  });
});
