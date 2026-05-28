/**
 * Dispara um Cloud Run Job (execução pontual) a partir do Next.
 *
 * O render de vídeo (Veo + TTS + FFmpeg) é pesado/assíncrono e NÃO cabe em
 * função serverless da Vercel — roda num Cloud Run Job. Aqui só autenticamos
 * com uma service account e chamamos a Run Admin API passando o CONTEUDO_ID
 * como override de env do container. O Job atualiza o Supabase ao concluir.
 *
 * Env necessárias:
 *  - GCP_PROJECT_ID        ex: vertho-prod
 *  - GCP_REGION            ex: southamerica-east1
 *  - GCP_VIDEO_JOB         nome do Cloud Run Job  ex: vertho-video-render
 *  - GCP_SA_KEY            JSON da service account (string), ou base64 do JSON
 */

import crypto from 'node:crypto';

interface SaKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function loadSaKey(): SaKey {
  const raw = process.env.GCP_SA_KEY;
  if (!raw) throw new Error('GCP_SA_KEY not set');
  const json = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  const key = JSON.parse(json) as SaKey;
  if (!key.client_email || !key.private_key) throw new Error('GCP_SA_KEY inválida');
  return key;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Mint de access token OAuth2 via JWT assertion (sem dependência externa). */
async function getAccessToken(sa: SaKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`GCP token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('GCP token: resposta sem access_token');
  return data.access_token as string;
}

/**
 * Dispara uma execução do Cloud Run Job de render passando o CONTEUDO_ID.
 * Retorna o nome da operação/execução. Lança em erro.
 */
export async function triggerVideoRenderJob(conteudoId: string): Promise<string> {
  const project = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION;
  const job = process.env.GCP_VIDEO_JOB;
  if (!project || !region || !job) throw new Error('GCP_PROJECT_ID / GCP_REGION / GCP_VIDEO_JOB não configurados');

  const sa = loadSaKey();
  const token = await getAccessToken(sa);

  const url = `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${job}:run`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [{ env: [{ name: 'CONTEUDO_ID', value: conteudoId }] }],
      },
    }),
  });
  if (!res.ok) throw new Error(`Cloud Run jobs:run ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.name || 'execution-started';
}
