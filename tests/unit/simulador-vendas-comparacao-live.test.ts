// Opt-in pago. Conversas inteiramente fictícias; não cria sessões de vendedores.
import { expect, test, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  estadoConversaCompleta,
  diagnosticarGerente,
} from '../fixtures/simulador-vendas-conversa';
import { callAI } from '@/actions/ai-client';
import { gerador } from '@/lib/simulador-vendas/ai';
import { executarCore } from '@/lib/simulador-vendas/core';
import {
  mensagensDoPrompt,
  PROMPTS,
  hashPrompt,
  PROMPT_VERSION,
} from '@/lib/simulador-vendas/prompts';
import { SAIDAS, FASES, type Estado } from '@/lib/simulador-vendas/schema';
import { validarFalaCliente } from '@/lib/simulador-vendas/avaliacao';
import { PROMPT_COMERCIAL_VERTHO } from '@/lib/simulador-vendas/vertho';
import { BEDROCK_KIMI_K3_MODEL } from '@/lib/ai-provedores';
import { VERTHO_TREINO_EMPRESA_ID } from '@/lib/simulador-vendas/vertho';

test.runIf(process.env.VENDAS_MODELOS_LIVE === '1')(
  'compara cliente Sonnet/Kimi e valida Opus na avaliação',
  async () => {
    const resultados: unknown[] = [];
    const casos = JSON.parse(
      readFileSync('output/simulador-vertho-live/resultados.json', 'utf8'),
    ) as Array<{ nivel: number; estado: Estado }>;
    // Esta fixture é sintética e serve para verificar a mesma rubrica PACE em duas repetições.
    // Não é o corpus comercial Vertho: esse é medido no ensaio dos três níveis.
    const jsonSchema = z.toJSONSchema(SAIDAS.cliente, { target: 'draft-7' });
    delete jsonSchema.$schema;
    for (const nivel of [2, 3] as const) {
      const s = casos.find((caso) => caso.nivel === nivel)?.estado;
      if (!s?.cenario || !s.vertho)
        throw new Error('Execute primeiro o ensaio Vertho dos três níveis.');
      const values = {
        bloco_dinamico: JSON.stringify(s.cenario),
        historico: s.mensagens,
        input_vendedor:
          'Como vocês identificam as competências que precisam desenvolver e acompanham se o aprendizado se transforma em prática?',
        fase_atual: s.fase,
        sinal_moderador: '',
        contexto_competitivo: { ...s.vertho, briefing: s.briefing },
      };
      const mensagens = mensagensDoPrompt(
        PROMPTS.cliente + PROMPT_COMERCIAL_VERTHO,
        values,
      );
      for (let repeticao = 1; repeticao <= 2; repeticao++) {
        for (const modelo of ['claude-sonnet-5-5', BEDROCK_KIMI_K3_MODEL]) {
          const inicio = Date.now();
          const raw = await callAI(
            mensagens.system,
            mensagens.user,
            { model: modelo },
            6000,
            {
              taskKey: 'canario_contrato',
              source: 'simulator',
              empresaId: VERTHO_TREINO_EMPRESA_ID,
              correlationId: randomUUID(),
              locale: 'pt-BR',
              reasoningEffort: 'low',
              semRetentativa: true,
              timeoutMs: 90000,
              maxRetries: 0,
              structuredOutput: { name: 'pace_cliente', schema: jsonSchema },
            },
          );
          const resposta = SAIDAS.cliente.parse(JSON.parse(raw));
          const salto = FASES.indexOf(resposta.fase) - FASES.indexOf(s.fase);
          expect(salto).toBeGreaterThanOrEqual(0);
          expect(salto).toBeLessThanOrEqual(1);
          expect(resposta.fase_mudou).toBe(salto === 1);
          validarFalaCliente(resposta.fala);
          resultados.push({
            nivel,
            repeticao,
            modelo,
            segundos: Math.round((Date.now() - inicio) / 1000),
            resposta,
          });
        }
      }
    }
    for (let repeticao = 1; repeticao <= 2; repeticao++) {
      const sb = criarSupabaseMock({});
      const s = estadoConversaCompleta('claude-opus-5-5');
      s.prompts.gerente = {
        texto: PROMPTS.gerente,
        hash: hashPrompt(PROMPTS.gerente),
        versao: PROMPT_VERSION,
        modelo: 'claude-opus-5-5',
        esforco: 'medium',
      };
      const c = {
        empresaId: VERTHO_TREINO_EMPRESA_ID,
        colaboradorId: null,
        auth: { isPlatformAdmin: true },
        tdb: { from: (t: string) => sb.client.from(t), raw: sb.client },
      } as any;
      const inicio = Date.now();
      const final = await executarCore(
        s,
        {
          acao: 'encerrar',
          requestId: randomUUID(),
          sessaoId: s.id,
          revisao: s.revisao,
        },
        gerador(c, s, randomUUID()),
      );
      expect(final.relatorio).toBeTruthy();
      expect(
        diagnosticarGerente(JSON.stringify(final.relatorio), null, s),
      ).toBe('ok');
      resultados.push({
        repeticao,
        modelo: 'claude-opus-5-5',
        segundos: Math.round((Date.now() - inicio) / 1000),
        relatorio: final.relatorio,
      });
    }
    mkdirSync('output/simulador-vendas-modelos', { recursive: true });
    writeFileSync(
      'output/simulador-vendas-modelos/comparacao.json',
      JSON.stringify(resultados, null, 2),
    );
  },
  900000,
);
