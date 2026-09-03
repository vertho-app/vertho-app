import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitirPasseDegustacao, verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { issueDemoPresentationTicket, verifyDemoPresentationTicket } from '@/lib/demo/presentation-ticket';

/**
 * Passe da etapa 01 — o link REABRÍVEL do convidado.
 *
 * O risco desta peça não é falhar em abrir; é abrir demais. Ela substitui um
 * magic link de uso único por uma credencial que vale 10 dias e trafega por
 * WhatsApp, então o que precisa estar preso é: assinatura, prazo, ambiente e —
 * o mais fácil de esquecer — a SEPARAÇÃO em relação ao passe da sala de
 * apresentação, que o próprio prospect recebe nas etapas 02–04.
 */
const SESSAO = 'aaaaaaaaaaaaaaaaaaaa';
const AGORA = 1_788_000_000;
const chaveOriginal = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-used-only-by-unit-test';
});
afterAll(() => {
  if (chaveOriginal === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = chaveOriginal;
});

describe('passe da degustação', () => {
  it('abre com assinatura válida, dentro do prazo', () => {
    const passe = emitirPasseDegustacao('acme-demo', SESSAO, AGORA + 3600, AGORA);
    const payload = verificarPasseDegustacao(passe, AGORA + 60);

    expect(payload).toMatchObject({ tenant: 'acme-demo', sid: SESSAO });
  });

  it('REABRE: o mesmo passe vale mais de uma vez', () => {
    // é a razão de existir desta peça — o magic link morria na primeira
    const passe = emitirPasseDegustacao('acme-demo', SESSAO, AGORA + 3600, AGORA);
    expect(verificarPasseDegustacao(passe, AGORA + 10)).toBeTruthy();
    expect(verificarPasseDegustacao(passe, AGORA + 600)).toBeTruthy();
    expect(verificarPasseDegustacao(passe, AGORA + 3000)).toBeTruthy();
  });

  it('para de valer no instante do prazo', () => {
    const passe = emitirPasseDegustacao('acme-demo', SESSAO, AGORA + 3600, AGORA);
    expect(verificarPasseDegustacao(passe, AGORA + 3600)).toBeNull();
    expect(verificarPasseDegustacao(passe, AGORA + 3601)).toBeNull();
  });

  it('recusa payload adulterado — inclusive o prazo esticado', () => {
    const passe = emitirPasseDegustacao('acme-demo', SESSAO, AGORA + 3600, AGORA);
    const [codificado] = passe.split('.');
    const payload = JSON.parse(Buffer.from(codificado, 'base64url').toString('utf8'));
    payload.exp = AGORA + 999_999;
    const forjado = `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${passe.split('.')[1]}`;

    expect(verificarPasseDegustacao(forjado, AGORA + 60)).toBeNull();
  });

  /**
   * Monta um passe COM O FORMATO da degustação, assinado com outro contexto.
   *
   * Sem isto, o teste de separação passava pelo motivo errado: o passe da sala
   * era recusado por não ter o campo `sid`, e não pela chave — ou seja, ele
   * continuaria verde mesmo se as duas assinaturas compartilhassem a chave
   * derivada, que é exatamente o risco que ele existe para cobrir.
   */
  function passeAssinadoComOutroContexto(contexto: string) {
    const payload = { v: 1, tenant: 'acme-demo', sid: SESSAO, exp: AGORA + 3600 };
    const codificado = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const chave = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(contexto).digest();
    const assinatura = createHmac('sha256', chave).update(codificado).digest('base64url');
    return `${codificado}.${assinatura}`;
  }

  it('🔴 a chave é PRÓPRIA: assinatura da sala não abre a sessão do convidado', () => {
    // mesmo formato, mesmo prazo, mesma sessão — só o contexto de assinatura muda
    const comChaveDaSala = passeAssinadoComOutroContexto('vertho:demo-presentation:v1');
    expect(verificarPasseDegustacao(comChaveDaSala, AGORA + 60)).toBeNull();

    // e a prova de que o formato em si é aceitável: com o contexto certo, abre
    const comChaveCerta = passeAssinadoComOutroContexto('vertho:demo-degustacao:v1');
    expect(verificarPasseDegustacao(comChaveCerta, AGORA + 60)).toMatchObject({ sid: SESSAO });
  });

  it('🔴 ambiente fora da allowlist não abre, mesmo com assinatura válida', () => {
    const payload = { v: 1, tenant: 'macae', sid: SESSAO, exp: AGORA + 3600 };
    const codificado = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const chave = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update('vertho:demo-degustacao:v1').digest();
    const assinatura = createHmac('sha256', chave).update(codificado).digest('base64url');

    // assinatura legítima e prazo válido: o que barra é o ambiente
    expect(verificarPasseDegustacao(`${codificado}.${assinatura}`, AGORA + 60)).toBeNull();
  });

  it('passe da SALA não passa pela verificação da degustação', () => {
    // O passe da sala viaja nos links 02–04, que o prospect recebe. Se as duas
    // assinaturas compartilhassem a chave derivada, quem tem aquele passe
    // entraria COMO O CONVIDADO — a conta com o DISC e as respostas dele.
    const daSala = issueDemoPresentationTicket(AGORA, {
      prospectSessionId: SESSAO,
      expiresAtSeconds: AGORA + 3600,
    }, 'acme-demo');

    expect(verifyDemoPresentationTicket(daSala, AGORA + 60)).toBeTruthy();
    expect(verificarPasseDegustacao(daSala, AGORA + 60)).toBeNull();
  });

  it('🔴 passe da degustação não abre a sala de apresentação', () => {
    const daDegustacao = emitirPasseDegustacao('acme-demo', SESSAO, AGORA + 3600, AGORA);
    expect(verifyDemoPresentationTicket(daDegustacao, AGORA + 60)).toBeNull();
  });

  it('recusa lixo, vazio e passe gigante sem lançar', () => {
    expect(verificarPasseDegustacao(null)).toBeNull();
    expect(verificarPasseDegustacao('')).toBeNull();
    expect(verificarPasseDegustacao('sem-ponto')).toBeNull();
    expect(verificarPasseDegustacao('a.b')).toBeNull();
    expect(verificarPasseDegustacao(`${'x'.repeat(5_000)}.y`)).toBeNull();
  });

  it('não emite para ambiente fora da allowlist nem com sessão malformada', () => {
    expect(() => emitirPasseDegustacao('macae', SESSAO, AGORA + 3600, AGORA)).toThrow();
    expect(() => emitirPasseDegustacao('acme-demo', 'curto', AGORA + 3600, AGORA)).toThrow();
    expect(() => emitirPasseDegustacao('acme-demo', SESSAO, AGORA - 1, AGORA)).toThrow();
  });

  it('o ambiente vai DENTRO do passe: é o que impede abrir sessão no vizinho', () => {
    const escolar = emitirPasseDegustacao('escolas-acme', SESSAO, AGORA + 3600, AGORA);
    expect(verificarPasseDegustacao(escolar, AGORA + 60)?.tenant).toBe('escolas-acme');
  });
});
