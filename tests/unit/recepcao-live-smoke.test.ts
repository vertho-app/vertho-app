// Opt-in explícito: tem custo de IA e grava telemetria/prompt_version, nunca roda no CI comum.
import { test, expect } from 'vitest';
import { abrirSessao, responder, encerrar } from '@/lib/recepcao/core.mjs';
import { cenario } from '@/lib/recepcao/cenario.mjs';
import { geradorRecepcao } from '@/lib/recepcao/ai';

test.runIf(process.env.RECEPCAO_LIVE_SMOKE === '1')('sessão sintética com o roteador e provedores reais', async () => {
  const ai = geradorRecepcao(null, null, true);
  let s = abrirSessao(cenario);
  const falas = [
    'Sinto muito pelo transtorno das duas mudanças. Qual horário funciona para você? Prefere manter a Dra. Helena?',
    'Temos 17/09/2026 às 18h com a Dra. Helena. Esse horário funciona para você?',
    'Se estiver de acordo, confirmo 17/09/2026 às 18h com a Dra. Helena, como combinamos. A confirmação fica neste chat.',
  ];
  for (const [i, mensagem] of falas.entries()) s = (await responder(s, { requestId: `live-${i}`, mensagem }, ai.gerar)).estado;
  s = await encerrar(s, ai.gerar);
  expect(s.status).toBe('concluida');
  expect(s.relatorio.dimensoes).toHaveLength(5);
  expect(s.relatorio.coberturaPercentual).toBeGreaterThan(0);
  expect(ai.chamadas.length).toBeGreaterThanOrEqual(4);
  expect(ai.chamadas.length).toBeLessThanOrEqual(5);
  console.log('Sessão real concluída:', { desfecho: s.relatorio.desfecho.tipo, cobertura: s.relatorio.coberturaPercentual, modelos: [...new Set(ai.chamadas.map(c => c.model))] });
}, 240000);
