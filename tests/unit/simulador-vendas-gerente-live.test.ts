// Opt-in pago (~US$ 0,20): primeira medição REAL do avaliador do vendas na régua pace-7
// (prompts vertho-7, matriz de 30 descritores com regra de cobertura), que entrou em 19/09/2026
// sem nenhuma sessão real: a última em produção é de 14/09, ainda na pace-2.
//
// VENDAS_GERENTE_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/simulador-vendas-gerente-live.test.ts
//
// Percorre o caminho de produção do encerramento: `executarCore` com o `gerador` real (tentativa,
// prompt do snapshot, esquema, validação e uma regeneração), só com o banco em memória. Responde:
// quanto tempo leva (cabe no teto de 200 s por chamada?), se passa na validação, quantos
// descritores caem na tolerância de citação e quantas competências ficam com nível.
//
// Primeira medição (19/09/2026, gpt-5.4-2026-03-05): 26 s numa chamada, validação ok, nenhum
// descartado; PL 6/6 N3, P 6/6 N2, A 6/6 N2, C 6/6 N2, E 4/4 N3, média 2,83.
import { test, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { criarSupabaseMock } from '../helpers/supabase-mock';

// Passa direto para o provedor real; só guarda a saída bruta e o tempo de cada chamada.
const chamadas = vi.hoisted(() => [] as Array<{ segundos: number; saida: string | null; erro: string | null }>);
vi.mock('@/actions/ai-client', async (original) => {
  const real = await original<typeof import('@/actions/ai-client')>();
  return {
    ...real,
    callAI: async (...args: Parameters<typeof real.callAI>) => {
      const inicio = Date.now();
      try {
        const saida = await real.callAI(...args);
        chamadas.push({ segundos: Math.round((Date.now() - inicio) / 1000), saida, erro: null });
        return saida;
      } catch (e) {
        chamadas.push({ segundos: Math.round((Date.now() - inicio) / 1000), saida: null, erro: String((e as Error).message).slice(0, 300) });
        throw e;
      }
    },
  };
});

import { getModelForTask } from '@/lib/ai-tasks';
import { gerador } from '@/lib/simulador-vendas/ai';
import { executarCore } from '@/lib/simulador-vendas/core';
import { PROMPT_VERSION } from '@/lib/simulador-vendas/prompts';
import { REGUA_VERSION, type Estado } from '@/lib/simulador-vendas/schema';
import { consolidarMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';
import { diagnosticarGerente, estadoConversaCompleta } from '../fixtures/simulador-vendas-conversa';

const ATIVO = process.env.VENDAS_GERENTE_LIVE === '1';
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');

test.runIf(ATIVO)('pace-7: tempo, validação e cobertura do avaliador do vendas com uma conversa completa', async () => {
  const sb = criarSupabaseMock({});
  // Só o banco é de mentira: o gerador escreve a tentativa e lê o prompt do snapshot por aqui.
  const tdb = { from: (t: string) => sb.client.from(t), raw: sb.client } as any;
  const modelo = await getModelForTask(null, 'sim_vendas_gerente');
  const s = estadoConversaCompleta(modelo);
  const c = { empresaId: '10000000-0000-4000-8000-000000000001', colaboradorId: null, auth: { isPlatformAdmin: true }, tdb } as any;
  const inicio = Date.now();
  let erro = 'ok';
  let final: Estado | null = null;
  try {
    final = await executarCore(s, { acao: 'encerrar', requestId: randomUUID(), sessaoId: s.id, revisao: s.revisao }, gerador(c, s, randomUUID()));
  } catch (e) {
    erro = String((e as Error).message).slice(0, 300);
  }
  const segundos = Math.round((Date.now() - inicio) / 1000);
  const r: any = final?.relatorio;
  const competencias = r?.Matriz ? consolidarMatriz(r.Matriz, REGUA_VERSION) : [];
  const linha = {
    modelo,
    versao: PROMPT_VERSION,
    regua: REGUA_VERSION,
    segundos,
    chamadas: chamadas.map((ch) => ({ segundos: ch.segundos, diagnostico: diagnosticarGerente(ch.saida, ch.erro, s) })),
    erro,
    descartados: r?.Matriz?.descartados ?? [],
    competencias: competencias.map((x: any) => `${x.codigo}: ${x.observados}/${x.total}${x.nivel ? ` N${x.nivel}` : ' sem nível'}`),
    notas: r ? { PL: r.PL, P: r.P, A: r.A, C: r.C, E: r.E, Media: r.Media } : null,
  };
  mkdirSync('backups', { recursive: true });
  writeFileSync(`backups/vendas-gerente-${carimbo}.json`, JSON.stringify({ linha, relatorio: r ?? null, saidas: chamadas.map((ch) => ch.saida) }, null, 2));
  console.log(JSON.stringify(linha));
  expect(erro).toBe('ok');
}, 330000);
