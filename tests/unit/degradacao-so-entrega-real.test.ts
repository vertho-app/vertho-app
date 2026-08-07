import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { entregaEhReal } from '@/lib/season-engine/week-gating';

/**
 * INVARIANTE: o `degradacao_log` só registra degradação de semana que a pessoa
 * PODE abrir. Semana futura é simulação, não experiência.
 *
 * 🔴 O caso que originou (04/08): o health-check acusou "578 fallbacks nas
 * últimas 24h" (`kit-ausente-disc 421×` + `kit-cargo-divergente 154×`). Medido no
 * banco: das **622 ocorrências acumuladas, ZERO eram de semana acessível** — a
 * menor semana registrada em todo o histórico era a **6**, a maior liberada era a
 * **4**. Ninguém tinha recebido conteúdo degradado; o número era a tela
 * `/admin/temporadas` varrendo o futuro.
 *
 * Como acontecia: `aplicarOverlayKit` roda sobre o plano INTEIRO (14 semanas) e
 * passava `colaboradorId` em todas — e é `colaboradorId` que liga o registro em
 * `overlayConteudo`. Uma abertura da tela admin do ibipeba = 37 trilhas × ~9
 * semanas de conteúdo, tudo contabilizado como fallback.
 *
 * Por que virou teste: um alarme que não corresponde a experiência **treina a
 * ignorar o alarme** — o mesmo estrago do contador sem janela (28/07). E a regra
 * é invisível no call-site (um `undefined` condicional), fácil de "simplificar"
 * de volta sem perceber o que se perde.
 */

// Semana N libera em data_inicio + (N-1)*7 dias, às 06:00 UTC.
const inicio = (diasAtras: number) => {
  const d = new Date(Date.now() - diasAtras * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

describe('degradação só conta entrega real', () => {
  // ⏱️ RELÓGIO CONGELADO — este teste era FLAKY e falhava de madrugada.
  //
  // `inicio(N)` devolve só a DATA (meia-noite), mas a semana libera às 06:00 UTC.
  // Rodando entre 00:00 e 06:00 UTC, a "semana corrente" ainda não tinha
  // liberado e a asserção de fronteira invertia — teste vermelho sem ninguém ter
  // mexido em nada. Pego em 06/08 numa execução de madrugada.
  //
  // Meio-dia UTC fica longe das duas bordas (00:00 e 06:00), então a fronteira
  // testada é a do PRODUTO (semana 3 × semana 4), não a da hora em que o CI rodou.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('semana já liberada conta', () => {
    const dataInicio = inicio(30); // ~5 semanas rodando
    expect(entregaEhReal(dataInicio, 1)).toBe(true);
    expect(entregaEhReal(dataInicio, 4)).toBe(true);
  });

  it('semana futura NÃO conta — é o caso que inflava o alarme', () => {
    const dataInicio = inicio(21); // semana 4 corrente
    expect(entregaEhReal(dataInicio, 6)).toBe(false);
    expect(entregaEhReal(dataInicio, 11)).toBe(false);
  });

  it('sem data_inicio não conta (varredura de admin não traz o campo)', () => {
    // `listarTemporadasEmpresa` e `carregarTrilhaAdmin` não selecionam
    // data_inicio: fail-closed faz varredura administrativa parar de registrar
    // por construção, sem precisar de flag no call-site.
    expect(entregaEhReal(null, 2)).toBe(false);
    expect(entregaEhReal(undefined, 2)).toBe(false);
  });

  it('a fronteira é a semana corrente, não a próxima', () => {
    const dataInicio = inicio(14); // semana 3 corrente (2 semanas completas)
    expect(entregaEhReal(dataInicio, 3)).toBe(true);
    expect(entregaEhReal(dataInicio, 4)).toBe(false);
  });
});
