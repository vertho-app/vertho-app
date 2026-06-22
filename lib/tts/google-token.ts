/**
 * Access token do Google Cloud (Vertex AI) a partir de uma SERVICE ACCOUNT, SEM
 * dependência externa: assina um JWT RS256 com `crypto` e troca por token no
 * oauth2. Token cacheado em memória até ~1min antes de expirar.
 *
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — o JSON da SA (string crua OU base64; base64
 *     evita dor de cabeça com quebras de linha do private_key em painéis de env).
 *   GOOGLE_VERTEX_PROJECT — opcional; default = project_id do JSON da SA.
 */
import crypto from 'node:crypto';

interface ServiceAccount { client_email: string; private_key: string; token_uri: string; project_id: string }

let tokenCache: { token: string; exp: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não definido (necessário p/ Vertex TTS)');
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    try { json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
    catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido (não é JSON nem base64-JSON)'); }
  }
  if (!json.client_email || !json.private_key) throw new Error('service account JSON sem client_email/private_key');
  return {
    client_email: json.client_email,
    private_key: String(json.private_key).replace(/\\n/g, '\n'), // tolera \n escapado
    token_uri: json.token_uri || 'https://oauth2.googleapis.com/token',
    project_id: json.project_id,
  };
}

/** project_id efetivo (env tem prioridade sobre o do JSON da SA). */
export function vertexProjectId(): string {
  const p = process.env.GOOGLE_VERTEX_PROJECT || loadServiceAccount().project_id;
  if (!p) throw new Error('GOOGLE_VERTEX_PROJECT ausente e sem project_id na SA');
  return p;
}

/** Access token cloud-platform, cacheado até ~1min antes de expirar. */
export async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;

  const sa = loadServiceAccount();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data?.access_token) throw new Error('Google token: resposta sem access_token');
  tokenCache = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600) };
  return tokenCache.token;
}
