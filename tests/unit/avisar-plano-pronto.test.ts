// Quem é avisado de que o PLANO ficou pronto — e, principalmente, quem NÃO é.
//
// 🔑 A instrução do dono (16/08/2026) foi "pode ligar, mas não vamos disparar
// agora, só para os próximos". Os 38 relatórios de Ibipeba (13-20/07) e os 34 de
// Macaé (15/08) já foram baixados pelas pessoas: reanunciá-los seria mandar 72
// mensagens dizendo que algo "ficou pronto" há um mês.
//
// 🔴 O CORTE É CONSTANTE, não `now()`. Um corte relativo faria a elegibilidade
// depender de QUANDO o cron rodou — irreprodutível, e o erro só apareceria na
// forma de gente recebendo aviso de coisa velha.
import { describe, it, expect } from 'vitest';
import { decidirAvisos, CORTE_ISO, type CandidatoPlano } from '@/lib/notifications/avisar-plano-pronto';

const c = (id: string, geradoEm: string, telefone: string | null = '5511999999999'): CandidatoPlano =>
  ({ colaboradorId: id, nome: 'Maria', telefone, geradoEm });

const CORTE = '2026-08-16T23:59:00.000Z';

describe('só os próximos', () => {
  it('🔴 relatório ANTERIOR ao corte nunca é avisado', () => {
    const r = decidirAvisos([
      c('ibipeba-1', '2026-07-20T16:55:12.112Z'),  // os 38 de Ibipeba
      c('macae-1', '2026-08-15T03:03:23.375Z'),    // os 34 de Macaé
    ], new Set(), CORTE);
    expect(r.enviar).toEqual([]);
    expect(r.antigos).toBe(2);
  });

  it('🔴 o corte é EXCLUSIVO: o instante exato ainda é passado', () => {
    // Fronteira escrita de propósito. Se virasse `>=`, o relatório gravado no
    // mesmo milissegundo do corte entraria — e fronteira é onde erro mora.
    expect(decidirAvisos([c('x', CORTE)], new Set(), CORTE).enviar).toEqual([]);
    expect(decidirAvisos([c('x', '2026-08-16T23:59:00.001Z')], new Set(), CORTE).enviar).toHaveLength(1);
  });

  it('relatório novo entra', () => {
    const r = decidirAvisos([c('novo', '2026-08-20T10:00:00.000Z')], new Set(), CORTE);
    expect(r.enviar.map((x) => x.colaboradorId)).toEqual(['novo']);
  });
});

describe('as três exclusões são coisas diferentes', () => {
  it('🔴 quem já foi avisado não recebe de novo', () => {
    // Sem isto, cada execução do cron reenvia tudo — e num canal de trabalho
    // repetir é pior que não mandar.
    const r = decidirAvisos([c('a', '2026-08-20T10:00:00.000Z')], new Set(['a']), CORTE);
    expect(r.enviar).toEqual([]);
    expect(r.repetidos).toBe(1);
  });

  it('sem telefone não é falha de envio — é lacuna de cadastro, contada à parte', () => {
    const r = decidirAvisos([c('b', '2026-08-20T10:00:00.000Z', null)], new Set(), CORTE);
    expect(r.enviar).toEqual([]);
    expect(r.semTelefone).toBe(1);
    expect(r.repetidos).toBe(0);
    expect(r.antigos).toBe(0);
  });

  it('cada motivo é contado no seu balde, sem se somar por engano', () => {
    const r = decidirAvisos([
      c('velho', '2026-07-01T10:00:00.000Z'),
      c('repetido', '2026-08-20T10:00:00.000Z'),
      c('sem-tel', '2026-08-20T10:00:00.000Z', null),
      c('ok', '2026-08-20T10:00:00.000Z'),
    ], new Set(['repetido']), CORTE);
    expect(r.enviar.map((x) => x.colaboradorId)).toEqual(['ok']);
    expect([r.antigos, r.repetidos, r.semTelefone]).toEqual([1, 1, 1]);
  });
});

describe('o corte publicado', () => {
  it('🔴 CORTE_ISO deixa Ibipeba e Macaé de fora — a garantia do "só os próximos"', () => {
    // Se alguém baixar o corte, este teste cai antes de 72 pessoas receberem
    // aviso de um plano que elas já baixaram.
    expect(CORTE_ISO > '2026-08-15T03:41:24.681Z').toBe(true);
    expect(CORTE_ISO > '2026-07-20T16:55:12.112Z').toBe(true);
  });

  it('entrada vazia não quebra', () => {
    const r = decidirAvisos([], new Set());
    expect(r).toEqual({ enviar: [], antigos: 0, repetidos: 0, semTelefone: 0 });
  });

  it('🔴 corte alternativo SEM escopo é recusado — reanúncio não pode vazar para outro tenant', async () => {
    const { avisarPlanosProntos } = await import('@/lib/notifications/avisar-plano-pronto');
    // O corte de 17/08 existe para alcançar os 34 de Macaé (relatórios de 15/08).
    // Sem `apenasSlug`, ele alcançaria também os 38 de Ibipeba (julho) — e
    // mensagem enviada não volta. Falha ANTES de tocar banco ou provedor.
    await expect(
      avisarPlanosProntos({ corteIso: '2026-08-01T00:00:00.000Z' }),
    ).rejects.toThrow(/apenasSlug/);
  });
});
