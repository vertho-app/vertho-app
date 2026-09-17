import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PROSPECT_TENANTS } from '@/lib/demo/acme-prospect-config';
import { emitirCodigoCurto, lerCodigoCurto, linkCurtoDaDegustacao } from '@/lib/demo/degustacao-link-curto';

/**
 * Link curto do convite (`/c/<código>`).
 *
 * O código substitui o passe na mensagem de WhatsApp, então ele herda o mesmo
 * risco: abrir demais. O que precisa estar preso é a assinatura (o id da sessão
 * aparece em claro no ticket da sala), o ambiente e a chave PRÓPRIA.
 */
const SESSAO = 'aaaaaaaaaaaaaaaaaaaa';
const OUTRA_SESSAO = 'bbbbbbbbbbbbbbbbbbbb';
const CHAVE_DE_TESTE = 'service-role-key-used-only-by-unit-test';
const chaveOriginal = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE_DE_TESTE;
});
afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE_DE_TESTE;
});
afterAll(() => {
  if (chaveOriginal === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = chaveOriginal;
});

/** Código com a forma certa, assinado com um contexto qualquer. */
function codigoAssinadoCom(contexto: string, slug = 'acme-demo', sessao = SESSAO) {
  const chave = createHmac('sha256', CHAVE_DE_TESTE).update(contexto).digest();
  const tag = createHmac('sha256', chave).update(`${slug}|${sessao}`).digest().subarray(0, 8);
  return Buffer.concat([Buffer.from(sessao, 'hex'), tag]).toString('base64url');
}

describe('link curto da degustação', () => {
  it('ida e volta em todos os ambientes, com 24 caracteres e o host do ambiente', () => {
    for (const { slug } of Object.values(DEMO_PROSPECT_TENANTS)) {
      const codigo = emitirCodigoCurto(slug, SESSAO);
      expect(codigo).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(lerCodigoCurto(codigo, slug)).toBe(SESSAO);

      const link = new URL(linkCurtoDaDegustacao(slug, SESSAO));
      expect(link.hostname).toBe(`${slug}.vertho.ai`);
      expect(link.pathname).toBe(`/c/${codigo}`);
      expect(link.search).toBe('');
    }
  });

  it('REABRE e o lembrete reenvia o MESMO link: o código é estável', () => {
    expect(emitirCodigoCurto('acme-demo', SESSAO)).toBe(emitirCodigoCurto('acme-demo', SESSAO));
    expect(emitirCodigoCurto('acme-demo', SESSAO)).not.toBe(emitirCodigoCurto('acme-demo', OUTRA_SESSAO));
  });

  it('🔴 o ambiente vai NA assinatura: código de um ambiente não abre no vizinho', () => {
    const doAcme = emitirCodigoCurto('acme-demo', SESSAO);
    expect(lerCodigoCurto(doAcme, 'gruposinal')).toBeNull();
    expect(lerCodigoCurto(doAcme, 'escolas-acme')).toBeNull();
    expect(lerCodigoCurto(emitirCodigoCurto('gruposinal', SESSAO), 'acme-demo')).toBeNull();
  });

  it('🔴 quem só conhece o id da sessão não monta o código', () => {
    const semAssinatura = Buffer.concat([Buffer.from(SESSAO, 'hex'), Buffer.alloc(8)]).toString('base64url');
    expect(lerCodigoCurto(semAssinatura, 'acme-demo')).toBeNull();

    // trocar a sessão e manter a assinatura de outra também não abre
    const legitimo = Buffer.from(emitirCodigoCurto('acme-demo', SESSAO), 'base64url');
    const trocado = Buffer.concat([Buffer.from(OUTRA_SESSAO, 'hex'), legitimo.subarray(10)]).toString('base64url');
    expect(lerCodigoCurto(trocado, 'acme-demo')).toBeNull();
  });

  it('qualquer byte adulterado derruba o código', () => {
    const bytes = Buffer.from(emitirCodigoCurto('acme-demo', SESSAO), 'base64url');
    for (let i = 0; i < bytes.length; i += 1) {
      const adulterado = Buffer.from(bytes);
      adulterado[i] ^= 0x01;
      expect(lerCodigoCurto(adulterado.toString('base64url'), 'acme-demo')).toBeNull();
    }
  });

  it('🔴 a chave é PRÓPRIA: assinatura com o contexto do passe ou da sala não abre', () => {
    expect(lerCodigoCurto(codigoAssinadoCom('vertho:demo-degustacao:v1'), 'acme-demo')).toBeNull();
    expect(lerCodigoCurto(codigoAssinadoCom('vertho:demo-presentation:v1'), 'acme-demo')).toBeNull();
    // e a prova de que a forma montada aqui é a real: com o contexto certo, abre
    expect(lerCodigoCurto(codigoAssinadoCom('vertho:demo-degustacao-curto:v1'), 'acme-demo')).toBe(SESSAO);
  });

  it('ambiente fora da allowlist não abre, mesmo com assinatura válida para ele', () => {
    expect(lerCodigoCurto(codigoAssinadoCom('vertho:demo-degustacao-curto:v1', 'macae'), 'macae')).toBeNull();
  });

  it('recusa lixo sem lançar', () => {
    const codigo = emitirCodigoCurto('acme-demo', SESSAO);
    for (const lixo of [null, undefined, 42, '', 'curto', codigo.slice(1), `${codigo}A`, `${codigo.slice(0, 23)}=`, `${codigo.slice(0, 23)}+`, `${codigo.slice(0, 23)}/`]) {
      expect(lerCodigoCurto(lixo, 'acme-demo')).toBeNull();
    }
  });

  it('sem a chave do servidor, a leitura recusa em vez de lançar', () => {
    const codigo = emitirCodigoCurto('acme-demo', SESSAO);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(lerCodigoCurto(codigo, 'acme-demo')).toBeNull();
  });

  it('não emite para ambiente fora da allowlist nem com sessão malformada', () => {
    expect(() => emitirCodigoCurto('macae', SESSAO)).toThrow();
    expect(() => emitirCodigoCurto('constructor', SESSAO)).toThrow();
    expect(() => emitirCodigoCurto('acme-demo', 'curto')).toThrow();
    expect(() => emitirCodigoCurto('acme-demo', 'zzzzzzzzzzzzzzzzzzzz')).toThrow();
  });
});
