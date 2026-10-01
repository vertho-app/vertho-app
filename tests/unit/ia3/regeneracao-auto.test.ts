import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn() }));

import {
  rodarRetentativasIA3, rodarEscadaIA3, regenerarAteLimiarIA3, montarFeedbackRegeneracaoIA3,
  ESCADA_IA3, IA3_LIMIAR_APROVACAO, IA3_MAX_RODADAS_AUTO, IA3_VETO_CORTE, IA3_VETO_MODELO,
  type DegrauIA3,
} from '@/lib/ia3-cenarios';
import { usaMaxCompletionTokens } from '@/lib/ai-provedores';

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

describe('ESCADA_IA3 — "todo cenário >= 80 sem criação humana"', () => {
  it('3 degraus na ordem: Sonnet com feedback → GPT 6.1 Sol do zero com veto → Opus com feedback', () => {
    expect(ESCADA_IA3.map((d) => d.id)).toEqual(['sonnet-feedback', 'gpt-do-zero', 'opus-feedback']);
    expect(ESCADA_IA3[0]).toMatchObject({ modelo: 'task', comFeedback: true });
    expect(ESCADA_IA3[1]).toMatchObject({ modelo: 'gpt-6.1-sol', comFeedback: false, vetoClaude: true });
    expect(ESCADA_IA3[2]).toMatchObject({ modelo: 'claude-opus-5-5', comFeedback: true });
  });

  it('TODO degrau de gerador OpenAI exige o veto Claude (o auditor canônico é da mesma família)', () => {
    for (const d of ESCADA_IA3) {
      if (/^(gpt|o\d)/.test(d.modelo)) expect(d.vetoClaude, d.id).toBe(true);
    }
  });

  it('o veto é Claude e calibrado em 72 (capta 13 de 14 aprovados pelo Terra) — nunca a régua do 80', () => {
    expect(IA3_VETO_MODELO).toMatch(/^claude/);
    expect(IA3_VETO_CORTE).toBe(72);
  });
});

describe('rodarEscadaIA3 — orquestração entre degraus', () => {
  const D: DegrauIA3[] = [
    { id: 'a', modelo: 'task', rodadas: 2, comFeedback: true },
    { id: 'b', modelo: 'outro', rodadas: 2, comFeedback: false },
    { id: 'c', modelo: 'ultimo', rodadas: 1, comFeedback: true },
  ];
  const mk = (resp: Record<string, R[]>) => {
    const chamadas: Array<{ degrau: string; fb: any }> = [];
    return {
      chamadas,
      gerar: async (d: DegrauIA3, fb: any): Promise<R> => { chamadas.push({ degrau: d.id, fb }); const r = resp[d.id]?.shift(); if (!r) throw new Error('sem resposta ' + d.id); return r; },
    };
  };

  it('só sobe de degrau quando o anterior esgota sem atingir o limiar', async () => {
    const m = mk({ a: [ok(60), ok(65)], b: [ok(88)], c: [] });
    const r = await rodarEscadaIA3({ notaInicial: 58, feedbackInicial: 'fb0', limiar: 80, degraus: D, gerar: m.gerar });
    expect(m.chamadas.map((c) => c.degrau)).toEqual(['a', 'a', 'b']);
    expect(r.atingiuLimiar).toBe(true);
    expect(r.degrauFinal).toBe('b');
    expect(r.notaFinal).toBe(88);
    expect(r.rodadas.map((x) => x.degrau)).toEqual(['a', 'a', 'b']);
  });

  it('o 1º degrau que atinge o limiar encerra: os seguintes não gastam nada', async () => {
    const m = mk({ a: [ok(85)], b: [ok(99)], c: [ok(99)] });
    const r = await rodarEscadaIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, degraus: D, gerar: m.gerar });
    expect(m.chamadas).toHaveLength(1);
    expect(r.degrauFinal).toBe('a');
  });

  it('degrau "do zero" NÃO recebe o feedback; os "com feedback" recebem o do campeão que atravessou os degraus', async () => {
    const m = mk({ a: [ok(70), ok(55)], b: [ok(50), ok(40)], c: [ok(82)] });
    const r = await rodarEscadaIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, degraus: D, gerar: m.gerar });
    const porDegrau = (id: string) => m.chamadas.filter((c) => c.degrau === id).map((c) => c.fb);
    expect(porDegrau('a')).toEqual(['fb0', 'fb70']);           // 2ª rodada: feedback do campeão (70)
    expect(porDegrau('b')).toEqual([{}, {}]);                  // do zero: sem feedback algum
    expect(porDegrau('c')).toEqual(['fb70']);                  // o campeão (70) atravessou o degrau "do zero" (que não o superou)
    expect(r.notaFinal).toBe(82);
    expect(r.atingiuLimiar).toBe(true);
  });

  it('o campeão atravessa: um degrau posterior que piora NÃO tira a melhor versão', async () => {
    const m = mk({ a: [ok(72), ok(60)], b: [ok(30), ok(20)], c: [ok(10)] });
    const r = await rodarEscadaIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, degraus: D, gerar: m.gerar });
    expect(r.atingiuLimiar).toBe(false);
    expect(r.notaFinal).toBe(72);
    expect(r.campeao).toBe('c72');
    expect(r.degrauFinal).toBe('a');
  });

  it('timeout/erro num degrau gasta a rodada e a escada segue (o GPT 6.1 Sol deu timeout em 2 de 27)', async () => {
    const m = mk({ a: [ok(61), ok(62)], b: [{ ok: false, erro: 'The operation was aborted due to timeout' }, ok(90)], c: [] });
    const r = await rodarEscadaIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, degraus: D, gerar: m.gerar });
    expect(r.rodadas.find((x) => x.degrau === 'b' && !x.ok)?.erro).toMatch(/timeout/);
    expect(r.atingiuLimiar).toBe(true);
    expect(r.degrauFinal).toBe('b');
  });

  it('esgota TODOS os degraus abaixo do limiar: atingiuLimiar=false (vira revisão humana, nunca "resolvido")', async () => {
    const m = mk({ a: [ok(61), ok(62)], b: [ok(63), ok(64)], c: [ok(65)] });
    const r = await rodarEscadaIA3({ notaInicial: 60, feedbackInicial: 'fb0', limiar: 80, degraus: D, gerar: m.gerar });
    expect(r.rodadas).toHaveLength(5);
    expect(r.atingiuLimiar).toBe(false);
    expect(r.notaFinal).toBe(65);
  });
});

describe('veto Claude — ligação no código', () => {
  it('a candidata de degrau com veto só é aceita com Terra >= limiar E Claude >= corte (nunca o Claude no lugar do Terra)', () => {
    const f = lerFonte('lib/ia3-cenarios.ts');
    expect(f).toMatch(/if \(veto\.nota < IA3_VETO_CORTE\)/);
    expect(f).toMatch(/vetoClaude: !!degrau\.vetoClaude/);
    // falha do veto NÃO aprova: devolve ok:false (candidata não promovida)
    expect(f).toMatch(/Veto \(\$\{IA3_VETO_MODELO\}\) falhou/);
    // o rastro de QUEM mediu vai junto da nota
    expect(f).toMatch(/auditor: checkModelo/);
  });
});

describe('usaMaxCompletionTokens — gpt-5 em diante (o prefixo fixo deixou o gpt-6.1-sol de fora)', () => {
  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6.1-sol', 'gpt-7', 'gpt-10', 'o3', 'o4-mini'])('%s usa max_completion_tokens', (m) => {
    expect(usaMaxCompletionTokens(m)).toBe(true);
  });
  it.each(['gpt-4o', 'gpt-4.1', 'gpt-image-2', 'claude-sonnet-5-5'])('%s não usa', (m) => {
    expect(usaMaxCompletionTokens(m)).toBe(false);
  });
});
