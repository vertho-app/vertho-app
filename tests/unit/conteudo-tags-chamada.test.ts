import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `conteudo_tags` em Sonnet 5.5 (08/10/2026, decisão do dono). `Medido:` em 78 conteúdos gerados (rótulo = competência da geração):
 * com o rótulo no vocabulário o acerto empata com o Gemini (124/124 contra 122/124); onde o vocabulário NÃO tem o rótulo, o
 * Gemini responde `alta` em 26 de 32 e o Sonnet em 4 de 32. Na geração 5 o raciocínio divide o `max_tokens` com o texto, então
 * o teto de 1.000 da action cortaria o JSON: no Claude o teto é 3.000 e o esforço é `low`.
 */
const m = vi.hoisted(() => ({
  conteudo: { id: 'c1', empresa_id: 'emp-1' as string | null, titulo: 'Escuta ativa', formato: 'texto', duracao_min: 5, descricao: 'Ouvir antes de propor.', conteudo_inline: 'Deixe a pessoa concluir a fala e confirme o que entendeu.' },
  modeloDaTarefa: 'claude-sonnet-5-5',
  resposta: JSON.stringify({
    pilar: null, competencia: 'Comunicação', descritor: 'Escuta ativa', nivel_min: 1, nivel_max: 2, contexto: 'corporativo',
    cargo: 'todos', setor: 'todos', tipo_conteudo: 'texto', confianca: 'alta', raciocinio: 'Trata de escuta ativa no atendimento.',
  }),
}));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => m.resposta), callAIChat: vi.fn() }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain, eq: () => chain, not: () => chain,
        maybeSingle: async () => ({ data: m.conteudo }),
        limit: async () => ({ data: table === 'competencias_base' ? [{ nome: 'Comunicação', nome_curto: 'Escuta ativa' }, { nome: 'Planejamento', nome_curto: 'Organização' }] : [] }),
      };
      return chain;
    },
  }),
  requireEmpresaSupabase: vi.fn(),
  requireLinhaSupabase: vi.fn(),
}));
vi.mock('@/lib/ai-tasks', async (original) => ({
  ...(await original<typeof import('@/lib/ai-tasks')>()),
  getModelForTask: vi.fn(async () => m.modeloDaTarefa),
}));

import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { sugerirTagsIA } from '@/actions/conteudos';
import { configDaChamadaDeTags, TETO_TAGS_CLAUDE, TETO_TAGS_PADRAO } from '@/lib/conteudo-tags';

const chamada = () => vi.mocked(callAI).mock.calls[0];

describe('sugerirTagsIA: modelo, teto e esforço da chamada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    m.conteudo.empresa_id = 'emp-1';
    m.modeloDaTarefa = 'claude-sonnet-5-5';
  });

  it('empresa no padrão da tarefa: Sonnet 5.5, teto 3.000 e esforço low', async () => {
    const r = await sugerirTagsIA('c1');
    expect(r).toMatchObject({ ok: true, sugestao: { competencia: 'Comunicação', confianca: 'alta' } });
    const [, , cfg, teto, opts] = chamada();
    expect(cfg).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(teto, 'com 1.000 o raciocínio da geração 5 cortaria o JSON').toBe(3000);
    expect(opts).toMatchObject({ taskKey: 'conteudo_tags', empresaId: 'emp-1', reasoningEffort: 'low' });
  });

  it('🔴 conteúdo da plataforma (sem empresa) também usa o padrão da tarefa, não o default do wrapper', async () => {
    m.conteudo.empresa_id = null;
    await sugerirTagsIA('c1');
    expect(vi.mocked(getModelForTask)).toHaveBeenCalledWith(null, 'conteudo_tags');
    const [, , cfg, teto, opts] = chamada();
    expect(cfg).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(teto).toBe(3000);
    expect(opts).toMatchObject({ reasoningEffort: 'low', empresaId: null });
  });

  it('um aiConfig.model explícito ainda vence quando o conteúdo é da plataforma', async () => {
    m.conteudo.empresa_id = null;
    await sugerirTagsIA('c1', { model: 'claude-opus-5-5' } as any);
    expect(chamada()[2]).toMatchObject({ model: 'claude-opus-5-5' });
    expect(vi.mocked(getModelForTask)).not.toHaveBeenCalled();
  });

  it('empresa configurada em outro provedor roda como sempre rodou: teto 1.000 e SEM esforço', async () => {
    m.modeloDaTarefa = 'gemini-3.8-flash';
    await sugerirTagsIA('c1');
    const [, , cfg, teto, opts] = chamada();
    expect(cfg).toMatchObject({ model: 'gemini-3.8-flash' });
    expect(teto).toBe(1000);
    expect(opts).not.toHaveProperty('reasoningEffort');
  });

  it('o piloto Bedrock/Kimi (token na Vercel) segue com PRIORIDADE, o teto dele e sem esforço', async () => {
    process.env.AWS_BEARER_TOKEN_BEDROCK = 'token-de-teste';
    await sugerirTagsIA('c1');
    const [, , cfg, teto, opts] = chamada();
    expect(cfg).toMatchObject({ model: 'global.moonshotai.kimi-k3' });
    expect(teto).toBe(6000);
    expect(opts).not.toHaveProperty('reasoningEffort');
    expect(vi.mocked(getModelForTask)).not.toHaveBeenCalled();
  });
});

describe('configDaChamadaDeTags', () => {
  it('só o Claude recebe esforço e o teto maior', () => {
    for (const modelo of ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-4-6'])
      expect(configDaChamadaDeTags(modelo), modelo).toEqual({ maxTokens: TETO_TAGS_CLAUDE, reasoningEffort: 'low' });
    for (const modelo of ['gemini-3.8-flash', 'gpt-5.6-terra', 'global.moonshotai.kimi-k3', '', undefined, null])
      expect(configDaChamadaDeTags(modelo), String(modelo)).toEqual({ maxTokens: TETO_TAGS_PADRAO });
  });
});
