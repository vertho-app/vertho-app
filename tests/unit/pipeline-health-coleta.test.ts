import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * F17 da auditoria de 09-10/08/2026 — "o health-check reporta 'sem problemas'
 * quando a própria coleta falha".
 *
 * O gate de verificação (10/08) separou a CLASSE do SINTOMA:
 *
 *  · CLASSE — CONFIRMADA por leitura: `empresasAtivas` (`core.ts`) fazia
 *    `const { data } = await sb.from('empresas')…` sem checar `error`. Falha na
 *    query → lista vazia → os três modos que dependem dela varrem zero empresas
 *    → `executarHealthCheck` reporta "0 run(s) · 0 crítico(s) · 0 aviso(s)".
 *    Não conseguir olhar produzia a mesma saída que olhar e estar tudo bem.
 *
 *  · SINTOMA — REATRIBUÍDO. O plano usava como prova "o preflight gravou run em
 *    1 de 13 dias contra 13/13 do estrutural". Medido em 10/08: `empresasAtivas`
 *    funciona (error null, 10 empresas não-demo) e `rodarPreflight` para amanhã
 *    devolve `[]` porque nenhuma empresa tem entrega prevista — o `continue` do
 *    laço, que é comportamento desenhado. O número não provava a classe.
 *
 * Este teste trava a classe. Ele só é exprimível porque o mock de Supabase passou
 * a saber falhar (F16); com `error: null` hardcoded, o ramo não existia.
 */

let sb = criarSupabaseMock({});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import {
  rodarPreflight, rodarPostflight, minutosDesdeODisparo, MINUTOS_MINIMOS_APOS_DISPARO,
} from '@/lib/pipeline-health/core';

beforeEach(() => { sb = criarSupabaseMock({}); });

describe('health-check: falha de coleta ≠ ausência de problema', () => {
  it('a listagem de empresas falhando LANÇA — não devolve lista vazia', async () => {
    sb = criarSupabaseMock({ falhas: [{ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' }] });

    await expect(rodarPreflight(new Date('2026-08-11T00:00:00Z')))
      .rejects.toThrow(/não conseguiu listar empresas|timeout no pool/i);
  });

  it('sem falha, devolve resultado (vazio é legítimo: nem todo dia tem entrega)', async () => {
    sb = criarSupabaseMock({ lista: () => [] });
    const r = await rodarPreflight(new Date('2026-08-11T00:00:00Z'));
    expect(Array.isArray(r)).toBe(true);
  });
});

/**
 * 🔴 O pós-voo julgando cedo demais — medido em 03/08 e 17/08/2026.
 *
 * O `trigger_diario` virou DISPATCHER (fan-out de uma task QStash por empresa),
 * e o pós-voo continuou rodando no mesmo request. Passou a medir o
 * ENFILEIRAMENTO: em 17/08 o run das 11:00:21 UTC gritou "Nenhum WhatsApp saiu
 * hoje · 36 pessoas sem nada" enquanto as 36 pílulas eram entregues entre
 * 11:00:28 e 11:00:43.
 *
 * O alarme não ficou mudo — ficou MENTIROSO, que é pior: ensina a ignorar.
 */
describe('pós-voo: não julgar antes de a entrega ter tido tempo de acontecer', () => {
  const alvo = new Date('2026-08-17T00:00:00Z');

  it('minutos desde o disparo são contados a partir das 11:00 UTC do dia alvo', () => {
    expect(minutosDesdeODisparo(new Date('2026-08-17T11:00:21Z'), alvo)).toBe(0);
    expect(minutosDesdeODisparo(new Date('2026-08-17T11:45:00Z'), alvo)).toBe(45);
    expect(minutosDesdeODisparo(new Date('2026-08-17T10:30:00Z'), alvo)).toBe(-30);
  });

  it('rodando junto com o disparo, ABSTÉM-SE em vez de acusar pane', async () => {
    sb = criarSupabaseMock({ lista: () => [] });
    const r = await rodarPostflight(alvo, undefined, new Date('2026-08-17T11:00:21Z'));

    expect(r).toHaveLength(1);
    expect(r[0].severidade).toBe('aviso'); // não é crítico: ninguém deve ser acordado
    expect(r[0].achados[0].id).toBe('postflight-cedo-demais');
    // Registrado, não sumido: silêncio por abstenção é indistinguível de "tudo ok".
    expect(r[0].achados.map((a) => a.id)).not.toContain('canal-whatsapp-zerado');
  });

  it('45 min depois, julga normalmente', async () => {
    sb = criarSupabaseMock({ lista: () => [] });
    const r = await rodarPostflight(alvo, undefined, new Date('2026-08-17T11:45:00Z'));
    // Sem empresas no mock não há run — o que importa é NÃO ter se abstido.
    expect(r.some((x) => x.achados.some((a) => a.id === 'postflight-cedo-demais'))).toBe(false);
  });

  it('a folga do cron cobre a guarda do código', () => {
    // 11:45 no `vercel.json` contra 25 min aqui: a diferença é a margem para o
    // fan-out atrasar sem que o check vire ruído.
    expect(MINUTOS_MINIMOS_APOS_DISPARO).toBeLessThan(45);
    expect(MINUTOS_MINIMOS_APOS_DISPARO).toBeGreaterThanOrEqual(15);
  });
});
