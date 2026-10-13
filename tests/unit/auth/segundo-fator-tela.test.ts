import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  cadastrarAparelho,
  confirmarCodigo,
  esperarAbaVisivel,
  lerEtapa,
  nomeDoAparelho,
  type AuthDaTela,
} from '@/lib/auth/segundo-fator-tela';

/**
 * Tela do segundo fator. Em 13/10/2026 o master leu o QR, digitou três códigos certos e ouviu
 * "Código inválido" nas três: a aba do login, que ficou para trás, seguiu a sessão nova até esta
 * tela e cadastrou outro aparelho 2 s depois, apagando o QR que ele tinha lido. Os testes rodam as
 * funções reais contra um Supabase de mentira com o mesmo comportamento que o servidor mostrou
 * (fator apagado responde `mfa_factor_not_found`).
 */

const CODIGO_CERTO = '123456';
const AGORA = () => new Date('2026-10-13T10:48:00Z'); // 07:48 em Brasília

type FatorFalso = { id: string; factor_type: 'totp'; status: 'verified' | 'unverified'; friendly_name: string };

function supabaseFalso(opcoes: { user?: boolean; fatores?: FatorFalso[]; nivel?: 'aal1' | 'aal2' } = {}) {
  const estado = {
    user: opcoes.user ?? true,
    fatores: [...(opcoes.fatores ?? [])],
    nivel: opcoes.nivel ?? 'aal1',
    proximo: 1,
  };
  const chamadas: string[] = [];
  const auth: AuthDaTela = {
    async getUser() { return { data: { user: estado.user ? { id: 'u1' } : null } }; },
    mfa: {
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: estado.nivel }, error: null }; },
      async listFactors() {
        return {
          data: { all: [...estado.fatores], totp: estado.fatores.filter((f) => f.status === 'verified') },
          error: null,
        };
      },
      async unenroll({ factorId }) {
        chamadas.push(`unenroll:${factorId}`);
        estado.fatores = estado.fatores.filter((f) => f.id !== factorId);
        return { data: { id: factorId }, error: null };
      },
      async enroll({ friendlyName }) {
        const id = `qr${estado.proximo++}`;
        chamadas.push(`enroll:${id}`);
        estado.fatores.push({ id, factor_type: 'totp', status: 'unverified', friendly_name: friendlyName });
        return { data: { id, totp: { qr_code: `data:qr-${id}`, secret: `SEGREDO-${id}` } }, error: null };
      },
      async challengeAndVerify({ factorId, code }) {
        chamadas.push(`verify:${factorId}`);
        const fator = estado.fatores.find((f) => f.id === factorId);
        if (!fator) return { error: { code: 'mfa_factor_not_found', message: 'Factor not found' } };
        if (code !== CODIGO_CERTO) return { error: { code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' } };
        fator.status = 'verified';
        estado.nivel = 'aal2';
        return { error: null };
      },
    },
  };
  return { auth, estado, chamadas };
}

function abaFalsa(visivel: boolean) {
  const ouvintes = new Set<() => void>();
  const doc = {
    visibilityState: (visivel ? 'visible' : 'hidden') as DocumentVisibilityState,
    addEventListener: (_tipo: string, fn: () => void) => { ouvintes.add(fn); },
    removeEventListener: (_tipo: string, fn: () => void) => { ouvintes.delete(fn); },
  };
  return {
    doc: doc as any,
    ouvintes,
    trazerParaFrente() { doc.visibilityState = 'visible'; for (const fn of [...ouvintes]) fn(); },
    mandarParaTras() { doc.visibilityState = 'hidden'; for (const fn of [...ouvintes]) fn(); },
  };
}

const deixarRodar = () => new Promise((r) => setTimeout(r, 0));

describe('a aba de trás não cadastra', () => {
  it('com a aba na frente e sem aparelho, cadastra e mostra o QR', async () => {
    const { auth, chamadas } = supabaseFalso();
    const etapa = await lerEtapa(auth, abaFalsa(true).doc, AGORA);
    expect(etapa).toMatchObject({ tipo: 'cadastrar', factorId: 'qr1', qr: 'data:qr-qr1', chave: 'SEGREDO-qr1', reserva: false });
    expect(chamadas).toEqual(['enroll:qr1']);
  });

  it('com a aba atrás, não mexe em nada até ela vir para a frente', async () => {
    const { auth, chamadas } = supabaseFalso();
    const aba = abaFalsa(false);
    let etapa: any = null;
    const promessa = lerEtapa(auth, aba.doc, AGORA).then((e) => { etapa = e; });

    await deixarRodar();
    aba.mandarParaTras(); // outra mudança que não é "visível" não solta a espera
    await deixarRodar();
    expect(chamadas).toEqual([]);
    expect(etapa).toBeNull();

    aba.trazerParaFrente();
    await promessa;
    expect(etapa).toMatchObject({ tipo: 'cadastrar', factorId: 'qr1' });
    expect(aba.ouvintes.size).toBe(0);
  });

  it('o caso de 13/10: o QR lido na aba da frente sobrevive à aba de trás e o código passa', async () => {
    const { auth, estado, chamadas } = supabaseFalso();
    const frente = abaFalsa(true);
    const tras = abaFalsa(false);

    const daFrente = await lerEtapa(auth, frente.doc, AGORA);
    void lerEtapa(auth, tras.doc, AGORA); // a aba do login chega 2 s depois, seguindo a sessão
    await deixarRodar();

    expect(daFrente).toMatchObject({ tipo: 'cadastrar', factorId: 'qr1' });
    expect(estado.fatores.map((f) => f.id)).toEqual(['qr1']);
    expect(await confirmarCodigo(auth, 'qr1', CODIGO_CERTO)).toEqual({ tipo: 'ok' });
    expect(chamadas).toEqual(['enroll:qr1', 'verify:qr1']);
  });

  it('se a pessoa confirmou na outra aba enquanto esta esperava, ela relê e não cadastra de novo', async () => {
    const { auth, estado, chamadas } = supabaseFalso();
    const tras = abaFalsa(false);
    const promessa = lerEtapa(auth, tras.doc, AGORA);
    await deixarRodar();

    // na outra aba: cadastrou e confirmou
    estado.fatores.push({ id: 'qr-da-outra', factor_type: 'totp', status: 'verified', friendly_name: 'x' });
    estado.nivel = 'aal2';

    tras.trazerParaFrente();
    expect(await promessa).toMatchObject({ tipo: 'pronto', fatores: [{ id: 'qr-da-outra' }] });
    expect(chamadas).toEqual([]);
  });

  it('se a tela sair enquanto a aba espera, ela não cadastra mais, nem vindo para a frente depois', async () => {
    const { auth, chamadas } = supabaseFalso();
    const aba = abaFalsa(false);
    const controle = new AbortController();
    const promessa = lerEtapa(auth, aba.doc, AGORA, controle.signal);
    await deixarRodar();

    controle.abort();
    expect(await promessa).toEqual({ tipo: 'carregando' });
    aba.trazerParaFrente();
    await deixarRodar();
    expect(chamadas).toEqual([]);
    expect(aba.ouvintes.size).toBe(0);
  });

  it('sinal já cancelado com a aba na frente também não cadastra', async () => {
    const { auth, chamadas } = supabaseFalso();
    const controle = new AbortController();
    controle.abort();
    expect(await lerEtapa(auth, abaFalsa(true).doc, AGORA, controle.signal)).toEqual({ tipo: 'carregando' });
    expect(chamadas).toEqual([]);
  });

  it('esperarAbaVisivel: na frente resolve na hora; cancelado resolve false', async () => {
    expect(await esperarAbaVisivel(abaFalsa(true).doc)).toBe(true);
    const controle = new AbortController();
    controle.abort();
    expect(await esperarAbaVisivel(abaFalsa(false).doc, controle.signal)).toBe(false);
  });

  it('esperarAbaVisivel: mudança que deixa a aba atrás não solta a espera', async () => {
    const aba = abaFalsa(false);
    let resolvido: boolean | null = null;
    const promessa = esperarAbaVisivel(aba.doc).then((v) => { resolvido = v; });
    aba.mandarParaTras();
    await deixarRodar();
    expect(resolvido).toBeNull();
    aba.trazerParaFrente();
    await promessa;
    expect(resolvido).toBe(true);
  });
});

describe('o resto do caminho não mudou', () => {
  it('sem sessão manda para o login; com aparelho e sem código pede o código; com aal2 está pronto', async () => {
    expect(await lerEtapa(supabaseFalso({ user: false }).auth, abaFalsa(true).doc, AGORA)).toEqual({ tipo: 'sem-sessao' });

    const verificado: FatorFalso = { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'a' };
    const comAparelho = supabaseFalso({ fatores: [verificado] });
    expect(await lerEtapa(comAparelho.auth, abaFalsa(false).doc, AGORA)).toMatchObject({ tipo: 'confirmar', fatores: [{ id: 'f1' }] });
    expect(comAparelho.chamadas).toEqual([]);

    const pronto = supabaseFalso({ fatores: [verificado], nivel: 'aal2' });
    expect(await lerEtapa(pronto.auth, abaFalsa(true).doc, AGORA)).toMatchObject({ tipo: 'pronto' });
  });

  it('leitura que falha vira erro com o detalhe, sem cadastrar', async () => {
    const { auth, chamadas } = supabaseFalso();
    auth.mfa.listFactors = async () => ({ data: null, error: { message: 'rede caiu' } });
    expect(await lerEtapa(auth, abaFalsa(true).doc, AGORA)).toEqual({ tipo: 'erro', detalhe: 'rede caiu' });
    expect(chamadas).toEqual([]);
  });

  it('cadastrar apaga só o pendente, nunca o aparelho já confirmado', async () => {
    const { auth, estado, chamadas } = supabaseFalso({
      fatores: [
        { id: 'ok1', factor_type: 'totp', status: 'verified', friendly_name: 'a' },
        { id: 'pend', factor_type: 'totp', status: 'unverified', friendly_name: 'b' },
      ],
      nivel: 'aal2',
    });
    expect(await cadastrarAparelho(auth, AGORA(), true)).toMatchObject({ tipo: 'cadastrar', factorId: 'qr1', reserva: true });
    expect(chamadas).toEqual(['unenroll:pend', 'enroll:qr1']);
    expect(estado.fatores.map((f) => f.id)).toEqual(['ok1', 'qr1']);
  });

  it('lista que falha no cadastro (o da reserva) vira erro, sem cadastrar às cegas', async () => {
    const { auth, chamadas } = supabaseFalso();
    auth.mfa.listFactors = async () => ({ data: null, error: { message: 'rede caiu' } });
    expect(await cadastrarAparelho(auth, AGORA(), true)).toEqual({ tipo: 'erro', detalhe: 'rede caiu' });
    expect(chamadas).toEqual([]);
  });

  it('enroll que falha vira erro com o detalhe', async () => {
    const { auth } = supabaseFalso();
    auth.mfa.enroll = async () => ({ data: null, error: { message: 'too many' } });
    expect(await cadastrarAparelho(auth, AGORA(), false)).toEqual({ tipo: 'erro', detalhe: 'too many' });
  });
});

describe('QR trocado não é código inválido', () => {
  it('fator que sumiu é "substituido"; código errado é "invalido"', async () => {
    const { auth } = supabaseFalso();
    const frente = await lerEtapa(auth, abaFalsa(true).doc, AGORA);
    expect(frente).toMatchObject({ factorId: 'qr1' });
    expect(await confirmarCodigo(auth, 'qr1', '000000')).toEqual({ tipo: 'invalido' });

    await cadastrarAparelho(auth, AGORA(), false); // outra aba, vindo para a frente no meio
    expect(await confirmarCodigo(auth, 'qr1', CODIGO_CERTO)).toEqual({ tipo: 'substituido' });
    expect(await confirmarCodigo(auth, 'qr2', CODIGO_CERTO)).toEqual({ tipo: 'ok' });
  });

  it('desafio vencido conta como código a redigitar; outro erro mostra o detalhe', async () => {
    const { auth } = supabaseFalso();
    auth.mfa.challengeAndVerify = async () => ({ error: { code: 'mfa_challenge_expired', message: 'expired' } });
    expect(await confirmarCodigo(auth, 'x', CODIGO_CERTO)).toEqual({ tipo: 'invalido' });
    auth.mfa.challengeAndVerify = async () => ({ error: { code: 'over_request_rate_limit', message: 'Request rate limit reached' } });
    expect(await confirmarCodigo(auth, 'x', CODIGO_CERTO)).toEqual({ tipo: 'falha', detalhe: 'Request rate limit reached' });
    auth.mfa.challengeAndVerify = async () => ({ error: { message: 'Failed to fetch' } });
    expect(await confirmarCodigo(auth, 'x', CODIGO_CERTO)).toEqual({ tipo: 'falha', detalhe: 'Failed to fetch' });
  });
});

describe('nome do aparelho', () => {
  it('sai em horário de Brasília, não em UTC', () => {
    expect(nomeDoAparelho(new Date('2026-10-13T10:48:00Z'), false)).toBe('vertho.ai 13/10/2026 07:48');
    // virada do dia: 02:30 UTC ainda é o dia anterior em Brasília
    expect(nomeDoAparelho(new Date('2026-10-14T02:30:00Z'), false)).toBe('vertho.ai 13/10/2026 23:30');
  });

  it('a reserva tem nome próprio, e não colide com o principal cadastrado no mesmo minuto', () => {
    const agora = new Date('2026-10-13T10:48:00Z');
    expect(nomeDoAparelho(agora, true)).toBe('vertho.ai reserva 13/10/2026 07:48');
    expect(nomeDoAparelho(agora, true)).not.toBe(nomeDoAparelho(agora, false));
  });

  it('é o nome que o cadastro manda ao Supabase', async () => {
    const { auth, estado } = supabaseFalso();
    await cadastrarAparelho(auth, AGORA(), false);
    expect(estado.fatores[0].friendly_name).toBe('vertho.ai 13/10/2026 07:48');
  });
});

describe('a tela usa estas regras (e não fala com o Supabase por fora delas)', () => {
  const tela = readFileSync('app/segundo-fator/segundo-fator-cliente.tsx', 'utf8');

  it('cadastro e confirmação passam pelo módulo', () => {
    expect(tela).not.toMatch(/\.mfa\.(enroll|unenroll|challengeAndVerify|challenge|verify)\s*\(/);
    expect(tela).toMatch(/lerEtapa\(getSupabase\(\)\.auth, document,/);
    expect(tela).toMatch(/confirmarCodigo\(getSupabase\(\)\.auth,/);
    expect(tela).toMatch(/cadastrarAparelho\(getSupabase\(\)\.auth,/);
  });

  it('a carga da tela é cancelada quando ela sai', () => {
    expect(tela).toMatch(/const controle = new AbortController\(\);\s*carregar\(controle\.signal\);\s*return \(\) => controle\.abort\(\);/);
  });

  it('QR trocado tem texto e botão próprios nos quatro idiomas', () => {
    expect(tela).toMatch(/resultado\.tipo === 'substituido'\) \{ setErroCodigo\(t\('errorReplaced'\)\); setQrTrocado\(true\)/);
    for (const idioma of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const textos = JSON.parse(readFileSync(`messages/${idioma}.json`, 'utf8')).SegundoFator;
      expect(textos.errorReplaced, idioma).toBeTruthy();
      expect(textos.newQr, idioma).toBeTruthy();
      expect(textos.errorReplaced, idioma).not.toBe(textos.errorInvalid);
    }
  });
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn((destino: string) => { throw new Error(`NEXT_REDIRECT ${destino}`); }),
}));

describe('/admin leva ao painel', () => {
  it('a raiz do /admin existe e aponta para /admin/dashboard (era 404)', async () => {
    const { default: AdminRaiz } = await import('@/app/admin/page');
    expect(() => AdminRaiz()).toThrow('NEXT_REDIRECT /admin/dashboard');
  });
});
