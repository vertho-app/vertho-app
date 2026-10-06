// Opt-in pago: só compradores fictícios, sessões em memória e ledger real.
import { expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import { diagnosticarGerente } from '../fixtures/simulador-vendas-conversa';
let sb: SupabaseMock;
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({
    from: (t: string) => sb.client.from(t),
    raw: sb.client,
    rpc: (...args: unknown[]) => sb.client.rpc(...args),
  }),
}));
import { gerador } from '@/lib/simulador-vendas/ai';
import { executarCore, type Gerar } from '@/lib/simulador-vendas/core';
import {
  PROMPTS,
  PROMPT_VERSION,
  hashPrompt,
} from '@/lib/simulador-vendas/prompts';
import { modeloVertho } from '@/lib/simulador-vendas/modelos';
import {
  DIFICULDADE_VERTHO_VERSION,
  promptDificuldadeVertho,
  PROMPT_AVALIACAO_VERTHO,
  TRACOS_VERTHO_FACIL,
} from '@/lib/simulador-vendas/dificuldade-vertho';
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

function contexto(): ContextoTreino {
  sb = criarSupabaseMock({});
  sb.client.rpc.mockResolvedValue({ data: { ativo: true }, error: null });
  return {
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
}

test.runIf(process.env.VENDAS_FACIL_LIVE === '1')(
  'fácil Vertho: perguntas simples permitem diagnóstico e próximo passo nos três segmentos',
  async () => {
    const casos = [
      { segmento: 'empresa', indice: 0 },
      { segmento: 'escola_privada', indice: 6 },
      { segmento: 'rede_publica', indice: 8 },
    ] as const;
    const filtro = process.env.VENDAS_FACIL_SEGMENTO;
    expect(!filtro || casos.some((caso) => caso.segmento === filtro)).toBe(
      true,
    );
    for (const [i, caso] of casos.entries()) {
      if (filtro && filtro !== caso.segmento) continue;
      const c = contexto();
      const prompts = Object.fromEntries(
        ETAPAS.map((etapa) => {
          const texto =
            PROMPTS[etapa] +
            (['criador', 'cliente'].includes(etapa)
              ? PROMPT_COMERCIAL_VERTHO + promptDificuldadeVertho(etapa, 1)
              : '') +
            (etapa === 'gerente' ? PROMPT_AVALIACAO_VERTHO : '');
          return [
            etapa,
            {
              texto,
              hash: hashPrompt(texto),
              versao: `${PROMPT_VERSION}-${DIFICULDADE_VERTHO_VERSION}`,
              ...modeloVertho(etapa, 1),
            },
          ];
        }),
      ) as PromptSnapshot;
      let s: Estado = {
        ...estado(),
        id: randomUUID(),
        revisao: 0,
        nivel: 1,
        status: 'preparando',
        nomeVendedor: c.nomeVendedor,
        briefing: BRIEFING_VERTHO,
        prompts,
        vertho: criarContextoCompetitivoVertho(
          { segmento: caso.segmento },
          caso.indice,
        ),
        versaoRegua: REGUA_VERSION,
        diversidade: { seed: TRACOS_VERTHO_FACIL[i], anteriores: [] },
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
          nivel: 1,
          vertho: { segmento: caso.segmento },
          requestId: s.id,
        },
        gerador(c, s, s.id),
      );
      expect(s.cenario?.personagem.negociacao.objecoes).toHaveLength(1);
      expect(s.cenario?.personagem.negociacao.objecoes_profundas).toEqual([]);
      expect(['Estável', 'Influente']).toContain(
        s.cenario?.personagem.personalidade_pace,
      );
      expect(
        s.cenario?.personagem.negociacao.beneficios_ocultos.length,
      ).toBeLessThanOrEqual(2);
      const planejar = randomUUID();
      s = await executarCore(
        s,
        {
          acao: 'planejar',
          requestId: planejar,
          sessaoId: s.id,
          revisao: s.revisao,
          planejamento:
            'Conhecer a rotina de desenvolvimento dos profissionais, ouvir uma necessidade, compreender o resultado desejado e cocriar uma demonstração pequena com um responsável. Verificar o que já funciona e complementar a solução existente.',
        },
        gerador(c, s, planejar),
      );
      const mensagens = [
        'ok',
        `Olá, ${s.cenario?.personagem.nome}! Como vocês desenvolvem as habilidades da equipe hoje e o que gostariam de melhorar?`,
        'O que você gostaria que os profissionais passassem a fazer melhor na rotina? Como vocês perceberiam essa mudança na prática?',
        'Pelo que você trouxe, podemos construir uma solução de desenvolvimento para essas necessidades: prática contextualizada e acompanhamento da evolução, complementando o que já funciona. Faz sentido para sua equipe?',
        'Podemos começar com um grupo pequeno e ajustar o ritmo à rotina. Os exercícios e o acompanhamento ajudam a observar a aplicação no trabalho antes de ampliar o escopo. Assim vocês podem avaliar a utilidade sem substituir a solução atual. Isso esclarece sua dúvida?',
        'Podemos combinar uma demonstração técnica de 30 minutos na próxima semana, com um responsável da sua equipe, para definir juntos o escopo e as evidências esperadas? Quem você sugere que participe?',
      ];
      const fases: string[] = [];
      for (const [turno, mensagem] of mensagens.entries()) {
        const requestId = randomUUID();
        s = await executarCore(
          s,
          {
            acao: 'responder',
            sessaoId: s.id,
            revisao: s.revisao,
            requestId,
            mensagem,
          },
          gerador(c, s, requestId),
        );
        fases.push(s.fase);
        if (turno === 0) expect(s.fase).toBe('preparar');
        if (turno === 1) expect(s.fase).toBe('analisar');
      }
      mkdirSync('output/simulador-vertho-facil', { recursive: true });
      writeFileSync(
        `output/simulador-vertho-facil/${caso.segmento}.json`,
        JSON.stringify(
          {
            segmento: caso.segmento,
            segundos: Math.round((Date.now() - inicio) / 1000),
            fases,
            estado: s,
          },
          null,
          2,
        ),
      );
      expect(s.fase).toBe('engajar');
      expect(s.vertho?.concorrente.id).toBe(
        criarContextoCompetitivoVertho({ segmento: caso.segmento }, caso.indice)
          .concorrente.id,
      );
    }
  },
  600000,
);

test.runIf(
  process.env.VENDAS_FACIL_LIVE === '1' ||
    process.env.VENDAS_SONNET_AVALIACAO_LIVE === '1',
)(
  'Sonnet 5.5 avalia a conversa comercial com a matriz e fontes PACE',
  async () => {
    const c = contexto();
    const { estado: s } = JSON.parse(
      readFileSync('output/simulador-vertho-facil/empresa.json', 'utf8'),
    ) as { estado: Estado };
    expect(s.prompts.gerente.modelo).toBe('claude-sonnet-5-5');
    // Apenas esta sessão sintética em memória recebe o prompt atual para repetir
    // a avaliação sem pagar novamente pela conversa; snapshots reais são imutáveis.
    const texto = PROMPTS.gerente + PROMPT_AVALIACAO_VERTHO;
    s.prompts.gerente = {
      texto,
      hash: hashPrompt(texto),
      versao: `${PROMPT_VERSION}-${DIFICULDADE_VERTHO_VERSION}`,
      ...modeloVertho('gerente', 1),
    };
    const requestId = randomUUID();
    const inicio = Date.now();
    const real = gerador(c, s, requestId);
    let tentativa = 0;
    const capturar: Gerar = (etapa, valores, validar) =>
      real(etapa, valores, (resultado) => {
        tentativa++;
        const path = `output/simulador-vertho-facil/sonnet-tentativa-${tentativa}.json`;
        writeFileSync(path, JSON.stringify(resultado, null, 2));
        try {
          validar?.(resultado);
        } catch (e) {
          console.error(
            'Validação Sonnet:',
            e instanceof Error ? e.message : String(e),
          );
          throw e;
        }
      });
    const final = await executarCore(
      s,
      { acao: 'encerrar', sessaoId: s.id, revisao: s.revisao, requestId },
      capturar,
    );
    expect(final.relatorio).toBeTruthy();
    expect(diagnosticarGerente(JSON.stringify(final.relatorio), null, s)).toBe(
      'ok',
    );
    writeFileSync(
      'output/simulador-vertho-facil/avaliacao-sonnet.json',
      JSON.stringify(
        {
          segundos: Math.round((Date.now() - inicio) / 1000),
          estado: final,
        },
        null,
        2,
      ),
    );
  },
  300000,
);
