import { describe, it, expect } from 'vitest';
import { pilulaPendente, canalPendente, mesmoDiaUTC } from '@/lib/notifications/carimbo-canal';

/**
 * As invariantes que impedem uma falha de envio de virar PERDA SILENCIOSA.
 *
 * História: em 20/07 a Z-API caiu e o cron carimbou 36 pílulas com ZERO WhatsApp
 * entregue — o carimbo era incondicional, o `mesmoDiaUTC` bloqueava o reenvio e a
 * /admin/engajamento reportava 100% de recebimento. A mig 181 separou o carimbo por
 * canal; estes testes travam a regra que dela decorre.
 *
 * A regra em uma frase: **o dia só fecha para o canal que REALMENTE entregou.**
 */
describe('idempotência por canal (o dia não fecha para quem falhou)', () => {
  const hoje = '2026-07-27';

  it('canal entregue hoje não pende de novo (não duplica)', () => {
    expect(canalPendente(true, '2026-07-27T11:00:00Z', hoje)).toBe(false);
  });

  it('canal que falhou (sem carimbo) CONTINUA pendente — é o que permite recuperar', () => {
    expect(canalPendente(true, null, hoje)).toBe(true);
  });

  it('carimbo de ontem não fecha o dia de hoje', () => {
    expect(canalPendente(true, '2026-07-26T11:00:00Z', hoje)).toBe(true);
  });

  it('canal inaplicável nunca pende (sem telefone não fica eternamente "em aberto")', () => {
    expect(canalPendente(false, null, hoje)).toBe(false);
  });

  it('e-mail entregue NÃO fecha a porta do WhatsApp que faltou', () => {
    // O bug original: olhar só `ultima_pilulaN_em` dava "já processado" e impedia
    // exatamente a recuperação do canal que falhou.
    expect(pilulaPendente({
      temTelefone: true, temEmail: true,
      carimboWhatsapp: null, carimboEmail: '2026-07-27T11:00:00Z', hojeUTC: hoje,
    })).toBe(true);
  });

  it('os dois canais entregues → nada pendente', () => {
    expect(pilulaPendente({
      temTelefone: true, temEmail: true,
      carimboWhatsapp: '2026-07-27T11:00:00Z', carimboEmail: '2026-07-27T11:00:00Z', hojeUTC: hoje,
    })).toBe(false);
  });

  it('quem só tem e-mail e recebeu → não pendura por causa do WhatsApp inexistente', () => {
    expect(pilulaPendente({
      temTelefone: false, temEmail: true,
      carimboWhatsapp: null, carimboEmail: '2026-07-27T11:00:00Z', hojeUTC: hoje,
    })).toBe(false);
  });

  it('mesmoDiaUTC trata null/vazio como "nunca carimbado"', () => {
    expect(mesmoDiaUTC(null, hoje)).toBe(false);
    expect(mesmoDiaUTC(undefined, hoje)).toBe(false);
    expect(mesmoDiaUTC('', hoje)).toBe(false);
  });
});

/**
 * O contrato de `publishToQStash` no cron: token ausente = FALHA, não "pulei".
 *
 * A versão antiga fazia `return` e o chamador seguia para `pilulas++` + carimbo do
 * canal — o WhatsApp da coorte inteira morria em silêncio com o banco dizendo que
 * saiu. Não dá para importar a função (é privada de um `'use server'`), então o
 * teste guarda a FORMA do contrato: quem publica precisa sinalizar erro para que o
 * `catch` do chamador impeça o carimbo.
 */
describe('canal indisponível tem que ser erro, não sucesso silencioso', () => {
  /** Réplica fiel do guard corrigido em actions/cron-jobs.ts:456. */
  async function publicar(token: string | undefined) {
    if (!token) throw new Error('QSTASH_TOKEN não configurado — canal WhatsApp indisponível');
    return { ok: true };
  }

  /** Réplica do chamador: só carimba quando o publish não lançou. */
  async function enviarComCarimbo(token: string | undefined) {
    const stamp: Record<string, string> = {};
    let enviadas = 0, erros = 0;
    try { await publicar(token); enviadas++; stamp.whatsapp = 'agora'; } catch { erros++; }
    return { stamp, enviadas, erros };
  }

  it('sem token: conta erro e NÃO carimba (o dia continua recuperável)', async () => {
    const r = await enviarComCarimbo(undefined);
    expect(r.erros).toBe(1);
    expect(r.enviadas).toBe(0);
    expect(r.stamp.whatsapp).toBeUndefined();
  });

  it('com token: conta envio e carimba', async () => {
    const r = await enviarComCarimbo('tok_123');
    expect(r.erros).toBe(0);
    expect(r.stamp.whatsapp).toBe('agora');
  });
});
