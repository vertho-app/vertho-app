import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Degustação de lead (R-103, 04/10/2026), dois defeitos:
 *
 *  1. A análise da resposta roda em `after()`, sem status nem retentativa: se
 *     falhava, a página dele ficava em "suas respostas estão em análise" para
 *     sempre (a análise leva 107 s de mediana e 154 s no p90), e nada ficava
 *     registrado. Agora há uma 2ª tentativa quando a 1ª falha rápido, a falha
 *     final vai para `degradacao_log`, e a página admite o atraso.
 *  2. O lead de convite vencido caía no login mandado a "pedir um novo link", o
 *     que ele não consegue. Agora lê "fale com quem enviou o convite".
 *
 * Mutação: ver o relatório do lote 11.
 */

const registrar = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: registrar };
});
// O núcleo da avaliação é injetado nos testes; o módulo real só precisa carregar.
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({}) }));
vi.mock('@/lib/ia4-avaliacao', () => ({
  avaliarUmaRespostaCore: vi.fn(), carregarContextoLoteIA4: vi.fn(), IA4_COLAB_COLS: '*',
}));

import {
  avaliarRespostaDaDegustacaoComRetentativa, RETENTATIVA_ATE_MS,
} from '@/lib/demo/degustacao-avaliacao';
import { devolutivaAtrasada, DEVOLUTIVA_ATRASADA_MIN } from '@/lib/demo/degustacao-devolutiva';
import { DEGRADACAO } from '@/lib/degradacao';
import { chaveDoAvisoDeLink } from '@/lib/auth/aviso-de-link';

const ALVO = { colaboradorId: 'colab-1', competenciaId: 'comp-1' };

beforeEach(() => registrar.mockClear());

describe('avaliarRespostaDaDegustacaoComRetentativa', () => {
  it('sucesso na 1ª: uma tentativa, nada registrado', async () => {
    const avaliar = vi.fn(async () => ({ success: true }));
    const r = await avaliarRespostaDaDegustacaoComRetentativa('emp', ALVO, { avaliar });
    expect(r.success).toBe(true);
    expect(avaliar).toHaveBeenCalledTimes(1);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('falha rápida e sucesso na 2ª: tenta de novo, e não registra falha', async () => {
    const avaliar = vi.fn()
      .mockResolvedValueOnce({ success: false, error: '429 do provedor' })
      .mockResolvedValueOnce({ success: true });
    const r = await avaliarRespostaDaDegustacaoComRetentativa('emp', ALVO, { avaliar, agora: () => 1_000 });
    expect(r.success).toBe(true);
    expect(avaliar).toHaveBeenCalledTimes(2);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('🔴 falha nas duas: devolve a falha e REGISTRA em degradacao_log (antes: console.warn e silêncio)', async () => {
    const avaliar = vi.fn(async () => ({ success: false, error: 'IA fora do ar' }));
    const r = await avaliarRespostaDaDegustacaoComRetentativa('emp', ALVO, { avaliar, agora: () => 1_000 });
    expect(r.success).toBe(false);
    expect(avaliar).toHaveBeenCalledTimes(2);
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: DEGRADACAO.DEGUSTACAO_AVALIACAO_FALHOU, fluxo: 'demo', chave: 'colab-1:comp-1', empresaId: 'emp', colaboradorId: 'colab-1',
    }));
    expect((registrar.mock.calls[0] as any)[0].detalhe.erro).toBe('IA fora do ar');
  });

  it('falha LENTA (a 1ª já gastou o orçamento): não tenta de novo, mas registra', async () => {
    const relogio = [0, RETENTATIVA_ATE_MS + 1];
    const avaliar = vi.fn(async () => ({ success: false, error: 'abortou no teto de 120 s' }));
    await avaliarRespostaDaDegustacaoComRetentativa('emp', ALVO, { avaliar, agora: () => relogio.shift() ?? 99_999 });
    expect(avaliar).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('exceção do núcleo não escapa: vira falha registrada (o `after()` nunca lança)', async () => {
    const avaliar = vi.fn(async () => { throw new Error('conexão caiu'); });
    const r = await avaliarRespostaDaDegustacaoComRetentativa('emp', ALVO, { avaliar, agora: () => 1_000 });
    expect(r).toMatchObject({ success: false, error: 'conexão caiu' });
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});

describe('devolutivaAtrasada', () => {
  const agora = new Date('2026-10-04T12:00:00.000Z');
  const minutosAtras = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();

  it('resposta recente sem análise: ainda é espera', () => {
    expect(devolutivaAtrasada([{ timestamp_resposta: minutosAtras(3) }], agora)).toBe(false);
  });
  it('passada a janela sem análise: atrasada', () => {
    expect(devolutivaAtrasada([{ timestamp_resposta: minutosAtras(DEVOLUTIVA_ATRASADA_MIN + 1) }], agora)).toBe(true);
  });
  it('com nível OU nota gravados, nunca está atrasada, por mais velha que seja', () => {
    expect(devolutivaAtrasada([{ nivel_ia4: 2, timestamp_resposta: minutosAtras(500) }], agora)).toBe(false);
    expect(devolutivaAtrasada([{ nota_ia4: 2.4, timestamp_resposta: minutosAtras(500) }], agora)).toBe(false);
  });
  it('sem data da resposta não se afirma atraso', () => {
    expect(devolutivaAtrasada([{ timestamp_resposta: null }], agora)).toBe(false);
    expect(devolutivaAtrasada([], agora)).toBe(false);
  });
  it('a janela é bem maior que o p90 medido (154 s)', () => {
    expect(DEVOLUTIVA_ATRASADA_MIN * 60).toBeGreaterThan(154 * 3);
  });
});

describe('o caminho que o lead percorre', () => {
  const ler = (p: string) => readFileSync(p, 'utf-8').split('\r\n').join('\n');

  it('a action dispara a análise pelo caminho com retentativa, e não pelo núcleo cru', () => {
    const acao = ler('app/dashboard/assessment/assessment-actions.ts');
    expect(acao).toContain('avaliarRespostaDaDegustacaoComRetentativa(empresaId, alvo)');
    expect(acao).not.toMatch(/await avaliarRespostaDaDegustacao\(empresaId/);
  });

  it('o hub entrega a data da resposta e o atraso à página', () => {
    const hub = ler('lib/demo/degustacao-hub.ts');
    expect(hub).toContain("'id,nivel_ia4,nota_ia4,timestamp_resposta'");
    expect(hub).toContain('atrasada = !devolutivaPronta && devolutivaAtrasada(linhas, agora);');
    expect(hub).toContain('devolutivaAtrasada: atrasada,');
  });

  it('a página admite o atraso e manda avisar quem convidou', () => {
    const pagina = ler('app/degustacao/pagina-da-degustacao.tsx');
    expect(pagina).toContain('pessoal.devolutivaAtrasada');
    expect(pagina).toContain('Avise quem te convidou');
  });
});

describe('convite vencido na tela de login (R-103)', () => {
  it('os dois códigos da degustação trazem a mensagem do convidado, não "peça um novo"', () => {
    expect(chaveDoAvisoDeLink('convite-expirado')).toBe('linkErrors.guestExpired');
    expect(chaveDoAvisoDeLink('convite-invalido')).toBe('linkErrors.guestExpired');
  });

  it('quem é usuário comum segue com as mensagens de sempre', () => {
    expect(chaveDoAvisoDeLink('indisponivel')).toBe('linkErrors.unavailable');
    expect(chaveDoAvisoDeLink('apresentacao-indisponivel')).toBe('linkErrors.unavailable');
    expect(chaveDoAvisoDeLink('Email link is invalid or has expired')).toBe('linkErrors.expired');
    expect(chaveDoAvisoDeLink('')).toBe('linkErrors.expired');
  });

  it('a tela usa a régua e as 4 línguas têm o texto, sem pedir novo link', () => {
    expect(ler('app/login/login-form.tsx')).toContain('t(chaveDoAvisoDeLink(erro))');
    for (const loc of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const txt = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8')).Login.linkErrors.guestExpired as string;
      expect(txt.length, loc).toBeGreaterThan(30);
      expect(txt).not.toMatch(/[–—]/);
    }
  });

  function ler(p: string) { return readFileSync(p, 'utf-8').split('\r\n').join('\n'); }
});
