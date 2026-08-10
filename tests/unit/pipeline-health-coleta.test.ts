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

import { rodarPreflight } from '@/lib/pipeline-health/core';

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
