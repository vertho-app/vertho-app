// Opt-in pago: criador + primeira resposta nos três níveis, com fatos congelados.
// Banco de sessões em memória; provedor e ledger reais. Não altera histórico de vendedor.
import { expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
let sb: SupabaseMock;
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({
    from: (t: string) => sb.client.from(t),
    raw: sb.client,
    rpc: (...args: unknown[]) => sb.client.rpc(...args),
  }),
}));
import { gerador } from '@/lib/simulador-vendas/ai';
import { executarCore, visaoPublica } from '@/lib/simulador-vendas/core';
import {
  hashPrompt,
  PROMPTS,
  PROMPT_VERSION,
} from '@/lib/simulador-vendas/prompts';
import { getModelForTask } from '@/lib/ai-tasks';
import {
  BRIEFING_VERTHO,
  criarContextoCompetitivoVertho,
  PROMPT_COMERCIAL_VERTHO,
  VERTHO_TREINO_EMPRESA_ID,
} from '@/lib/simulador-vendas/vertho';
import {
  ETAPAS,
  REGUA_VERSION,
  type Estado,
  type PromptSnapshot,
} from '@/lib/simulador-vendas/schema';
import type { ContextoTreino } from '@/lib/simulador-vendas/access';

test.runIf(process.env.VENDAS_VERTHO_LIVE === '1')(
  'Vertho: cenários competitivos e conversa nos três níveis com provedor real',
  async () => {
    const resultados: unknown[] = [];
    for (const nivel of [1, 2, 3] as const) {
      sb = criarSupabaseMock({});
      sb.client.rpc.mockResolvedValue({ data: { ativo: true }, error: null });
      const prompts = Object.fromEntries(
        await Promise.all(
          ETAPAS.map(async (etapa) => {
            const texto =
              PROMPTS[etapa] +
              (['criador', 'cliente'].includes(etapa)
                ? PROMPT_COMERCIAL_VERTHO
                : '');
            return [
              etapa,
              {
                texto,
                hash: hashPrompt(texto),
                versao: `${PROMPT_VERSION}-comercial-1`,
                modelo: await getModelForTask(
                  VERTHO_TREINO_EMPRESA_ID,
                  `sim_vendas_${etapa}`,
                ),
              },
            ];
          }),
        ),
      ) as PromptSnapshot;
      const id = randomUUID();
      const vertho = criarContextoCompetitivoVertho(
        nivel === 1
          ? { segmento: 'empresa', frente: 'competencias' }
          : nivel === 2
            ? { segmento: 'escola_privada', frente: 'aprendizagem' }
            : { segmento: 'rede_publica', frente: 'simulacao' },
        nivel * 23,
      );
      const c: ContextoTreino = {
        auth: null,
        empresaId: VERTHO_TREINO_EMPRESA_ID,
        empresaNome: 'Vertho',
        colaboradorId: null,
        ownerKey: `vendedor:${randomUUID()}`,
        nomeVendedor: 'Vendedor de validação',
        soAcompanha: false,
        config: null,
        vertho: { id: randomUUID(), email: 'validacao@example.invalid' },
        tdb: {
          from: (t: string) => sb.client.from(t),
          raw: sb.client,
        } as unknown as ContextoTreino['tdb'],
      };
      let s: Estado = {
        ...estado(),
        id,
        nivel,
        revisao: 0,
        status: 'preparando',
        nomeVendedor: c.nomeVendedor,
        briefing: BRIEFING_VERTHO,
        prompts,
        vertho,
        versaoRegua: REGUA_VERSION,
        mensagens: [],
        moderacoes: [],
        recibos: [],
        cenario: null,
      };
      const inicio = Date.now();
      s = await executarCore(
        s,
        {
          acao: 'iniciar',
          nivel,
          vertho: { segmento: vertho.segmento, frente: vertho.frente },
          requestId: id,
        },
        gerador(c, s, id),
      );
      expect(s.cenario?.personagem.negociacao.objecoes).toHaveLength(nivel);
      expect(JSON.stringify(s.cenario).toLowerCase()).toContain(
        vertho.concorrente.nome.split(/[ (/]/)[0].toLowerCase(),
      );
      s = await executarCore(
        s,
        {
          acao: 'planejar',
          sessaoId: id,
          revisao: s.revisao,
          requestId: randomUUID(),
          planejamento:
            'Investigar o processo atual, as necessidades dos profissionais, as soluções já utilizadas, a adesão e como a instituição comprova a evolução. Perguntar critérios de decisão e cocriar uma avaliação ou demonstração com escopo e responsável definidos.',
        },
        gerador(c, s, randomUUID()),
      );
      const request = randomUUID();
      s = await executarCore(
        s,
        {
          acao: 'responder',
          sessaoId: id,
          revisao: s.revisao,
          requestId: request,
          mensagem: `Olá, ${s.cenario?.personagem.nome}. Quero entender como vocês desenvolvem as habilidades dos profissionais hoje. O que já funciona bem e quais necessidades fizeram vocês considerar uma nova conversa?`,
        },
        gerador(c, s, request),
      );
      expect(s.mensagens.some((m) => m.autor === 'cliente')).toBe(true);
      expect(s.vertho).toEqual(vertho);
      resultados.push({
        nivel,
        concorrente: vertho.concorrente.nome,
        segmento: vertho.segmento,
        frente: vertho.frente,
        segundos: Math.round((Date.now() - inicio) / 1000),
        sessao: visaoPublica(s),
      });
    }
    mkdirSync('output/simulador-vertho-live', { recursive: true });
    writeFileSync(
      'output/simulador-vertho-live/resultados.json',
      JSON.stringify(resultados, null, 2),
    );
  },
  600000,
);
