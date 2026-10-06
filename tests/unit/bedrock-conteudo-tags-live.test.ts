// Opt-in pago: uma classificação sintética, sem ler/escrever conteúdo de tenant.
// Usa a action e o wrapper reais; grava somente o custo no ledger de IA.
// BEDROCK_TAGS_LIVE=1 node --env-file=<.env.local> node_modules/vitest/vitest.mjs run tests/unit/bedrock-conteudo-tags-live.test.ts
import { test, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { costFromTokens } from '@/lib/ia-cost-catalog';
const mocks = vi.hoisted(() => ({ conteudo: {
  id: 'piloto-sintetico', empresa_id: null, titulo: 'Escuta ativa no atendimento', formato: 'texto', duracao_min: 5,
  descricao: 'Como ouvir a demanda antes de oferecer uma solução.',
  conteudo_inline: 'Ao atender uma reclamação, deixe a pessoa concluir a fala, faça perguntas para esclarecer a necessidade e confirme o que entendeu. Explique os próximos passos com palavras simples e combine uma solução dentro dos procedimentos disponíveis.',
} }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => ({ from: (table: string) => {
    const chain: any = { select: () => chain, eq: () => chain, not: () => chain,
      maybeSingle: async () => ({ data: mocks.conteudo }),
      limit: async () => ({ data: table === 'competencias_base' ? [{ nome: 'Comunicação', nome_curto: 'Escuta ativa' }, { nome: 'Planejamento', nome_curto: 'Organização' }] : [] }),
    }; return chain;
  } }),
  requireEmpresaSupabase: vi.fn(), requireLinhaSupabase: vi.fn(),
}));
import { sugerirTagsIA } from '@/actions/conteudos';
test.runIf(process.env.BEDROCK_TAGS_LIVE === '1')('classifica uma peça fictícia pelo Kimi K3 no Bedrock', async () => {
  expect(process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()).toBeTruthy();
  const original = globalThis.fetch;
  const inicio = Date.now();
  let medicao: any;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
    const response = await original(...args);
    if (String(args[0]).includes('bedrock-runtime.')) {
      const data = await response.clone().json();
      medicao = { http: response.status, model: data.model, usage: data.usage, finish_reason: data.choices?.[0]?.finish_reason };
    }
    return response;
  });
  try {
    const resultado = await sugerirTagsIA(mocks.conteudo.id);
    console.log('BEDROCK_MEDICAO', JSON.stringify({ ...medicao, latency_ms: Date.now() - inicio }));
    expect(resultado, JSON.stringify(resultado)).toMatchObject({ ok: true, sugestao: { competencia: 'Comunicação' } });
    const tags = (resultado as any).sugestao;
    const custo = medicao?.usage ? costFromTokens('global.moonshotai.kimi-k3', {
      inTokens: (medicao.usage.prompt_tokens || 0) - (medicao.usage.prompt_tokens_details?.cached_tokens || 0) - (medicao.usage.prompt_tokens_details?.cache_write_tokens || 0),
      outTokens: medicao.usage.completion_tokens || 0,
      cacheRead: medicao.usage.prompt_tokens_details?.cached_tokens || 0,
      cacheWrite: medicao.usage.prompt_tokens_details?.cache_write_tokens || 0,
    }) : null;
    mkdirSync('backups', { recursive: true });
    writeFileSync('backups/bedrock-piloto-medicao.json', JSON.stringify({ ...medicao, latency_ms: Date.now() - inicio, cost_usd: custo, sugestao: tags }, null, 2));
    expect(tags.nivel_min).toBeGreaterThanOrEqual(1);
    expect(tags.nivel_max).toBeLessThanOrEqual(4);
    expect(tags.nivel_min).toBeLessThanOrEqual(tags.nivel_max);
    expect(['alta', 'media', 'baixa']).toContain(tags.confianca);
    console.log('BEDROCK_PILOTO', JSON.stringify({ ...medicao, latency_ms: Date.now() - inicio, sugestao: tags }));
  } finally { spy.mockRestore(); }
}, 120000);
