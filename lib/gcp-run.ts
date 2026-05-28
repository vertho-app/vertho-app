/**
 * Dispara um Cloud Run Job (execução pontual) a partir do Next.
 *
 * O render de vídeo (Veo + TTS + FFmpeg) é pesado/assíncrono e NÃO cabe em
 * função serverless da Vercel — roda num Cloud Run Job. Aqui autenticamos via
 * Workload Identity Federation (SEM chave longa de service account) e chamamos
 * a Run Admin API passando o CONTEUDO_ID como override de env do container.
 *
 * Fluxo de auth (federação):
 *   1. A Vercel injeta um token OIDC em VERCEL_OIDC_TOKEN (OIDC Federation ON).
 *   2. Trocamos esse token por um token federado no STS do Google.
 *   3. Com o token federado, personificamos a service account de trigger
 *      (generateAccessToken) — ela tem run.developer/run.invoker.
 *   4. Disparamos o job com o access token da SA.
 *
 * Env necessárias:
 *  - GCP_PROJECT_ID        ex: corded-photon-496113-j3
 *  - GCP_PROJECT_NUMBER    ex: 1090527423829
 *  - GCP_REGION            ex: southamerica-east1
 *  - GCP_VIDEO_JOB         nome do Cloud Run Job  ex: vertho-video-render
 *  - GCP_WIF_POOL          id do Workload Identity Pool  ex: vercel-pool
 *  - GCP_WIF_PROVIDER      id do provider OIDC           ex: vercel-oidc
 *  - GCP_TRIGGER_SA        email da SA de trigger
 *  - VERCEL_OIDC_TOKEN     injetada pela Vercel em runtime (OIDC Federation)
 */

const STS_URL = 'https://sts.googleapis.com/v1/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não configurada`);
  return v;
}

/** Troca o token OIDC da Vercel por um token federado (STS). */
async function exchangeOidcForFederated(oidcToken: string): Promise<string> {
  const projectNumber = env('GCP_PROJECT_NUMBER');
  const pool = env('GCP_WIF_POOL');
  const provider = env('GCP_WIF_PROVIDER');
  const audience =
    `//iam.googleapis.com/projects/${projectNumber}` +
    `/locations/global/workloadIdentityPools/${pool}/providers/${provider}`;

  const res = await fetch(STS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audience,
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      scope: SCOPE,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      subjectToken: oidcToken,
    }),
  });
  if (!res.ok) throw new Error(`STS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('STS: resposta sem access_token');
  return data.access_token as string;
}

/** Personifica a service account de trigger e devolve um access token dela. */
async function impersonateSa(federatedToken: string): Promise<string> {
  const sa = env('GCP_TRIGGER_SA');
  const url =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
    `${encodeURIComponent(sa)}:generateAccessToken`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${federatedToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: [SCOPE], lifetime: '300s' }),
  });
  if (!res.ok) throw new Error(`generateAccessToken ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.accessToken) throw new Error('generateAccessToken: resposta sem accessToken');
  return data.accessToken as string;
}

/** Token de acesso da SA de trigger via WIF (Vercel OIDC → STS → impersonation). */
async function getAccessToken(): Promise<string> {
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (!oidcToken) throw new Error('VERCEL_OIDC_TOKEN ausente (habilite OIDC Federation na Vercel)');
  const federated = await exchangeOidcForFederated(oidcToken);
  return impersonateSa(federated);
}

/**
 * Dispara uma execução do Cloud Run Job de render passando o CONTEUDO_ID.
 * Retorna o nome da operação/execução. Lança em erro.
 */
export async function triggerVideoRenderJob(conteudoId: string): Promise<string> {
  const project = env('GCP_PROJECT_ID');
  const region = env('GCP_REGION');
  const job = env('GCP_VIDEO_JOB');

  const token = await getAccessToken();

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
