// Opt-in pago: criador + três respostas nos três níveis, com fatos congelados.
// Banco de sessões em memória; provedor e ledger reais. Não altera histórico de vendedor.
import { expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { modeloVertho } from '@/lib/simulador-vendas/modelos';
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
    // O filtro permite investigar apenas um caso pago que tenha falhado.
    const filtro = process.env.VENDAS_VERTHO_NIVEL;
    const niveis = ([1, 2, 3] as const).filter(
      (n) => !filtro || String(n) === filtro,
    );
    expect(niveis.length).toBeGreaterThan(0);
    const resultados: Array<{ nivel: number; [key: string]: unknown }> =
      filtro && existsSync('output/simulador-vertho-live/resultados-kimi.json')
        ? JSON.parse(
            readFileSync(
              'output/simulador-vertho-live/resultados-kimi.json',
              'utf8',
            ),
          ).filter(
            (caso: { nivel: number }) =>
              !niveis.includes(caso.nivel as 1 | 2 | 3),
          )
        : [];
    for (const nivel of niveis) {
      console.log(`Validando cenário e conversa Vertho, nível ${nivel}`);
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
                versao: `${PROMPT_VERSION}-comercial-2`,
                ...modeloVertho(etapa, nivel),
              },
            ];
          }),
        ),
      ) as PromptSnapshot;
      const id = randomUUID();
      const vertho = criarContextoCompetitivoVertho(
        nivel === 1
          ? { segmento: 'empresa' }
          : nivel === 2
            ? { segmento: 'escola_privada' }
            : { segmento: 'rede_publica' },
        nivel === 1 ? 0 : nivel === 2 ? 6 : 8,
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
          vertho: { segmento: vertho.segmento },
          requestId: id,
        },
        gerador(c, s, id),
      );
      expect(s.cenario?.personagem.negociacao.objecoes).toHaveLength(nivel);
      // O contexto público não deve antecipar necessidades e objeções reservadas.
      // A aderência à solução é conferida no contexto do gerente/personagem.
      mkdirSync('output/simulador-vertho-live', { recursive: true });
      writeFileSync(
        `output/simulador-vertho-live/cenario-kimi-nivel-${nivel}.json`,
        JSON.stringify(s.cenario, null, 2),
      );
      expect(
        JSON.stringify({
          contexto_gerente: s.cenario?.contexto_gerente,
          negociacao: s.cenario?.personagem.negociacao,
        }).toLowerCase(),
      ).toMatch(/desenvolvimento|competências|formação/);
      expect(s.cenario?.personagem.negociacao.preco).toEqual({
        minimo_aceitavel: '',
        ideal: '',
      });
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
          mensagem: `Olá, ${s.cenario?.personagem.nome}. Sou da Vertho, uma solução de desenvolvimento de competências. Podemos usar 15 minutos para entender seu processo atual e suas necessidades de desenvolvimento e depois avaliar juntos se faz sentido um próximo passo?`,
        },
        gerador(c, s, request),
      );
      expect(s.mensagens.some((m) => m.autor === 'cliente')).toBe(true);
      for (const mensagem of [
        'O que a solução atual atende bem e quais necessidades de desenvolvimento ainda precisam de atenção? Como vocês acompanham a aplicação do aprendizado no trabalho?',
        'Podemos construir uma solução de desenvolvimento para essas necessidades, complementando o que já funciona. Quais evidências, critérios e pessoas precisam participar da decisão? Podemos definir juntos uma avaliação técnica ou demonstração como próximo passo?',
      ]) {
        const requestId = randomUUID();
        s = await executarCore(
          s,
          {
            acao: 'responder',
            sessaoId: id,
            revisao: s.revisao,
            requestId,
            mensagem,
          },
          gerador(c, s, requestId),
        );
      }
      expect(s.mensagens.filter((m) => m.autor === 'cliente')).toHaveLength(3);
      expect(s.vertho).toEqual(vertho);
      resultados.push({
        nivel,
        concorrente: vertho.concorrente.nome,
        segmento: vertho.segmento,
        necessidades: s.cenario?.personagem.negociacao.beneficios_ocultos,
        segundos: Math.round((Date.now() - inicio) / 1000),
        sessao: visaoPublica(s),
        estado: s,
      });
      writeFileSync(
        'output/simulador-vertho-live/resultados-kimi.json',
        JSON.stringify(resultados, null, 2),
      );
    }
    mkdirSync('output/simulador-vertho-live', { recursive: true });
    writeFileSync(
      'output/simulador-vertho-live/resultados.json',
      JSON.stringify(resultados, null, 2),
    );
  },
  600000,
);
