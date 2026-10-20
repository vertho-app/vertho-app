import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

/**
 * `verificarCredencialGoogle` (lib/tts/google-token.ts): a prova que o cron `credencial_google`
 * roda a cada 6 h NA VERCEL.
 *
 * `Medido 20/10/2026`: a rotação de 17/10 gravou na Vercel um valor que o código não lia, e o TTS
 * de lá falhou 3 dias sem aviso. Estes testes provam que a verificação (1) troca por token NOVO,
 * sem o cache que esconderia uma chave revogada; (2) falha alto com valor ilegível, SEM repetir o
 * valor no erro (ele é segredo); (3) não acusa por um soluço de rede; (4) falha com o Google
 * recusando a chave.
 */

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const SA = {
  client_email: 'vertho-tts@projeto-teste.iam.gserviceaccount.com',
  private_key: privateKey,
  private_key_id: 'fad6f76a0000111122223333',
  project_id: 'projeto-teste',
  token_uri: 'https://oauth2.exemplo/token',
};
const emBase64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const tokenOk = () => new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;

async function carregar() {
  vi.resetModules(); // o cache do token é do módulo: cada teste começa sem ele
  return import('@/lib/tts/google-token');
}

beforeEach(() => {
  fetchMock = vi.fn(async () => tokenOk());
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', emBase64(SA));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('verificarCredencialGoogle', () => {
  it('devolve só o que não é segredo: o e-mail da conta e o prefixo do id da chave', async () => {
    const { verificarCredencialGoogle } = await carregar();
    await expect(verificarCredencialGoogle()).resolves.toEqual({ clientEmail: SA.client_email, chave: 'fad6f76a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(SA.token_uri);
  });

  it('🔴 troca por token NOVO mesmo com um token vivo no cache (senão chave revogada passaria por 1 h)', async () => {
    const { getGoogleAccessToken, verificarCredencialGoogle } = await carregar();
    await getGoogleAccessToken();
    await getGoogleAccessToken(); // do cache, sem rede
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await verificarCredencialGoogle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('🔴 valor ilegível (o caso de 17/10) falha alto, sem tocar a rede e sem repetir o valor no erro', async () => {
    const ilegivel = `"${emBase64(SA).slice(0, 900)}`; // aspas e corte: o tipo de colagem que quebra
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', ilegivel);
    const { verificarCredencialGoogle } = await carregar();
    const erro = await verificarCredencialGoogle().then(() => null, (e: Error) => e);
    expect(erro?.message).toMatch(/GOOGLE_SERVICE_ACCOUNT_JSON inválido/);
    expect(erro?.message).not.toContain(ilegivel.slice(1, 40));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('env ausente falha alto', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '');
    const { verificarCredencialGoogle } = await carregar();
    await expect(verificarCredencialGoogle()).rejects.toThrow(/não definido/);
  });

  it('🔴 o Google recusando a chave (revogada) falha, depois de tentar de novo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fetchMock.mockImplementation(async () => new Response('{"error":"invalid_grant","error_description":"Invalid JWT Signature."}', { status: 400 }));
    const { verificarCredencialGoogle } = await carregar();
    const resultado = expect(verificarCredencialGoogle()).rejects.toThrow(/Google token 400: .*invalid_grant/);
    await vi.advanceTimersByTimeAsync(3000);
    await resultado;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('um soluço de rede não vira alarme: a 2ª tentativa resolve', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fetchMock.mockImplementationOnce(async () => { throw new TypeError('fetch failed'); });
    const { verificarCredencialGoogle } = await carregar();
    const resultado = expect(verificarCredencialGoogle()).resolves.toMatchObject({ chave: 'fad6f76a' });
    await vi.advanceTimersByTimeAsync(3000);
    await resultado;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
