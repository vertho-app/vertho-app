import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn() }));

import {
  rodarRetentativasIA3, regenerarAteLimiarIA3, montarFeedbackRegeneracaoIA3,
  IA3_LIMIAR_APROVACAO, IA3_MAX_RODADAS_AUTO,
} from '@/lib/ia3-cenarios';

/**
 * Regeneração automática (01/10/2026): gatilho < 80, até 3 rodadas, feedback do CAMPEÃO,
 * trava (nunca piora). Medido na Amazon Bowling: com feedback o Sonnet 5.5 resolveu 14 de
 * 14 dos cenários que o 4.6 não conseguia; recriar do zero foi pior nos três modelos.
 */
const lerFonte = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf8');

type R = { ok: true; nota: number; cand: string; feedback: string } | { ok: false; erro: string };
const seq = (...rs: R[]) => { const fila = [...rs]; const fb: any[] = []; return { gerar: async (f: any) => { fb.push(f); const r = fila.shift(); if (!r) throw new Error('sem resposta'); return r; }, fb }; };
const ok = (nota: number, cand = `c${nota}`): R => ({ ok: true, nota, cand, feedback: `fb${nota}` });

describe('constantes da regra', () => {
  it('gatilho 80 e teto de 3 rodadas (decisão do dono, 01/10/2026)', () => {
    expect(IA3_LIMIAR_APROVACAO).toBe(80);
    expect(IA3_MAX_RODADAS_AUTO).toBe(3);
  });
});

describe('rodarRetentativasIA3 — orquestração', () => {
  it('para na 1ª rodada que atinge o limiar (não gasta a 2ª)', async () => {
    const s = seq(ok(84), ok(90));
    const r = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(r.atingiuLimiar).toBe(true);
    expect(r.notaFinal).toBe(84);
    expect(r.campeao).toBe('c84');
    expect(r.rodadas).toHaveLength(1);
  });

  it('a rodada seguinte recebe o feedback do CAMPEÃO, não o do original', async () => {
    const s = seq(ok(70), ok(85));
    await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(s.fb).toEqual(['fb0', 'fb70']);
  });

  it('a trava descarta candidata pior: o campeão e o feedback ficam', async () => {
    const s = seq(ok(70), ok(55), ok(82));
    const r = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(r.rodadas.map((x) => x.promovida)).toEqual([true, false, true]);
    // 3ª rodada recebeu o feedback da 1ª (campeão), não o da candidata descartada de 55
    expect(s.fb).toEqual(['fb0', 'fb70', 'fb70']);
    expect(r.notaFinal).toBe(82);
  });

  it('esgota as rodadas abaixo do limiar: atingiuLimiar=false e nota final = a do melhor campeão', async () => {
    const s = seq(ok(60), ok(72), ok(70));
    const r = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(r.atingiuLimiar).toBe(false);
    expect(r.rodadas).toHaveLength(3);
    expect(r.notaFinal).toBe(72);
    expect(r.campeao).toBe('c72');
  });

  it('nenhuma candidata promovida → campeao null (o cenário atual fica)', async () => {
    const s = seq(ok(50), ok(40), ok(30));
    const r = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(r.campeao).toBeNull();
    expect(r.notaFinal).toBe(60);
  });

  it('falha de uma rodada (erro ou exceção) gasta a rodada e segue', async () => {
    const s = seq({ ok: false, erro: 'IA não retornou cenário válido' }, ok(83));
    const r = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(r.rodadas[0]).toMatchObject({ ok: false });
    expect(r.atingiuLimiar).toBe(true);
    const lanca = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 2, gerar: async () => { throw new Error('rede'); } });
    expect(lanca.rodadas.every((x) => !x.ok)).toBe(true);
    expect(lanca.atingiuLimiar).toBe(false);
  });

  it('nota já no limiar: nenhuma rodada', async () => {
    const s = seq(ok(99));
    const r = await rodarRetentativasIA3({ notaInicial: 80, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 3, gerar: s.gerar });
    expect(r.rodadas).toHaveLength(0);
    expect(r.atingiuLimiar).toBe(true);
  });

  it('respeita maxRodadas', async () => {
    const s = seq(ok(61), ok(62), ok(63), ok(64));
    const r = await rodarRetentativasIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, maxRodadas: 2, gerar: s.gerar });
    expect(r.rodadas).toHaveLength(2);
  });
});

describe('regenerarAteLimiarIA3 — pré-condições (nada é gerado nem pago)', () => {
  const sbCom = (cen: any) => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: cen }) }) }) }),
  });

  it('cenário inexistente / sem empresa → erro', async () => {
    expect((await regenerarAteLimiarIA3(sbCom(null), { cenarioId: 'x' })).success).toBe(false);
    expect((await regenerarAteLimiarIA3(sbCom({ id: 'x', empresa_id: null, nota_check: 50 }), { cenarioId: 'x' })).success).toBe(false);
  });

  it('sem nota (nunca checado) → pula e manda rodar o check antes', async () => {
    const r = await regenerarAteLimiarIA3(sbCom({ id: 'x', empresa_id: 'e', nota_check: null }), { cenarioId: 'x' });
    expect(r).toMatchObject({ success: true });
    expect(r.pulado).toMatch(/check/);
  });

  it('já no limiar → pula', async () => {
    const r = await regenerarAteLimiarIA3(sbCom({ id: 'x', empresa_id: 'e', nota_check: 80 }), { cenarioId: 'x' });
    expect(r.pulado).toBe('já no limiar');
    expect(r.atingiuLimiar).toBe(true);
  });

  it('tentativas já esgotadas → pula (idempotência da retomada), e FORCAR não é o default', async () => {
    const cen = { id: 'x', empresa_id: 'e', nota_check: 60, alertas_check: { regeneracao_auto: { esgotado: true } } };
    const r = await regenerarAteLimiarIA3(sbCom(cen), { cenarioId: 'x' });
    expect(r.pulado).toMatch(/esgotadas/);
  });
});

describe('montarFeedbackRegeneracaoIA3 — mesma montagem histórica', () => {
  it('junta justificativa, sugestão, ponto fraco, descritores sem cobertura e perguntas de risco', () => {
    const t = montarFeedbackRegeneracaoIA3({
      justificativa_check: 'J', sugestao_check: 'S',
      alertas_check: { ponto_mais_fraco: 'PF', descritores_sem_cobertura: ['D2', 'D3'], perguntas_com_risco: [{ numero: 2, problema: 'PR', correcao_recomendada: 'CR' }] },
    });
    expect(t).toBe('J\nS\nPonto mais fraco: PF\nDescritores sem cobertura: D2, D3\nP2: PR. Sugestão: CR');
  });
  it('vazio/nulo não quebra', () => {
    expect(montarFeedbackRegeneracaoIA3({})).toBe('');
    expect(montarFeedbackRegeneracaoIA3({ alertas_check: null })).toBe('');
  });
});

describe('ligações (guard de fonte)', () => {
  it('a task do lote roda a onda 3 com o núcleo e tem orçamento de tempo', () => {
    const f = lerFonte('trigger/gerar-ia3-batch.ts');
    expect(f).toMatch(/regenerarAteLimiarIA3\(sb,\s*\{\s*cenarioId:/);
    expect(f).toMatch(/ORCAMENTO_ONDA3_MS/);
  });
  it('a tela regenera automaticamente abaixo de 80, no máximo 3 rodadas, uma por request', () => {
    const f = lerFonte('app/admin/empresas/[empresaId]/page.tsx');
    expect(f).toMatch(/rodada <= 3 && notaFinal < 80/);
    expect(f).toMatch(/regenerarCenario\(r\.cenarioId\)/);
  });
  it('o modelo padrão da geração é o Sonnet 5.5 e a task é PINADA (senão o modelo_padrao do tenant vence)', () => {
    const f = lerFonte('lib/ai-tasks.ts');
    expect(f).toMatch(/ia3_cenarios:\s*'claude-sonnet-5-5'/);
    // Só DENTRO do conjunto: 'ia3_cenarios' aparece em várias outras listas do arquivo, e uma âncora
    // solta casaria com elas mesmo sem o pino (mutação validada: tirar o pino passava o teste).
    const bloco = f.match(/PINNED_TASKS = new Set\(\[([\s\S]*?)\]\);/);
    expect(bloco).not.toBeNull();
    expect(bloco![1]).toMatch(/^\s*'ia3_cenarios',\s*$/m);
  });
});
