// R11 · saúde do canal push em 24h (lib/pipeline-health/regras.ts).
//
// Existe porque o `canal-push-zerado` do PÓS-VOO lê carimbo, e o pós-voo roda
// logo após o ENFILEIRAMENTO do fan-out — não após os envios (comentário
// explícito em app/api/cron/route.ts:89-92). Esta regra lê a tabela de entregas
// numa janela de 24h, quando a resposta já existe.
import { describe, expect, it } from 'vitest';
import { checarPushDegradado, PUSH_AMOSTRA_MINIMA, type PushDiario } from '@/lib/pipeline-health/regras';

const base: PushDiario = { total: 0, sucesso: 0, falha: 0, presos: 0 };

describe('checarPushDegradado', () => {
  it('dia sem cadência (zero entregas) NÃO é achado', () => {
    // Fim de semana, empresa sem envio: zero é o correto. Alarmar por ausência
    // viraria crônico — e alarme crônico é a mesma coisa que silêncio.
    expect(checarPushDegradado({ ...base })).toBeNull();
  });

  it('operação normal não gera achado', () => {
    expect(checarPushDegradado({ total: 30, sucesso: 29, falha: 1, presos: 0 })).toBeNull();
  });

  it('🔴 houve tentativa e NADA chegou → crítico', () => {
    const a = checarPushDegradado({ total: 8, sucesso: 0, falha: 8, presos: 0 });
    expect(a?.id).toBe('push-degradado-24h');
    expect(a?.severidade).toBe('critico');
  });

  it('taxa de falha alta com amostra suficiente → crítico', () => {
    const a = checarPushDegradado({ total: 10, sucesso: 4, falha: 6, presos: 0 });
    expect(a?.severidade).toBe('critico');
  });

  it('amostra pequena não sustenta conclusão sobre o canal', () => {
    // 2 de 3 falharem pode ser dois endpoints mortos, não o canal fora.
    const p = { total: PUSH_AMOSTRA_MINIMA - 2, sucesso: 1, falha: 2, presos: 0 };
    expect(checarPushDegradado(p)).toBeNull();
  });

  it('🔴 entregas presas em "tentativa" viram achado mesmo com o resto saudável', () => {
    // A entrega é gravada ANTES do envio (o id viaja no payload), então
    // `tentativa` velha = o processo morreu entre gravar e enviar. Não existe
    // nenhuma outra tela onde isso apareça.
    const a = checarPushDegradado({ total: 20, sucesso: 18, falha: 0, presos: 2 });
    expect(a?.id).toBe('push-preso-em-tentativa');
    expect(a?.contagem).toBe(2);
  });

  it('presos aparecem mesmo sem nenhuma entrega concluída na janela', () => {
    expect(checarPushDegradado({ total: 0, sucesso: 0, falha: 0, presos: 3 })?.id)
      .toBe('push-preso-em-tentativa');
  });

  it('entrada nula/indefinida não lança', () => {
    expect(checarPushDegradado(undefined as any)).toBeNull();
    expect(checarPushDegradado(null as any)).toBeNull();
  });
});
