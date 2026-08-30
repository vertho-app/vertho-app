/**
 * ONDE o wrapper põe `cache_control` — e onde ele PARA de pôr.
 *
 * Por que este arquivo existe (30/08/2026): o auto-cache do system usava
 * COMPRIMENTO como sinal de ESTABILIDADE (`system.length > 4000`). Nos geradores
 * de conteúdo isso é falso — o system passa dos 4.000 chars justamente porque
 * foi enriquecido com módulo-base + kit, que são únicos por (competência ×
 * descritor × cargo × módulo × kit). O prefixo nunca repete, então cada chamada
 * pagava o write (1,25×) de um cache que ninguém lia. `Medido:` 30 dias de
 * `ia_usage_log` — conteudo_texto 282.120 tokens escritos contra 0 lidos,
 * conteudo_podcast 276.536 contra 0, conteudo_case 275.633 contra 2.845.
 *
 * A invariante que este arquivo trava: **`cacheSystem: false` chega até o corpo
 * da request nos TRÊS caminhos** — síncrono, chat e LOTE. O lote é o que
 * importa: ele é o caminho default da geração de conteúdo, e uma opção honrada
 * só no síncrono seria consertar o gêmeo que não roda (F-I14).
 *
 * ⚠️ Cada `it` de ausência ("não tem cache_control") vem em par com o caso
 * POSITIVO no mesmo describe. `toBeUndefined()` fica verde quando o caminho
 * nem foi percorrido; o par prova que o teste sabe enxergar o breakpoint.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requests: [] as any[],
  batches: [] as any[],
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        mocks.requests.push(params);
        return {
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
        };
      },
      batches: {
        create: async (params: any) => {
          mocks.batches.push(params);
          return { id: 'batch_stub' };
        },
      },
    };
  },
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}));

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { callAI, callAIChat } from '@/actions/ai-client';
import { createClaudeBatch } from '@/lib/ai-batch';

/** Acima do corte de 4.000 chars que liga o auto-cache. */
const SYSTEM_LONGO = 'S'.repeat(4500);
const MODELO = 'claude-sonnet-4-6';

/** Blocos do system no corpo enviado (string quando não há breakpoint). */
const systemDoUltimo = () => mocks.requests[mocks.requests.length - 1]?.system;

const temCacheControl = (blocos: any) =>
  Array.isArray(blocos) && blocos.some((b: any) => b?.cache_control?.type === 'ephemeral');

beforeEach(() => {
  mocks.requests = [];
  mocks.batches = [];
  process.env.ANTHROPIC_API_KEY = 'k';
});

describe('callAI · auto-cache do system e o opt-out', () => {
  it('system longo, sem opção: CACHEIA (o caso positivo que sustenta os de ausência)', async () => {
    await callAI(SYSTEM_LONGO, 'USER', { model: MODELO }, 1000, { taskKey: 'teste_cache' });

    expect(temCacheControl(systemDoUltimo())).toBe(true);
  });

  it('system longo com cacheSystem:false: NÃO cacheia, e o texto continua chegando inteiro', async () => {
    await callAI(SYSTEM_LONGO, 'USER', { model: MODELO }, 1000, {
      taskKey: 'teste_cache',
      cacheSystem: false,
    });

    const system = systemDoUltimo();
    expect(temCacheControl(system)).toBe(false);
    // O opt-out é de BILLING, não de conteúdo: desligar o cache e perder metade
    // do prompt seria o mesmo teste verde. `contain` porque o wrapper anexa a
    // instrução de idioma ao system (foi o que este teste achou primeiro).
    const texto = typeof system === 'string' ? system : system.map((b: any) => b.text).join('');
    expect(texto).toContain(SYSTEM_LONGO);
  });

  it('com systemSuffix, cacheSystem:false tira o breakpoint sem tirar o sufixo', async () => {
    await callAI(SYSTEM_LONGO, 'USER', { model: MODELO }, 1000, {
      taskKey: 'teste_cache',
      systemSuffix: 'INSTRUCAO-DO-TURNO',
      cacheSystem: false,
    });

    const system = systemDoUltimo();
    expect(temCacheControl(system)).toBe(false);
    // Dois blocos, na ordem: estável (com a instrução de idioma anexada) e o
    // volátil. O que a opção tira é o breakpoint, não a estrutura.
    expect(system).toHaveLength(2);
    expect(system[0].text).toContain(SYSTEM_LONGO);
    expect(system[1].text).toBe('INSTRUCAO-DO-TURNO');
  });
});

describe('callAIChat · cacheHistory congela system+histórico', () => {
  const historico = [
    { role: 'user' as const, content: 'primeira fala do avaliado' },
    { role: 'assistant' as const, content: 'resposta do interlocutor' },
    { role: 'user' as const, content: 'fala nova' },
  ];

  it('sem cacheHistory: nenhuma mensagem carrega breakpoint', async () => {
    await callAIChat('SYS', historico, { model: MODELO }, 1000, { taskKey: 'teste_cache' });

    const msgs = mocks.requests[mocks.requests.length - 1].messages;
    expect(msgs.some((m: any) => temCacheControl(m.content))).toBe(false);
  });

  it('com cacheHistory: o breakpoint vai na ÚLTIMA mensagem do interlocutor', async () => {
    await callAIChat('SYS', historico, { model: MODELO }, 1000, {
      taskKey: 'teste_cache',
      cacheHistory: true,
    });

    const msgs = mocks.requests[mocks.requests.length - 1].messages;
    const comCache = msgs.filter((m: any) => temCacheControl(m.content));
    expect(comCache).toHaveLength(1);
    expect(comCache[0].role).toBe('assistant');
  });

  it('sem userSuffix, ligar cacheHistory NÃO muda o texto de nenhuma mensagem', async () => {
    // É esta a razão de a cena poder ligar a flag sem revalidar qualidade: a
    // relocação que mexeria no prompt é a do `userSuffix`, e a cena usa
    // `systemSuffix`. Se alguém passar a mover texto aqui, isto fica vermelho.
    await callAIChat('SYS', historico, { model: MODELO }, 1000, { taskKey: 'teste_cache' });
    const semFlag = mocks.requests[mocks.requests.length - 1];

    await callAIChat('SYS', historico, { model: MODELO }, 1000, { taskKey: 'teste_cache', cacheHistory: true });
    const comFlag = mocks.requests[mocks.requests.length - 1];

    const textos = (r: any) =>
      r.messages.map((m: any) =>
        typeof m.content === 'string' ? m.content : m.content.map((b: any) => b.text).join(''),
      );
    expect(textos(comFlag)).toEqual(textos(semFlag));
  });
});

describe('lote (Batch API) · honra o mesmo opt-out', () => {
  const req = (extra: any = {}) => [{
    customId: 'r0',
    system: SYSTEM_LONGO,
    user: 'USER',
    model: MODELO,
    maxTokens: 1000,
    ...extra,
  }];

  it('system longo, sem opção: CACHEIA', async () => {
    await createClaudeBatch(req());

    expect(temCacheControl(mocks.batches[0].requests[0].params.system)).toBe(true);
  });

  it('cacheSystem:false no request do lote: NÃO cacheia', async () => {
    await createClaudeBatch(req({ cacheSystem: false }));

    const system = mocks.batches[0].requests[0].params.system;
    expect(temCacheControl(system)).toBe(false);
    // O lote injeta a instrução de idioma no system — por isso o `contain`, e
    // não igualdade: o que se prova aqui é que o prompt não foi amputado.
    expect(String(system)).toContain(SYSTEM_LONGO);
  });
});

/**
 * O EMISSOR. Os describes acima provam o que o wrapper faz quando recebe a
 * opção; este prova que o call-site que motivou tudo continua mandando.
 *
 * ⚠️ É leitura de texto, no molde do `ledger-taskkey-geradores`: prova que a
 * linha existe, não que ela roda. Exercitar `gerarConteudoIA` de ponta a ponta
 * custaria o gate + Supabase inteiros; a divisão aqui é deliberada.
 */
describe('geração de conteúdo · o opt-out continua no call-site', () => {
  const src = readFileSync(path.join(process.cwd(), 'actions', 'conteudos.ts'), 'utf8');

  it('a geração passa cacheSystem, e VÍDEO fica de fora', () => {
    expect(src, 'o call-site parou de passar cacheSystem — o write órfão volta')
      .toMatch(/cacheSystem\s*=\s*formato === 'video' \? undefined : false/);
    expect(src, 'cacheSystem calculado mas não repassado ao wrapper')
      .toMatch(/taskKey: taskKey \|\| 'conteudo_gerar', empresaId, cacheSystem/);
  });
});
