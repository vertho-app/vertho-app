import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * 🔴 O PINO DA TASK TEM QUE VALER NO CAMINHO DE PRODUÇÃO.
 *
 * `callAI` faz `aiConfig?.model || DEFAULT_MODEL` e NÃO consulta o registro de
 * tasks — o `taskKey` só marca o custo no ledger. Até 13/09/2026 a IA4 de
 * avaliação repassava `aiConfig` cru, e o seletor da tela abre em
 * `claude-sonnet-4-6`: quem não trocasse o dropdown rodava no 4.6 enquanto
 * `DEFAULT_TASK_MODELS.ia4_avaliacao` declarava `claude-sonnet-5`. No ledger de
 * 90 dias: **492 chamadas em Sonnet 5 e 101 em 4.6**, na mesma população.
 *
 * O que estes testes seguram: sem escolha explícita, o modelo vem de
 * `getModelForTask`; com escolha, o operador continua vencendo. Nos TRÊS
 * caminhos — síncrono, retry do síncrono e lote.
 */
const MODELO_DA_TASK = 'claude-sonnet-5';
const chamadas: any[] = [];
const getModelForTask = vi.fn(async () => MODELO_DA_TASK);

vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_sys: string, _user: string, aiConfig: any, _max: number, opts: any) => {
    chamadas.push({ model: aiConfig?.model, taskKey: opts?.taskKey, empresaId: opts?.empresaId });
    return 'não é json';   // força o retry e para antes de persistir
  }),
}));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: (...a: any[]) => getModelForTask(...(a as [])) }));
vi.mock('@/lib/ia2-gabarito', () => ({ buscarContextoPPP: vi.fn(async () => '') }));

import { avaliarUmaRespostaCore, comModeloDaTask } from '@/lib/ia4-avaliacao';

const resp = { id: 'r1', empresa_id: 'emp-A', colaborador_id: 'c1', cargo: 'Vendedor', competencia_id: 'comp-1', cenario_id: 'cen-1', r1: 'a', r2: 'b', r3: 'c', r4: 'd' };
const colab = { nome_completo: 'Ana' };

function mock() {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'banco_cenarios') return { titulo: 'T', descricao: 'D', alternativas: { perguntas: [] } };
      if (tabela === 'competencias') return { nome: 'Priorização', cod_comp: 'GC01', cargo: 'Vendedor', descricao: '' };
      return null;
    },
    lista: (tabela) => (tabela === 'competencias' ? [{ cod_desc: 'D1', nome_curto: 'X', n1_gap: 'a', n2_desenvolvimento: 'b', n3_meta: 'c', n4_referencia: 'd' }] : []),
  });
}

describe('comModeloDaTask', () => {
  beforeEach(() => { chamadas.length = 0; getModelForTask.mockClear(); });

  it('sem modelo escolhido, resolve pelo registro de tasks (pino + override do tenant)', async () => {
    expect(await comModeloDaTask({}, 'emp-A')).toEqual({ model: MODELO_DA_TASK });
    expect(getModelForTask).toHaveBeenCalledWith('emp-A', 'ia4_avaliacao');
  });

  it('a escolha explícita do operador VENCE, e nem consulta o registro', async () => {
    expect(await comModeloDaTask({ model: 'gpt-5.6-terra' }, 'emp-A')).toEqual({ model: 'gpt-5.6-terra' });
    expect(getModelForTask).not.toHaveBeenCalled();
  });
});

describe('avaliarUmaRespostaCore — o modelo que chega ao callAI', () => {
  beforeEach(() => { chamadas.length = 0; getModelForTask.mockClear(); });

  it('sem escolha: a chamada E o retry saem no modelo da task, com taskKey e empresaId no ledger', async () => {
    const sb = mock();
    const r = await avaliarUmaRespostaCore(sb.client, sb.client as any, resp, colab, {}, '', {});
    expect(r.success).toBe(false);            // JSON inválido nas duas tentativas
    expect(chamadas).toHaveLength(2);          // chamada + retry
    expect(chamadas.every((c) => c.model === MODELO_DA_TASK)).toBe(true);
    expect(chamadas[0]).toMatchObject({ taskKey: 'ia4_avaliacao', empresaId: 'emp-A' });
    // Resolve UMA vez e reusa no retry — o retry não pode trocar de modelo no meio.
    expect(getModelForTask).toHaveBeenCalledTimes(1);
  });

  it('com escolha do operador, as duas chamadas usam o modelo escolhido', async () => {
    const sb = mock();
    await avaliarUmaRespostaCore(sb.client, sb.client as any, resp, colab, {}, '', { model: 'claude-sonnet-4-6' });
    expect(chamadas.map((c) => c.model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6']);
    expect(getModelForTask).not.toHaveBeenCalled();
  });
});
