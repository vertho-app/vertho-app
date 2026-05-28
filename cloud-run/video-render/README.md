# Vertho — Render de vídeo (Cloud Run Job)

Monta o vídeo de microlearning (16:9 1280x720) a partir do **plano** gerado
pelo app: clipes **Veo** (b-roll) + voice-over **Charon** (Gemini TTS) montados
com **FFmpeg**. Sem legendas, sem lip-sync, sem texto na tela.

O app (Next/Vercel) faz a parte barata (gera o plano JSON, sobe no Storage) e
**dispara este Job** via Cloud Run Admin API, passando `CONTEUDO_ID`. O Job
gera os clipes/voz, monta o MP4, sobe no Supabase Storage e atualiza a linha.

## Pré-requisitos

- `gcloud` autenticado (`gcloud auth login`) num projeto com billing.
- APIs: `run.googleapis.com`, `artifactregistry.googleapis.com`,
  `cloudbuild.googleapis.com`, `aiplatform.googleapis.com` (ou acesso Veo via
  Gemini API key — é o que este código usa).
- Acesso ao **Veo** (`veo-3.1-lite-generate-preview`) na sua `GEMINI_API_KEY`.

## Variáveis

| Onde | Var | Valor |
|------|-----|-------|
| Job  | `GEMINI_API_KEY` | chave Gemini (Veo + TTS) — use Secret Manager |
| Job  | `SUPABASE_URL` | `https://<ref>.supabase.co` |
| Job  | `SUPABASE_SERVICE_ROLE_KEY` | service role — use Secret Manager |
| Job  | `LOGO_URL` *(opcional)* | PNG do logo Vertho (overlay abertura/fecho) |
| Job  | `VEO_MODEL` *(opcional)* | default `veo-3.1-lite-generate-preview` |
| Job  | `VEO_RESOLUTION` *(opcional)* | ex: `720p` |
| Vercel | `GCP_PROJECT_ID` / `GCP_REGION` / `GCP_VIDEO_JOB` | projeto / região / nome do job |
| Vercel | `GCP_SA_KEY` | JSON da service account que dispara o job (string ou base64) |

## Deploy (uma vez)

```bash
PROJECT=vertho-prod
REGION=southamerica-east1
REPO=vertho
JOB=vertho-video-render
IMG="$REGION-docker.pkg.dev/$PROJECT/$REPO/$JOB:latest"

gcloud config set project $PROJECT
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

# Artifact Registry + build da imagem
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION 2>/dev/null || true
gcloud builds submit --tag "$IMG" .

# Segredos
printf '%s' "$GEMINI_API_KEY"            | gcloud secrets create GEMINI_API_KEY --data-file=- 2>/dev/null || printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=- 2>/dev/null || printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=-

# Service account do Job (lê segredos)
gcloud iam service-accounts create vertho-video-job --display-name="Vertho video render job" 2>/dev/null || true
JOB_SA="vertho-video-job@$PROJECT.iam.gserviceaccount.com"
for S in GEMINI_API_KEY SUPABASE_SERVICE_ROLE_KEY; do
  gcloud secrets add-iam-policy-binding $S --member="serviceAccount:$JOB_SA" --role=roles/secretmanager.secretAccessor
done

# Cria/atualiza o Job (4Gi/2vCPU, timeout 1h — Veo é lento)
gcloud run jobs create $JOB \
  --image="$IMG" --region=$REGION --service-account=$JOB_SA \
  --memory=4Gi --cpu=2 --task-timeout=3600 --max-retries=1 \
  --set-env-vars="SUPABASE_URL=https://<ref>.supabase.co" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest" \
  2>/dev/null \
  || gcloud run jobs update $JOB --image="$IMG" --region=$REGION \
       --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"

# Service account que o APP usa pra disparar o Job (a partir da Vercel)
gcloud iam service-accounts create vertho-video-trigger --display-name="Vertho video trigger" 2>/dev/null || true
TRIG_SA="vertho-video-trigger@$PROJECT.iam.gserviceaccount.com"
gcloud run jobs add-iam-policy-binding $JOB --region=$REGION --member="serviceAccount:$TRIG_SA" --role=roles/run.invoker
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$TRIG_SA" --role=roles/run.developer
gcloud iam service-accounts keys create trigger-key.json --iam-account=$TRIG_SA
# -> conteúdo de trigger-key.json vai em GCP_SA_KEY na Vercel (depois apague o arquivo)
```

Na Vercel, configure: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_VIDEO_JOB=vertho-video-render`,
`GCP_SA_KEY` (conteúdo do `trigger-key.json`). Rode a migration `124-video-render-status.sql`.

## Atualizar a imagem

```bash
gcloud builds submit --tag "$IMG" . && gcloud run jobs update $JOB --image="$IMG" --region=$REGION
```

## Rodar manualmente (debug)

```bash
gcloud run jobs execute $JOB --region=$REGION --update-env-vars=CONTEUDO_ID=<uuid>
```

## Notas

- `veo-3.1-lite-generate-preview` é **preview**: se o schema da resposta mudar,
  ajuste `findVideo()` em `veo.mjs` (ele já busca `*.uri` e bytes base64).
- Custo: ~20-25 clipes Veo por vídeo. Gere o plano e confira antes de reprocessar.
- O áudio dos clipes Veo é descartado (`-an`); o voice-over Charon é a trilha principal.
