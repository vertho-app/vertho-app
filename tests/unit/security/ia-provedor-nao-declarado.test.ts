/**
 * R-45 (revisão de 02/10/2026; decisão do dono: restringir, não declarar).
 *
 * A política de privacidade declara Anthropic, OpenAI e Google como provedores de
 * IA. Qwen (Alibaba), Kimi (Moonshot), Muse (Meta) e Grok (xAI) podiam ser
 * escolhidos por tarefa na configuração da empresa, e o Grok estava na escada de
 * fallback. Em julho e agosto, três comparações mandaram ao Kimi o PDI de pessoas
 * reais, e o simulador de temporada rodou o aluno sintético no Kimi com o primeiro
 * nome e o cargo de colaboradores reais no histórico.
 *
 * A régua (lib/ai-tasks.ts) é uma lista de PERMISSÃO: só as tarefas em
 * `TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS` aceitam provedor não declarado. Ela vale
 * em quatro pontos, e cada um tem prova aqui:
 *   1. na EXECUÇÃO (`callAI`/`callAIChat`), por onde o modelo realmente passa;
 *   2. na RESOLUÇÃO por tarefa (`resolverModeloDaTarefa`/`getModelForTask`);
 *   3. na ESCOLHA (seletores e `validarModelosDoSysConfig`);
 *   4. na ESCADA de fallback.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const mocks = vi.hoisted(() => ({
  claude: [] as any[],
  fetches: [] as string[],
  degradacoes: [] as any[],
  sysConfig: null as any,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        mocks.claude.push(params);
        return { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' };
      },
    };
  },
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { sys_config: mocks.sysConfig } : null),
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/degradacao', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  registrarDegradacao: async (input: any) => { mocks.degradacoes.push(input); },
}));

vi.stubGlobal('fetch', async (url: any) => {
  mocks.fetches.push(String(url));
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    text: async () => '',
  } as any;
});

import { callAI, callAIChat } from '@/actions/ai-client';
import {
  AI_TASKS, DEFAULT_TASK_MODELS, DUAL_IA_PARES, FAMILIAS_DECLARADAS, MODELOS_DECLARADOS, MODELOS_DISPONIVEIS,
  TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS, fallbackRespeitandoDual, familiaDeclarada, familiaDoModelo,
  getModelForTask, modeloPermitidoNaTarefa, modelosPermitidosNaTarefa, resolveTaskModel, validarModelosDoSysConfig,
} from '@/lib/ai-tasks';

const NAO_DECLARADOS = ['qwen3.8-max', 'kimi-k3', 'muse-spark-1.2', 'grok-4.6'];
const HOSTS_NAO_DECLARADOS = /moonshot|x\.ai|dashscope|meta\.ai/;
const RAIZ = join(__dirname, '..', '..', '..');
const fonte = (f: string) => readFileSync(join(RAIZ, f), 'utf8');

/** Tarefas que levam dado de pessoa. Âncora NEGATIVA: nenhuma pode virar liberada. */
const COM_DADO_DE_PESSOA = [
  'ia4_avaliacao', 'ia4_check', 'pdi_individual', 'pdi_check', 'relatorio_gestor', 'relatorio_rh',
  'relatorio_comportamental', 'insights_executivos', 'devolutiva_comportamental', 'beto', 'ipi',
  'sim_aluno', 'chat_simulador', 'sem13_qualitativa', 'sem14_scorer', 'sem14_check', 'sem14_redacao',
  'acumulada_primaria', 'acumulada_check', 'blueprint_gerar', 'blueprint_audit', 'conversa_fase3',
  'chat_fase3_eval', 'chat_fase3_audit', 'tira_duvidas', 'evolucao_fusao',
  'evolucao_plenaria', 'temporada_reflexao', 'temporada_feedback', 'temporada_qualitativa',
  'temporada_rubrica', 'temporada_extracao', 'evidencias_socratic', 'arguicao_turno', 'arguicao_avaliacao',
  'recepcao_paciente', 'recepcao_avaliacao', 'recepcao_rascunho', 'conteudo_personalizacao',
  'copiloto_pesquisa_pessoa', 'copiloto_pesquisa_pessoas', 'copiloto_ao_vivo', 'copiloto_memoria_conversa',
  'sim_vendas_cliente', 'sim_vendas_gerente', 'sim_lideranca_personagem', 'sim_lideranca_avaliador',
];

beforeEach(() => {
  mocks.claude = [];
  mocks.fetches = [];
  mocks.degradacoes = [];
  mocks.sysConfig = null;
  sb.reset();
  process.env.KIMI_API_KEY = 'sk-kimi-teste';
  process.env.XAI_API_KEY = 'xai-teste';
  process.env.QWEN_API_KEY = 'qwen-teste';
  process.env.META_MODEL_API_KEY = 'meta-teste';
  process.env.OPENAI_API_KEY = 'sk-openai-teste';
});

describe('1. execução: o callAI troca o modelo não declarado em tarefa com dado de pessoa', () => {
  it.each(NAO_DECLARADOS)('callAI com %s em ia4_avaliacao roda no default declarado da tarefa', async (modelo) => {
    await callAI('S', 'U', { model: modelo }, 256, { taskKey: 'ia4_avaliacao', empresaId: 'emp-1' });
    expect(mocks.fetches.filter((u) => HOSTS_NAO_DECLARADOS.test(u))).toEqual([]);
    expect(mocks.claude.map((p) => p.model)).toEqual([DEFAULT_TASK_MODELS.ia4_avaliacao]);
    expect(mocks.degradacoes).toHaveLength(1);
    expect(mocks.degradacoes[0]).toMatchObject({
      fluxo: 'ia', tipo: 'modelo-nao-declarado', chave: `ia4_avaliacao:${modelo}`, empresaId: 'emp-1',
      detalhe: { pedido: modelo, usado: DEFAULT_TASK_MODELS.ia4_avaliacao, taskKey: 'ia4_avaliacao', onde: 'callAI' },
    });
  });

  it('callAIChat (o caminho do chat) aplica a mesma régua', async () => {
    await callAIChat('S', [{ role: 'user', content: 'oi' }], { model: 'grok-4.6' }, 256, { taskKey: 'beto' });
    expect(mocks.fetches.filter((u) => HOSTS_NAO_DECLARADOS.test(u))).toEqual([]);
    expect(mocks.claude).toHaveLength(1);
    expect(mocks.degradacoes[0]).toMatchObject({ chave: 'beto:grok-4.6', detalhe: { onde: 'callAIChat' } });
  });

  it('chamada SEM taskKey também é restrita (não dá para provar o que ela leva)', async () => {
    await callAI('S', 'U', { model: 'kimi-k3' }, 256);
    expect(mocks.fetches.filter((u) => HOSTS_NAO_DECLARADOS.test(u))).toEqual([]);
    expect(mocks.degradacoes[0]).toMatchObject({ chave: 'sem-taskKey:kimi-k3' });
  });

  it('tarefa nova (fora de qualquer lista) nasce restrita', async () => {
    await callAI('S', 'U', { model: 'qwen3.8-max' }, 256, { taskKey: 'tarefa_que_ainda_nao_existe' });
    expect(mocks.fetches.filter((u) => HOSTS_NAO_DECLARADOS.test(u))).toEqual([]);
    expect(mocks.degradacoes).toHaveLength(1);
  });

  it('tarefa LIBERADA aceita o provedor não declarado, sem degradação', async () => {
    await callAI('S', 'U', { model: 'kimi-k3' }, 256, { taskKey: 'conteudo_tags' });
    expect(mocks.fetches).toEqual(['https://api.moonshot.ai/v1/chat/completions']);
    expect(mocks.claude).toEqual([]);
    expect(mocks.degradacoes).toEqual([]);
  });

  it('modelo declarado passa direto em qualquer tarefa', async () => {
    await callAI('S', 'U', { model: 'gpt-5.6-terra' }, 256, { taskKey: 'ia4_check' });
    expect(mocks.fetches).toEqual(['https://api.openai.com/v1/chat/completions']);
    expect(mocks.degradacoes).toEqual([]);
  });
});

describe('2. resolução por tarefa (sys_config da empresa)', () => {
  it('override por tarefa num provedor não declarado é descartado e registrado', async () => {
    mocks.sysConfig = { ai: { modelos: { ia4_avaliacao: 'qwen3.8-max', conteudo_tags: 'kimi-k3' } } };
    expect(await getModelForTask('emp-1', 'ia4_avaliacao')).toBe(DEFAULT_TASK_MODELS.ia4_avaliacao);
    expect(mocks.degradacoes).toHaveLength(1);
    expect(mocks.degradacoes[0]).toMatchObject({ chave: 'ia4_avaliacao:qwen3.8-max', detalhe: { onde: 'getModelForTask (ai.modelos)' } });
    // A liberada mantém a escolha.
    expect(await getModelForTask('emp-1', 'conteudo_tags')).toBe('kimi-k3');
    expect(mocks.degradacoes).toHaveLength(1);
  });

  it('modelo_padrao num provedor não declarado não vaza para tarefa não pinada', () => {
    const cfg = { ai: { modelo_padrao: 'grok-4.6' } };
    expect(familiaDeclarada(resolveTaskModel(cfg, 'beto'))).toBe(true);
    expect(familiaDeclarada(resolveTaskModel(cfg, 'tira_duvidas'))).toBe(true);
  });
});

describe('3. escolha: o seletor não oferece, a gravação recusa', () => {
  it('as opções por tarefa só têm família declarada nas tarefas com dado de pessoa', () => {
    for (const task of COM_DADO_DE_PESSOA) {
      const fora = modelosPermitidosNaTarefa(task).filter((m) => !familiaDeclarada(m.id));
      expect(fora, task).toEqual([]);
    }
    expect(modelosPermitidosNaTarefa('conteudo_tags').map((m) => m.id)).toEqual(expect.arrayContaining(NAO_DECLARADOS));
  });

  it('o seletor do padrão e os que servem várias tarefas usam só famílias declaradas', () => {
    expect(MODELOS_DECLARADOS.length).toBeGreaterThan(5);
    expect(MODELOS_DECLARADOS.filter((m) => !familiaDeclarada(m.id))).toEqual([]);
    expect(MODELOS_DISPONIVEIS.length).toBeGreaterThan(MODELOS_DECLARADOS.length);
  });

  it('as telas leem a régua, não o catálogo inteiro', () => {
    const config = fonte('app/admin/empresas/[empresaId]/configuracoes/page.tsx');
    expect(config).toMatch(/MODELOS_DECLARADOS\.map\(m => <option/);
    expect(config).toMatch(/modelosPermitidosNaTarefa\(task\.key\)\.map\(m => <option/);
    expect(config, 'algum <select> voltou a listar o catálogo inteiro').not.toMatch(/\{MODELOS\.map\(m => <option/);
    for (const f of [
      'app/admin/empresas/[empresaId]/page.tsx',
      'app/admin/empresas/[empresaId]/fase4/page.tsx',
      'app/admin/simulador/page.tsx',
      'app/api/chat-simulador/route.ts',
      'lib/ppp-config.ts',
    ]) {
      const src = fonte(f);
      expect(src, f).toMatch(/MODELOS_DECLARADOS/);
      expect(src, f).not.toMatch(/import \{[^}]*\bMODELOS_DISPONIVEIS\b[^}]*\} from '@\/lib\/ai-tasks'/);
    }
  });

  it('salvarConfig recusa provedor não declarado em tarefa restrita e no padrão; aceita na liberada', async () => {
    const tarefa = await validarModelosDoSysConfig({ ai: { modelos: { pdi_individual: 'kimi-k3' } } });
    expect(tarefa).toHaveLength(1);
    expect(tarefa[0]).toMatch(/política de privacidade/);
    const padrao = await validarModelosDoSysConfig({ ai: { modelo_padrao: 'qwen3.8-max' } });
    expect(padrao).toHaveLength(1);
    expect(await validarModelosDoSysConfig({ ai: { modelos: { conteudo_tags: 'grok-4.6' } } })).toEqual([]);
  });
});

describe('4. escada de fallback', () => {
  const clientSrc = fonte('actions/ai-client.ts');
  const ESCADA = [...(clientSrc.match(/const AI_FALLBACK_ESCADA = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it('a escada só tem família declarada (o Grok saiu)', () => {
    expect(ESCADA.length).toBeGreaterThan(0);
    expect(ESCADA.filter((m) => !familiaDeclarada(m))).toEqual([]);
  });

  it('nem um AI_FALLBACK_MODEL de env não declarado vira fallback de tarefa restrita', () => {
    let restritas = 0;
    for (const { gerador, auditor } of DUAL_IA_PARES) {
      for (const task of [gerador, auditor]) {
        const primario = DEFAULT_TASK_MODELS[task] ?? 'claude-sonnet-4-6';
        const alvo = fallbackRespeitandoDual(primario, task, 'grok-4.6', ESCADA);
        expect(alvo, task).not.toBeNull();
        // Tarefa liberada (ex.: cenarios_lote_check) pode cair no preferido da env;
        // as outras, nunca.
        if (Object.prototype.hasOwnProperty.call(TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS, task)) continue;
        restritas++;
        expect(familiaDeclarada(alvo!), `${task} → ${alvo}`).toBe(true);
      }
    }
    expect(restritas).toBeGreaterThan(10);
    expect(fallbackRespeitandoDual('claude-sonnet-4-6', 'beto', 'kimi-k3', ESCADA)).toBe('gemini-3.8-flash');
    expect(fallbackRespeitandoDual('claude-sonnet-4-6', undefined, 'grok-4.6', ESCADA)).toBe('gemini-3.8-flash');
  });
});

describe('a lista de liberadas', () => {
  it('as famílias declaradas são exatamente as da política', () => {
    expect([...FAMILIAS_DECLARADAS].sort()).toEqual(['anthropic', 'google', 'openai']);
    expect(NAO_DECLARADOS.map(familiaDoModelo).filter((f) => FAMILIAS_DECLARADAS.has(f))).toEqual([]);
  });

  it('nenhuma tarefa com dado de pessoa está liberada', () => {
    const liberadas = Object.keys(TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS);
    expect(liberadas.filter((t) => COM_DADO_DE_PESSOA.includes(t))).toEqual([]);
    for (const t of COM_DADO_DE_PESSOA) expect(modeloPermitidoNaTarefa('kimi-k3', t), t).toBe(false);
  });

  it('toda liberada existe no catálogo de tarefas (ou é o canário sintético) e tem o motivo escrito', () => {
    const catalogo = new Set(AI_TASKS.map((t) => t.key));
    for (const [t, motivo] of Object.entries(TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS)) {
      expect(catalogo.has(t) || t === 'canario_contrato', t).toBe(true);
      expect(motivo.length, t).toBeGreaterThan(40);
    }
  });

  it('lookup por hasOwnProperty: nome de propriedade herdada não abre a régua', () => {
    for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(modeloPermitidoNaTarefa('kimi-k3', t), t).toBe(false);
    }
  });
});
